import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { decideSweepTransactionCallback } from '../server/services/deposit-sweep.service';

const root = process.cwd();
const routeSource = fs.readFileSync(path.join(root, 'server/routes/admin-deposit.routes.ts'), 'utf8');
const adminServiceSource = fs.readFileSync(path.join(root, 'server/services/admin-deposit.service.ts'), 'utf8');
const serviceSource = fs.readFileSync(path.join(root, 'server/services/deposit-sweep.service.ts'), 'utf8');

assert.equal(
  decideSweepTransactionCallback({ status: 'PENDING', txHash: null }, 'COMPLETED', 'trx_1'),
  'APPLY',
  'pending transactions must accept a completion callback',
);
assert.equal(
  decideSweepTransactionCallback({ status: 'RUNNING', txHash: null }, 'FAILED'),
  'APPLY',
  'running transactions must accept a failure callback',
);
assert.equal(
  decideSweepTransactionCallback({ status: 'COMPLETED', txHash: 'trx_1' }, 'COMPLETED', 'trx_1'),
  'IDEMPOTENT',
  'replayed completion callbacks with the same tx hash must be acknowledged',
);
assert.equal(
  decideSweepTransactionCallback({ status: 'FAILED', txHash: null }, 'FAILED'),
  'IDEMPOTENT',
  'replayed failure callbacks must be acknowledged',
);
assert.equal(
  decideSweepTransactionCallback({ status: 'COMPLETED', txHash: 'trx_1' }, 'COMPLETED', 'trx_2'),
  'CONFLICT',
  'a different completion hash must never overwrite a terminal transaction',
);
assert.equal(
  decideSweepTransactionCallback({ status: 'FAILED', txHash: null }, 'COMPLETED', 'trx_1'),
  'CONFLICT',
  'a completion callback must never overwrite a failed transaction',
);

assert.match(routeSource, /claimAdminDepositSweepBatch\(limit\)/, 'worker claiming must use the deposit service boundary');
assert.match(routeSource, /completeAdminDepositSweepTransaction\(/, 'completion must use the deposit service boundary');
assert.match(routeSource, /failAdminDepositSweepTransaction\(/, 'failure must use the deposit service boundary');
assert.match(adminServiceSource, /claimNextSweepBatch\(tx, limit\)/, 'deposit service must use the compare-and-set worker claim');
assert.match(adminServiceSource, /completeSweepTransaction\(tx, input\)/, 'deposit service must use the idempotent completion transition');
assert.match(adminServiceSource, /failSweepTransaction\(tx, input\)/, 'deposit service must use the idempotent failure transition');
assert.match(serviceSource, /status: \{ in: \[\.\.\.ACTIVE_TRANSACTION_STATUSES\] \}/, 'terminal writes must be guarded by active status');
assert.match(serviceSource, /updateManyAndReturn\(/, 'worker claims must use a single compare-and-set statement');
assert.match(serviceSource, /id: \{ in: candidates\.map\(\(candidate\) => candidate\.id\) \}/, 'worker claims must constrain the candidate ids');

console.log('[deposit-sweep-state-guards] passed');
