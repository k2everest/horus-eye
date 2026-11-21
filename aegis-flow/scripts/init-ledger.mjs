import fs from 'node:fs';
import { PersistentLedger } from '../services/ledger-state/store.mjs';
import { assertDemoRuntime } from '../services/validation-gateway/runtime-policy.mjs';

assertDemoRuntime();
const [filename, commitmentsFile] = process.argv.slice(2);
if (!filename || !commitmentsFile) throw new Error('Usage: node init-ledger.mjs <ledger.sqlite> <public-commitments.json>');
const commitments = JSON.parse(fs.readFileSync(commitmentsFile, 'utf8'));
const ledger = new PersistentLedger({ filename, networkId: process.env.AEGIS_NETWORK_ID || 'aegis-lab-v1' });
try { console.log(JSON.stringify({ ...ledger.bootstrap({ commitments }), scope: 'trusted-offline-lab-genesis', production_ready: false })); }
finally { ledger.close(); }
