#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const STRICT = process.env.ARCHITECTURE_AUDIT_STRICT === '1';
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage']);
const API_LIFECYCLE_CONFIG = path.join(ROOT, 'config/api-lifecycle.json');

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await pathExists(filePath))) return fallback;
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function walkFiles(dir, output = []) {
  if (!(await pathExists(dir))) return output;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, output);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }
  return output;
}

function toRelative(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function stripQueryAndTemplateNoise(rawPath) {
  return String(rawPath || '')
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\?.*$/g, '')
    .replace(/#.*$/g, '')
    .replace(/\\\//g, '/')
    .trim();
}

function normalizeApiShape(rawPath) {
  const cleaned = stripQueryAndTemplateNoise(rawPath);
  if (!cleaned.startsWith('/api/')) return '';
  const parts = cleaned
    .split('/')
    .filter(Boolean)
    .map((part) => {
      if (part === 'api') return part;
      if (part.startsWith(':')) return ':param';
      if (part.includes(':param')) return ':param';
      if (/^\$\{.*\}$/.test(part)) return ':param';
      return part;
    });
  return `/${parts.join('/')}`.replace(/\/+$/g, '') || '/api';
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function addEndpoint(map, endpoint) {
  if (!endpoint.shape) return;
  const key = `${endpoint.method || 'ANY'} ${endpoint.shape}`;
  const existing = map.get(key) || { ...endpoint, files: [] };
  existing.files.push({ file: endpoint.file, line: endpoint.line, raw: endpoint.raw });
  map.set(key, existing);
}

function extractFrontendApis(content, file) {
  const results = [];
  const literalPattern = /[`'"]((?:\/api\/)(?:\\.|(?![`'"]).)+?)[`'"]/g;
  let match;
  while ((match = literalPattern.exec(content))) {
    const raw = match[1];
    const shape = normalizeApiShape(raw);
    if (!shape) continue;
    results.push({ method: 'ANY', shape, raw, file, line: lineNumberForIndex(content, match.index) });
  }
  return results;
}

function inferRouteGuard(snippet) {
  return {
    hasAuth: /\b(mustAuth|authMiddleware|adminOnly)\b/.test(snippet),
    hasAdmin: /\badminOnly\b/.test(snippet),
    hasLimiter: /\b[A-Za-z]+Limiter\b/.test(snippet),
    hasCatchAsync: /\bcatchAsync\b/.test(snippet),
  };
}

function extractServerRoutes(content, file) {
  const results = [];
  const routePattern = /\b(?:app|router)\.(get|post|put|patch|delete|use)\(\s*([`'"])(\/api\/[^`'"]*?)\2/g;
  let match;
  while ((match = routePattern.exec(content))) {
    const method = match[1].toUpperCase();
    const raw = match[3];
    const shape = normalizeApiShape(raw);
    if (!shape) continue;
    const snippet = content.slice(match.index, match.index + 700);
    results.push({ method, shape, raw, file, line: lineNumberForIndex(content, match.index), ...inferRouteGuard(snippet) });
  }
  return results;
}

function serverShapeSet(routes) {
  const exact = new Set();
  const any = new Set();
  const prefixes = new Set();
  for (const route of routes.values()) {
    exact.add(`${route.method} ${route.shape}`);
    any.add(route.shape);
    if (route.method === 'USE') prefixes.add(route.shape);
  }
  return { exact, any, prefixes };
}

function isCoveredByServer(frontendEndpoint, serverSets) {
  if (serverSets.any.has(frontendEndpoint.shape)) return true;
  for (const prefix of serverSets.prefixes) {
    if (frontendEndpoint.shape === prefix || frontendEndpoint.shape.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function renderEndpoint(endpoint) {
  const files = endpoint.files
    .slice(0, 3)
    .map((item) => `${item.file}:${item.line}`)
    .join(', ');
  const more = endpoint.files.length > 3 ? ` +${endpoint.files.length - 3}` : '';
  return `${endpoint.method.padEnd(6)} ${endpoint.shape.padEnd(54)} ${files}${more}`;
}

function isDuplicateServerRoute(route) {
  if (route.method === 'USE') return false;
  return route.files.length > 1;
}

function deprecatedRouteKey(route) {
  return `${String(route.method || 'ANY').toUpperCase()} ${normalizeApiShape(route.shape)}`;
}

function findDeprecatedEndpointUsages(frontendApis, serverRoutes, lifecycle) {
  const deprecatedRoutes = Array.isArray(lifecycle.deprecatedRoutes) ? lifecycle.deprecatedRoutes : [];
  const deprecatedByExactKey = new Map(deprecatedRoutes.map((route) => [deprecatedRouteKey(route), route]));
  const deprecatedByShape = new Map(deprecatedRoutes.map((route) => [normalizeApiShape(route.shape), route]));
  const usages = [];

  for (const endpoint of frontendApis.values()) {
    const policy = deprecatedByShape.get(endpoint.shape);
    if (policy) usages.push({ surface: 'frontend', policy, endpoint });
  }

  for (const endpoint of serverRoutes.values()) {
    const policy = deprecatedByExactKey.get(`${endpoint.method} ${endpoint.shape}`);
    if (policy) usages.push({ surface: 'server', policy, endpoint });
  }

  return usages;
}

function hasRequiredRouteGuard(route, requiredGuard) {
  if (requiredGuard === 'adminOnly') return route.hasAdmin;
  if (requiredGuard === 'authMiddleware' || requiredGuard === 'mustAuth') return route.hasAuth;
  return true;
}

function routeMatchesPrefix(route, prefixValue) {
  const prefix = normalizeApiShape(prefixValue || '');
  if (!prefix) return false;
  return route.shape === prefix || route.shape.startsWith(`${prefix}/`);
}

function findReservedPrefixViolations(serverRoutes, lifecycle) {
  const reservedRoutePrefixes = Array.isArray(lifecycle.reservedRoutePrefixes) ? lifecycle.reservedRoutePrefixes : [];
  const violations = [];
  for (const route of serverRoutes.values()) {
    for (const policy of reservedRoutePrefixes) {
      if (!routeMatchesPrefix(route, policy.prefix)) continue;
      if (hasRequiredRouteGuard(route, policy.requires)) continue;
      violations.push({ policy, endpoint: route });
    }
  }
  return violations;
}

function isPublicWriteExempt(route, lifecycle) {
  const publicWriteRoutePrefixes = Array.isArray(lifecycle.publicWriteRoutePrefixes) ? lifecycle.publicWriteRoutePrefixes : [];
  return publicWriteRoutePrefixes.some((policy) => routeMatchesPrefix(route, policy.prefix));
}

async function main() {
  const lifecycle = await readJsonIfExists(API_LIFECYCLE_CONFIG, {
    deprecatedRoutes: [],
    reservedRoutePrefixes: [],
    publicWriteRoutePrefixes: [],
  });
  const frontendFiles = await walkFiles(path.join(ROOT, 'src'));
  const serverFiles = [
    ...(await walkFiles(path.join(ROOT, 'server'))),
    path.join(ROOT, 'server.ts'),
  ].filter(Boolean);

  const frontendApis = new Map();
  const serverRoutes = new Map();

  for (const filePath of frontendFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    for (const endpoint of extractFrontendApis(content, toRelative(filePath))) {
      addEndpoint(frontendApis, endpoint);
    }
  }

  for (const filePath of serverFiles) {
    if (!(await pathExists(filePath))) continue;
    const content = await fs.readFile(filePath, 'utf8');
    for (const route of extractServerRoutes(content, toRelative(filePath))) {
      addEndpoint(serverRoutes, route);
    }
  }

  const serverSets = serverShapeSet(serverRoutes);
  const frontendUncovered = [...frontendApis.values()].filter((endpoint) => !isCoveredByServer(endpoint, serverSets));
  const duplicateServerRoutes = [...serverRoutes.values()].filter(isDuplicateServerRoute);
  const deprecatedEndpointUsages = findDeprecatedEndpointUsages(frontendApis, serverRoutes, lifecycle);
  const unsafeWrites = [...serverRoutes.values()].filter((route) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method)) return false;
    if (isPublicWriteExempt(route, lifecycle)) return false;
    return !route.hasAuth && !route.hasAdmin;
  });
  const reservedPrefixViolations = findReservedPrefixViolations(serverRoutes, lifecycle);

  console.log('\n=== API Contract Audit ===');
  console.log(`Frontend API literals: ${frontendApis.size}`);
  console.log(`Server API route literals: ${serverRoutes.size}`);

  if (frontendUncovered.length > 0) {
    console.log('\nPotential frontend API endpoints without an exact server shape:');
    frontendUncovered.slice(0, 40).forEach((endpoint) => console.log(`  - ${renderEndpoint(endpoint)}`));
    if (frontendUncovered.length > 40) console.log(`  ... ${frontendUncovered.length - 40} more`);
  } else {
    console.log('\nNo obvious frontend/server API shape gaps found.');
  }

  if (duplicateServerRoutes.length > 0) {
    console.log('\nDuplicate server route literals that should be collapsed:');
    duplicateServerRoutes.slice(0, 40).forEach((endpoint) => console.log(`  - ${renderEndpoint(endpoint)}`));
    if (duplicateServerRoutes.length > 40) console.log(`  ... ${duplicateServerRoutes.length - 40} more`);
  }

  if (deprecatedEndpointUsages.length > 0) {
    console.log('\nDeprecated API usages that should be removed:');
    deprecatedEndpointUsages.slice(0, 40).forEach(({ surface, policy, endpoint }) => {
      console.log(`  - ${surface.padEnd(8)} ${renderEndpoint(endpoint)} replacement=${policy.replacement || 'none'} reason=${policy.reason || 'deprecated'}`);
    });
    if (deprecatedEndpointUsages.length > 40) console.log(`  ... ${deprecatedEndpointUsages.length - 40} more`);
  }

  if (unsafeWrites.length > 0) {
    console.log('\nWrite routes that deserve manual auth review:');
    unsafeWrites.slice(0, 40).forEach((endpoint) => console.log(`  - ${renderEndpoint(endpoint)}`));
    if (unsafeWrites.length > 40) console.log(`  ... ${unsafeWrites.length - 40} more`);
  }

  if (reservedPrefixViolations.length > 0) {
    console.log('\nReserved API prefix violations:');
    reservedPrefixViolations.slice(0, 40).forEach(({ policy, endpoint }) => {
      console.log(`  - requires=${policy.requires || 'unknown'} ${renderEndpoint(endpoint)}`);
    });
    if (reservedPrefixViolations.length > 40) console.log(`  ... ${reservedPrefixViolations.length - 40} more`);
  }

  console.log('\nServer route inventory:');
  [...serverRoutes.values()]
    .sort((a, b) => `${a.shape} ${a.method}`.localeCompare(`${b.shape} ${b.method}`))
    .slice(0, 140)
    .forEach((endpoint) => console.log(`  ${renderEndpoint(endpoint)}`));

  const summary = {
    frontendApiCount: frontendApis.size,
    serverRouteCount: serverRoutes.size,
    potentialFrontendGaps: frontendUncovered.length,
    duplicateServerRoutes: duplicateServerRoutes.length,
    deprecatedEndpointUsages: deprecatedEndpointUsages.length,
    writeRoutesNeedingManualAuthReview: unsafeWrites.length,
    reservedPrefixViolations: reservedPrefixViolations.length,
  };
  console.log('\nSummary:', JSON.stringify(summary, null, 2));

  if (STRICT && (frontendUncovered.length || duplicateServerRoutes.length || deprecatedEndpointUsages.length || unsafeWrites.length || reservedPrefixViolations.length)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[api-contract-audit] failed:', error);
  process.exitCode = 1;
});
