import { readFileSync, statSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { PersistentLedger } from '../services/ledger-state/store.mjs';
import { notarizeNextTransfer, replayFinalizedTransfer } from '../services/ledger-state/settlement.mjs';

const [command, ...args] = process.argv.slice(2);
const allowed = new Set(['ledger', 'network', 'config', 'key', 'anchor', 'bundle', 'height']);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  const name = args[i]?.replace(/^--/, '');
  if (!args[i]?.startsWith('--') || !allowed.has(name) || !args[i + 1] || args[i + 1].startsWith('--') || name in options) throw new Error('Invalid arguments');
  options[name] = args[i + 1];
}
if (!options.ledger || !options.network || !['init', 'status', 'notarize', 'rewind', 'replay', 'export', 'verify-anchor'].includes(command)) {
  throw new Error('Usage: settlement-admin.mjs <init|status|notarize|rewind|replay|export|verify-anchor> --ledger PATH --network ID [--config PATH] [--key PATH --anchor PATH] [--bundle PATH] [--height N]');
}
const json = path => JSON.parse(readFileSync(path, 'utf8'));
if (['notarize', 'rewind', 'verify-anchor'].includes(command) && !options.anchor) throw new Error('TRUSTED_EXTERNAL_ANCHOR_REQUIRED');
const anchor = options.anchor ? json(options.anchor) : undefined;
// Replay starts behind the trusted watermark: replay bundles first, then run
// verify-anchor before serving or enabling the authority. It never signs.
const ledger = new PersistentLedger({ filename: options.ledger, networkId: options.network,
  trustedFinalizedCheckpoint: command === 'replay' ? undefined : anchor });
try {
  let result;
  if (command === 'init') {
    if (!options.config) throw new Error('CONFIG_REQUIRED');
    result = ledger.configureSettlement(json(options.config));
  } else if (command === 'status' || command === 'verify-anchor') result = ledger.settlementStatus() ?? { status: 'SETTLEMENT_NOT_CONFIGURED' };
  else if (command === 'export') {
    result = ledger.finalizedBlock(Number(options.height));
    if (!result) throw new Error('FINALIZED_BLOCK_NOT_FOUND');
  } else if (command === 'replay') {
    if (!options.bundle) throw new Error('BUNDLE_REQUIRED');
    result = await replayFinalizedTransfer({ ledger, ...json(options.bundle) });
  } else {
    const state = ledger.settlementStatus();
    if (!state || state.finalized.height !== anchor.height || state.finalized.checkpoint_id !== anchor.checkpoint_id) throw new Error('ANCHOR_NOT_AT_FINALIZED_HEAD');
    if (command === 'rewind') result = ledger.rewindToFinalized({ expectedFinalizedCheckpointId: anchor.checkpoint_id });
    else {
      if (!options.key || (statSync(options.key).mode & 0o077) !== 0) throw new Error('PRIVATE_KEY_FILE_REQUIRES_MODE_0600');
      const privateKey = createPrivateKey(readFileSync(options.key));
      result = await notarizeNextTransfer({ ledger, privateKey });
    }
  }
  console.log(JSON.stringify(result, null, 2));
} finally { ledger.close(); }
