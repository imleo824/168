import crypto from 'crypto';
import prisma, { isDbConfigured } from '../db';
import { ConfigService } from '../config.service';
import { TransactionAction } from '../../shared/domain';

export const TRON_USDT_DECIMALS = 6;
export const TRON_DEFAULT_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TRON_ADDRESS_PATTERN = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const TRONGRID_BASE_URL = 'https://api.trongrid.io';
const RECHARGE_ORDER_SCAN_GRACE_MS = 60 * 1000;
const DEPOSIT_ADDRESS_PROVIDER_TIMEOUT_MS = 5000;
const RECHARGE_ORDER_SCAN_CLAIM_TTL_MS = 25 * 1000;

export const RECHARGE_STATUS = {
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  CREDITED: 'CREDITED',
  EXPIRED: 'EXPIRED',
  BELOW_MINIMUM: 'BELOW_MINIMUM',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
} as const;

class HttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseBooleanConfigFlag(value: unknown, defaultValue = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return defaultValue;
}

function isValidTronAddress(value: unknown) {
  return typeof value === 'string' && TRON_ADDRESS_PATTERN.test(value.trim());
}

const TRON_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buffer: Buffer) {
  let value = BigInt(`0x${buffer.toString('hex') || '0'}`);
  let encoded = '';
  while (value > 0n) {
    const mod = Number(value % 58n);
    encoded = TRON_BASE58_ALPHABET[mod] + encoded;
    value /= 58n;
  }
  for (const byte of buffer) {
    if (byte === 0) encoded = `1${encoded}`;
    else break;
  }
  return encoded || '1';
}

function tronHexAddressToBase58(value: string) {
  const raw = `${value || ''}`.trim().replace(/^0x/i, '');
  const hex = raw.length === 40 ? `41${raw}` : raw;
  if (!/^41[0-9a-f]{40}$/i.test(hex)) return '';
  const payload = Buffer.from(hex, 'hex');
  const checksum = crypto
    .createHash('sha256')
    .update(crypto.createHash('sha256').update(payload).digest())
    .digest()
    .subarray(0, 4);
  return encodeBase58(Buffer.concat([payload, checksum]));
}

export function normalizeTronAddress(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (isValidTronAddress(trimmed)) return trimmed;
  const base58 = tronHexAddressToBase58(trimmed);
  return isValidTronAddress(base58) ? base58 : '';
}

function getDepositAddressProviderConfig() {
  const url = String(process.env.TRON_DEPOSIT_ADDRESS_PROVIDER_URL || '').trim();
  const secret = String(process.env.TRON_DEPOSIT_ADDRESS_PROVIDER_SECRET || '').trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return null;
    return { url: parsed.toString(), secret };
  } catch {
    return null;
  }
}

async function requestDepositAddressFromProvider(params: {
  userId: string;
  requestId?: string;
}) {
  const provider = getDepositAddressProviderConfig();
  if (!provider) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEPOSIT_ADDRESS_PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(provider.secret ? { Authorization: `Bearer ${provider.secret}` } : {}),
      },
      body: JSON.stringify({
        userId: params.userId,
        requestId: params.requestId,
        chain: 'TRON',
        token: 'USDT',
        network: 'TRC20',
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : `provider_http_${response.status}`);
    }

    const address = normalizeTronAddress(payload?.address);
    if (!address) {
      throw new Error('provider_returned_invalid_address');
    }

    const rawIndex = Number(payload?.derivationIndex ?? payload?.index);
    const derivationIndex = Number.isSafeInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
    const derivationPath = typeof payload?.derivationPath === 'string'
      ? payload.derivationPath.trim().slice(0, 120)
      : derivationIndex !== null
        ? `m/44'/195'/0'/0/${derivationIndex}`
        : null;

    return { address, derivationIndex, derivationPath };
  } catch (error: any) {
    console.warn('[deposit-address-provider] failed:', error?.message || error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getDepositAddressProviderRetryDelayMs(attempt: number) {
  return Math.min(250 * (attempt + 1), 1200);
}

async function requestDepositAddressFromProviderWithRetry(params: {
  userId: string;
  requestId?: string;
  retries?: number;
}) {
  const attempts = Math.max(1, Math.min(4, Number(params.retries || 2)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const address = await requestDepositAddressFromProvider({
      userId: params.userId,
      requestId: params.requestId,
    });
    if (address) return address;
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => setTimeout(resolve, getDepositAddressProviderRetryDelayMs(attempt)));
    }
  }
  return null;
}

export async function ensureUserDepositAddress(
  userId: string,
  options: { fallbackAddress?: unknown; allowPoolAssignment?: boolean } = {},
): Promise<{ address: string; autoCredit: boolean; source: 'pool' | 'hd' | 'fallback' }> {
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existingUser) throw new HttpError('用户不存在', 404);

  const existingAssigned = await prisma.depositAddress.findUnique({
    where: { userId },
    select: { address: true, status: true, source: true },
  });
  if (existingAssigned?.address) {
    if (existingAssigned.status !== 'ASSIGNED') {
      throw new HttpError('充值地址状态异常，请联系管理员', 500);
    }
    const source =
      existingAssigned.source === 'HD'
        ? 'hd'
        : existingAssigned.source === 'FALLBACK'
          ? 'fallback'
          : 'pool';
    return {
      address: existingAssigned.address,
      autoCredit: source !== 'fallback',
      source,
    };
  }

  if (!options.allowPoolAssignment) {
    const fallbackAddress = normalizeTronAddress(options.fallbackAddress);
    if (fallbackAddress) return { address: fallbackAddress, autoCredit: false, source: 'fallback' };
    throw new HttpError('充值通道暂不可用，请稍后再试', 503);
  }

  const providerAddress = await requestDepositAddressFromProviderWithRetry({ userId, retries: 2 });
  if (providerAddress) {
    const assigned = await prisma.$transaction(async (tx) => {
      const existingAddress = await tx.depositAddress.findUnique({
        where: { address: providerAddress.address },
        select: { id: true, userId: true, status: true },
      });
      if (existingAddress && existingAddress.userId !== userId) {
        throw new HttpError('充值地址已被占用，请稍后再试', 503);
      }
      return tx.depositAddress.upsert({
        where: { userId },
        create: {
          userId,
          address: providerAddress.address,
          chain: 'TRON',
          token: 'USDT',
          network: 'TRC20',
          source: 'HD',
          derivationIndex: providerAddress.derivationIndex,
          derivationPath: providerAddress.derivationPath,
          status: 'ASSIGNED',
        },
        update: {
          address: providerAddress.address,
          chain: 'TRON',
          token: 'USDT',
          network: 'TRC20',
          source: 'HD',
          derivationIndex: providerAddress.derivationIndex,
          derivationPath: providerAddress.derivationPath,
          status: 'ASSIGNED',
        },
        select: { address: true },
      });
    });
    return { address: assigned.address, autoCredit: true, source: 'hd' };
  }

  const reusable = await prisma.depositAddress.findFirst({
    where: {
      status: 'AVAILABLE',
      userId: null,
      chain: 'TRON',
      token: 'USDT',
      network: 'TRC20',
    },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, address: true },
  });

  if (reusable?.address) {
    const claimed = await prisma.depositAddress.updateMany({
      where: {
        id: reusable.id,
        status: 'AVAILABLE',
        userId: null,
      },
      data: {
        userId,
        status: 'ASSIGNED',
        source: 'POOL',
      },
    });
    if (claimed.count === 1) return { address: reusable.address, autoCredit: true, source: 'pool' };
  }

  const fallbackAddress = normalizeTronAddress(options.fallbackAddress);
  if (fallbackAddress) return { address: fallbackAddress, autoCredit: false, source: 'fallback' };
  throw new HttpError('充值地址池为空，请联系管理员补充地址', 503);
}

export function getRechargeOrderScanMaxAttempts(configs: any) {
  const value = Number(configs?.tron_deposit_scan_max_attempts || 30);
  return Math.max(1, Math.min(200, Number.isFinite(value) ? Math.round(value) : 30));
}

export function getRechargeOrderScanWindowMinutes(configs: any) {
  const value = Number(configs?.tron_deposit_scan_window_minutes || 90);
  return Math.max(5, Math.min(24 * 60, Number.isFinite(value) ? Math.round(value) : 90));
}

export function getRechargeOrderScanWindowMs(configs: any) {
  return getRechargeOrderScanWindowMinutes(configs) * 60 * 1000;
}

export function calculateRechargePoints(amountUsdt: unknown, pointsPerUsdt: unknown) {
  const amount = Number(amountUsdt);
  const rate = Math.max(1, Number(pointsPerUsdt || 10));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate)) return 0;
  return Math.floor(amount * rate);
}

export function getRechargeOrderExpiryMinutes(configs: any) {
  const value = Number(configs?.recharge_order_expiry_minutes || 30);
  return Math.max(5, Math.min(24 * 60, Number.isFinite(value) ? Math.round(value) : 30));
}

export async function prepareRechargeOrderScanFields(options: { createdAt?: Date; configs?: any } = {}) {
  const configs = options.configs ?? await ConfigService.getConfigs();
  const base = options.createdAt || new Date();
  return {
    scanStartedAt: base,
    scanExpiresAt: new Date(base.getTime() + getRechargeOrderScanWindowMinutes(configs) * 60 * 1000),
    scanAttempts: 0,
  };
}

async function fetchTronUsdtTransfers(address: string, contractAddress: string, options: { since?: Date; minTimestamp?: number; fingerprint?: string; limit?: number } = {}) {
  const normalized = normalizeTronAddress(address);
  if (!normalized) return { events: [], meta: { fingerprint: '' } };
  const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
  const params = new URLSearchParams({
    only_confirmed: 'true',
    limit: String(limit),
    contract_address: normalizeTronAddress(contractAddress) || TRON_DEFAULT_USDT_CONTRACT,
    order_by: 'block_timestamp,desc',
  });
  const minTimestamp = Number(options.minTimestamp || (options.since ? options.since.getTime() - RECHARGE_ORDER_SCAN_GRACE_MS : 0));
  if (minTimestamp > 0) params.set('min_timestamp', String(Math.max(0, Math.floor(minTimestamp))));
  if (options.fingerprint) params.set('fingerprint', options.fingerprint);

  const headers: Record<string, string> = { accept: 'application/json' };
  const apiKey = String(process.env.TRONGRID_API_KEY || '').trim();
  if (apiKey) headers['TRON-PRO-API-KEY'] = apiKey;

  const response = await fetch(`${TRONGRID_BASE_URL}/v1/accounts/${normalized}/transactions/trc20?${params.toString()}`, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`trongrid_${response.status}:${body.slice(0, 120)}`);
  }
  const payload = await response.json().catch(() => ({}));
  const rawEvents = Array.isArray(payload?.data) ? payload.data : [];
  const events = rawEvents.map((event: any) => ({
    txId: String(event?.transaction_id || '').trim(),
    to: normalizeTronAddress(event?.to),
    from: normalizeTronAddress(event?.from),
    value: String(event?.value || '').trim(),
    tokenDecimal: Number(event?.token_info?.decimals || TRON_USDT_DECIMALS),
    contractAddress: normalizeTronAddress(event?.token_info?.address || event?.contract_address),
    blockTimestamp: Number(event?.block_timestamp || 0),
  })).filter((event: any) => event.txId && event.to && event.value);
  return { events, meta: { fingerprint: String(payload?.meta?.fingerprint || '') } };
}

function parseTokenAmount(value: string, decimals: number) {
  const raw = BigInt(value || '0');
  const divisor = 10n ** BigInt(decimals);
  return Number(raw) / Number(divisor);
}

export async function creditRechargeOrderFromEvent(params: {
  order: { id: string; userId: string | null; usdtAmount?: unknown; toAddress?: string | null };
  event: { txId: string; to: string; value: string; tokenDecimal: number; contractAddress?: string; blockTimestamp?: number };
  contractAddress: string;
  pointsPerUsdt: number;
  minUsdt: number;
}) {
  const toAddress = normalizeTronAddress(params.order.toAddress || '');
  if (!toAddress || normalizeTronAddress(params.event.to) !== toAddress) return { applied: false, reason: 'address_mismatch' };
  if (params.event.contractAddress && normalizeTronAddress(params.event.contractAddress) !== normalizeTronAddress(params.contractAddress)) return { applied: false, reason: 'contract_mismatch' };
  const amountUsdt = parseTokenAmount(params.event.value, params.event.tokenDecimal || TRON_USDT_DECIMALS);
  if (amountUsdt < params.minUsdt) {
    const updated = await prisma.order.updateMany({
      where: { id: params.order.id, status: RECHARGE_STATUS.WAITING_PAYMENT },
      data: {
        status: RECHARGE_STATUS.BELOW_MINIMUM,
        statusReason: 'below_minimum',
        txHash: params.event.txId,
        lastScannedAt: new Date(),
      },
    });
    return { applied: updated.count > 0, reason: 'below_minimum' };
  }

  const credited = await prisma.$transaction(async (tx) => {
    const existingTx = await tx.pointTransaction.findFirst({
      where: {
        referenceId: params.event.txId,
        action: TransactionAction.RECHARGE as any,
      },
      select: { id: true },
    });
    if (existingTx) return { duplicate: true };

    const updatedOrder = await tx.order.updateMany({
      where: { id: params.order.id, status: RECHARGE_STATUS.WAITING_PAYMENT },
      data: {
        status: RECHARGE_STATUS.CREDITED,
        statusReason: 'credited',
        txHash: params.event.txId,
        lastScannedAt: new Date(),
      },
    });
    if (updatedOrder.count === 0) return { duplicate: true };

    await tx.pointTransaction.create({
      data: {
        userId: params.order.userId || '',
        action: TransactionAction.RECHARGE as any,
        amount: Math.floor(amountUsdt * params.pointsPerUsdt),
        referenceType: 'ORDER',
        referenceId: params.event.txId,
        metadata: {
          orderId: params.order.id,
          txHash: params.event.txId,
          chain: 'TRON',
          token: 'USDT',
          amountUsdt,
          pointsPerUsdt: params.pointsPerUsdt,
          blockTimestamp: params.event.blockTimestamp || null,
        },
      },
    });
    return { duplicate: false };
  });

  return credited.duplicate ? { applied: false, reason: 'duplicate_or_already_processed' } : { applied: true, reason: 'credited' };
}

export async function scanRechargeOrder(params: {
  order: { id: string; userId: string | null; toAddress?: string | null; usdtAmount?: unknown; createdAt?: Date; scanStartedAt?: Date | null; scanAttempts?: number | null };
  contractAddress?: string;
  pointsPerUsdt?: number;
  minUsdt?: number;
  claimedByScanner?: boolean;
}) {
  const address = normalizeTronAddress(params.order.toAddress || '');
  if (!address) return { applied: false, reason: 'missing_address' };
  const configs = await ConfigService.getConfigs();
  const contractAddress = normalizeTronAddress(params.contractAddress || configs?.tron_usdt_contract || TRON_DEFAULT_USDT_CONTRACT) || TRON_DEFAULT_USDT_CONTRACT;
  const pointsPerUsdt = Math.max(1, Number(params.pointsPerUsdt || configs?.recharge_points_per_usdt || 10));
  const minUsdt = Math.max(0, Number(params.minUsdt || configs?.tron_deposit_min_usdt || 1));
  const start = params.order.scanStartedAt || params.order.createdAt || new Date(Date.now() - getRechargeOrderScanWindowMinutes(configs) * 60 * 1000);
  const maxAttempts = getRechargeOrderScanMaxAttempts(configs);
  const pages = Math.max(1, Math.min(4, Math.ceil(maxAttempts / 10)));

  let fingerprint = '';
  let matched = false;
  for (let page = 0; page < pages; page += 1) {
    const payload = await fetchTronUsdtTransfers(address, contractAddress, { since: start, fingerprint, limit: 50 });
    const events = payload.events;
    for (const event of events) {
      const amountUsdt = parseTokenAmount(event.value, event.tokenDecimal || TRON_USDT_DECIMALS);
      if (amountUsdt <= 0) continue;
      const expected = Number(params.order.usdtAmount || 0);
      if (expected > 0 && amountUsdt + 1e-9 < expected) continue;

      const duplicate = await prisma.pointTransaction.findFirst({
        where: {
          referenceId: event.txId,
          action: TransactionAction.RECHARGE as any,
        },
        select: { id: true },
      });
      if (duplicate) {
        matched = true;
        const duplicateOrderUpdated = await prisma.order.updateMany({
          where: {
            id: params.order.id,
            status: RECHARGE_STATUS.WAITING_PAYMENT,
          },
          data: {
            status: RECHARGE_STATUS.FAILED,
            statusReason: 'duplicate_tx',
            lastScannedAt: new Date(),
          },
        });
        if (duplicateOrderUpdated.count > 0) {
          return { applied: false, reason: 'duplicate_tx' };
        }

        continue;
      }
      matched = true;
      return creditRechargeOrderFromEvent({
        order: params.order,
        event,
        contractAddress,
        pointsPerUsdt,
        minUsdt,
      });
    }
    fingerprint = typeof payload?.meta?.fingerprint === 'string' ? payload.meta.fingerprint : '';
    if (!fingerprint || events.length === 0) break;
  }

  await prisma.order.update({
    where: { id: params.order.id },
    data: {
      ...(params.claimedByScanner ? {} : { scanAttempts: { increment: 1 } }),
      lastScannedAt: new Date(),
    },
  });
  return { applied: false, reason: matched ? 'not_creditable' : 'not_found' };
}

export async function claimRechargeOrderForScan(
  orderId: string,
  maxAttempts: number,
  options: { claimWindowMs?: number } = {},
) {
  const now = new Date();
  const claimWindowMs = Math.max(0, Number(options.claimWindowMs ?? RECHARGE_ORDER_SCAN_CLAIM_TTL_MS));
  const claimWindow = new Date(now.getTime() - claimWindowMs);

  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: RECHARGE_STATUS.WAITING_PAYMENT as any,
      autoCredit: true,
      scanAttempts: { lt: maxAttempts },
      scanExpiresAt: { gt: now },
      OR: [
        { lastScannedAt: null },
        { lastScannedAt: { lt: claimWindow } },
      ],
    },
    data: {
      scanAttempts: { increment: 1 },
      lastScannedAt: now,
    },
  });

  return claimed.count > 0;
}

let tronDepositScannerRunning = false;
let tronDepositScannerStopped = true;
let tronDepositScannerTimer: ReturnType<typeof setTimeout> | null = null;

function getDepositScanBatchSize() {
  return Math.max(1, Math.min(100, Number(process.env.TRON_DEPOSIT_SCAN_BATCH_SIZE || 30)));
}

async function getDepositScanIntervalMs() {
  try {
    const configs = await ConfigService.getConfigs();
    const seconds = Number(configs?.tron_deposit_scan_interval_seconds || 20);
    return Math.max(10, Math.min(300, Number.isFinite(seconds) ? seconds : 20)) * 1000;
  } catch {
    return 20 * 1000;
  }
}

export async function scanTronDepositsOnce() {
  if (tronDepositScannerRunning || !isDbConfigured()) return;
  tronDepositScannerRunning = true;

  try {
    const configs = await ConfigService.getConfigs();
    const enabled = parseBooleanConfigFlag(configs?.tron_deposit_scan_enabled, true);
    if (!enabled) return;

    const maxAttempts = getRechargeOrderScanMaxAttempts(configs);
    const now = new Date();
    await prisma.order.updateMany({
      where: {
        status: RECHARGE_STATUS.WAITING_PAYMENT as any,
        OR: [
          { scanExpiresAt: { lt: now } },
          { scanAttempts: { gte: maxAttempts } },
        ],
      },
      data: {
        status: RECHARGE_STATUS.EXPIRED,
        statusReason: 'scan_window_expired',
        lastScannedAt: now,
      },
    });

    const pendingOrders = await prisma.order.findMany({
      where: {
        status: RECHARGE_STATUS.WAITING_PAYMENT as any,
        autoCredit: true,
        toAddress: { not: null },
        OR: [
          { lastScannedAt: null },
          { lastScannedAt: { lt: new Date(now.getTime() - RECHARGE_ORDER_SCAN_CLAIM_TTL_MS) } },
        ],
        scanExpiresAt: { gt: now },
        scanAttempts: { lt: maxAttempts },
      },
      orderBy: [
        { lastScannedAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      take: getDepositScanBatchSize(),
      select: {
        id: true,
        userId: true,
        toAddress: true,
        usdtAmount: true,
        createdAt: true,
        scanStartedAt: true,
        scanAttempts: true,
      },
    });
    if (pendingOrders.length === 0) return;

    const contractAddress = normalizeTronAddress(configs?.tron_usdt_contract || TRON_DEFAULT_USDT_CONTRACT) || TRON_DEFAULT_USDT_CONTRACT;
    const pointsPerUsdt = Math.max(1, Number(configs?.recharge_points_per_usdt || 10));
    const minUsdt = Math.max(0, Number(configs?.tron_deposit_min_usdt || 1));

    for (const order of pendingOrders) {
      const claimed = await claimRechargeOrderForScan(order.id, maxAttempts);
      if (!claimed) continue;
      try {
        await scanRechargeOrder({
          order,
          contractAddress,
          pointsPerUsdt,
          minUsdt,
          claimedByScanner: true,
        });
      } catch (error: any) {
        console.warn('[tron-deposit-scan] order failed:', order.id, error?.message || error);
        await prisma.order.update({
          where: { id: order.id },
          data: {
            lastScannedAt: new Date(),
          },
        }).catch(() => {});
      }
    }
  } catch (error: any) {
    console.warn('[tron-deposit-scan] failed:', error?.message || error);
  } finally {
    tronDepositScannerRunning = false;
  }
}

function scheduleTronDepositScanner(delayMs: number) {
  if (tronDepositScannerStopped || !isDbConfigured()) return;
  tronDepositScannerTimer = setTimeout(() => {
    tronDepositScannerTimer = null;
    void (async () => {
      await scanTronDepositsOnce();
      if (!tronDepositScannerStopped) scheduleTronDepositScanner(await getDepositScanIntervalMs());
    })();
  }, delayMs);
  tronDepositScannerTimer.unref?.();
}

export function startTronDepositScanner() {
  if (tronDepositScannerTimer || !isDbConfigured()) return;
  tronDepositScannerStopped = false;
  scheduleTronDepositScanner(1000);
}
export function stopTronDepositScanner() {
  tronDepositScannerStopped = true;
  if (!tronDepositScannerTimer) return;
  clearTimeout(tronDepositScannerTimer);
  tronDepositScannerTimer = null;
}
