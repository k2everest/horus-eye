import { PersistentLedger } from '../services/ledger-state/store.mjs';
const [filename, destination] = process.argv.slice(2);
if (!filename || !destination) throw new Error('Usage: node backup-ledger.mjs <ledger.sqlite> <new-backup.sqlite>');
const ledger = new PersistentLedger({ filename, networkId: process.env.AEGIS_NETWORK_ID || 'aegis-lab-v1' });
try { await ledger.backupTo(destination); console.log('Consistent SQLite backup complete.'); }
finally { ledger.close(); }
