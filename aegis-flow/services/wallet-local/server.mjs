import {acquireProfileLock} from '../operational-security/profile-lock.mjs';
import {PowWallet} from '../open-chain/wallet.mjs';
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalWallet } from './wallet.mjs';
import { readBearerSecret } from '../operational-security/access.mjs';
import { assertDemoRuntime } from '../validation-gateway/runtime-policy.mjs';

export function createWalletServer({ wallet, token, allowedOrigin = 'http://localhost:8080', port = 8765, idleMs = 300_000, onDisposed = () => {} }) {
  assertDemoRuntime();
  if (!/^[0-9a-f]{64}$/.test(token) || new URL(allowedOrigin).origin !== allowedOrigin || !Number.isSafeInteger(idleMs) || idleMs < 1000) throw new Error('INVALID_LOCAL_WALLET_SERVER_CONFIG');
  let active = false; let touched = Date.now(); let failedUnlocks = 0; let attemptWindow = Date.now();
  const server = http.createServer(async (req, res) => {
    const reply = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        ...(req.headers.origin === allowedOrigin ? { 'access-control-allow-origin': allowedOrigin, 'vary': 'Origin', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' } : {}) });
      res.end(JSON.stringify(value));
    };
    const host = req.headers.host;
    const effectivePort = server.address()?.port ?? port;
    if (host !== `127.0.0.1:${effectivePort}` || (req.headers.origin && req.headers.origin !== allowedOrigin)) { req.resume(); reply(403, { error: 'LOCAL_ORIGIN_REJECTED' }); return; }
    if (req.method === 'OPTIONS') { req.resume(); reply(204, {}); return; }
    const supplied = req.headers.authorization;
    if (typeof supplied !== 'string' || !/^Bearer [0-9a-f]{64}$/.test(supplied) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${token}`))) { req.resume(); reply(401, { error: 'PAIRING_REQUIRED' }); return; }
    touched = Date.now();
    if (req.method === 'GET' && req.url === '/status') { reply(200, wallet.status()); return; }
    if (active) { req.resume(); reply(409, { error: 'WALLET_BUSY' }); return; }
    const confirmation = req.url?.match(/^\/transfers\/([A-Za-z0-9_-]{1,128})$/);
    if (req.method === 'GET' && confirmation) {
      try { const evidence = wallet.confirmationEvidence(confirmation[1]); reply(evidence ? 200 : 404, evidence ?? { error: 'NOT_FINALIZED_OR_NOT_OWN_TRANSFER' }); }
      catch { reply(400, { error: 'WALLET_LOCKED_OR_BUSY' }); } return;
    }
    if (req.method === 'GET' && req.url === '/backup') {
      try { reply(200, wallet.backup()); } catch { reply(400, { error: 'BACKUP_UNAVAILABLE' }); } return;
    }
    if (req.method !== 'POST' || !['/create', '/unlock', '/lock', '/restore', '/passphrase', '/sync', '/send', '/retry', '/import-genesis-note'].includes(req.url)) { req.resume(); reply(404, { error: 'NOT_FOUND' }); return; }
    if (req.headers['content-type']?.split(';')[0] !== 'application/json') { req.resume(); reply(415, { error: 'JSON_REQUIRED' }); return; }
    active = true;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > (req.url === '/restore' ? 8 * 1024 * 1024 : 65536)) throw new Error('BODY_TOO_LARGE'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('INVALID_REQUEST');
      if (Date.now() - attemptWindow > 60_000) { attemptWindow = Date.now(); failedUnlocks = 0; }
      if (['/unlock', '/restore'].includes(req.url) && failedUnlocks >= 5) throw new Error('UNLOCK_RATE_LIMITED');
      let result;
      switch (req.url) {
        case '/create': result = await wallet.create(body.passphrase); break;
        case '/unlock': try { result = await wallet.unlock(body.passphrase); failedUnlocks = 0; } catch (error) { failedUnlocks++; throw error; } break;
        case '/lock': result = wallet.lock(); break;
        case '/restore': try { result = await wallet.restore({ envelope: body.envelope, passphrase: body.passphrase }); } catch (error) { failedUnlocks++; throw error; } break;
        case '/passphrase': result = await wallet.changePassphrase(body.passphrase); break;
        case '/sync': result = await wallet.sync(); break;
        case '/send': result = await wallet.send({ recipient: body.recipient, assetId: body.assetId, amount: body.amount, fee: body.fee }); break;
        case '/retry': result = await wallet.retryPending(); break;
        case '/import-genesis-note': result = wallet.importGenesisNote(body.note); break;
      }
      reply(200, result);
    } catch (error) { reply(400, { error: /^[A-Z0-9_:.-]{1,100}$/.test(error.message) ? error.message : 'WALLET_OPERATION_FAILED' }); }
    finally { active = false; touched = Date.now(); }
  });
  const timer = setInterval(() => { if (!active && !wallet.locked && Date.now() - touched >= idleMs) wallet.lock(); }, 1000);
  timer.unref();
  server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.timeout = 660_000;
  server.once('close', () => {
    clearInterval(timer);
    const dispose = () => {
      if (wallet.busy) { setTimeout(dispose, 100); return; }
      wallet.close(); onDisposed();
    };
    dispose();
  });
  return server;
}

export async function startLocalWallet(env = process.env) {
  assertDemoRuntime(env);
  const directory = env.AEGIS_WALLET_DIR || 'work/local-wallet';
  if (!env.AEGIS_WALLET_CONFIG) throw new Error('PINNED_WALLET_CONFIG_REQUIRED');
  const config = JSON.parse(readFileSync(env.AEGIS_WALLET_CONFIG, 'utf8'));
  const pow = config.schema === 'AEGIS_OPEN_POW_V2';
  if (!pow && (!env.AEGIS_WALLET_GENESIS || !env.AEGIS_WALLET_ANCHOR)) throw new Error('PINNED_WALLET_CONFIG_GENESIS_AND_ANCHOR_REQUIRED');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockfile = join(directory, 'process.lock');
  const releaseProfile = await acquireProfileLock(lockfile);
  let wallet;
  try {
    const tokenPath = join(directory, 'pairing-token');
    if (!existsSync(tokenPath)) writeFileSync(tokenPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    if ((statSync(tokenPath).mode & 0o077) !== 0) throw new Error('PAIRING_FILE_REQUIRES_MODE_0600');
    const token = readBearerSecret(tokenPath);
    if(pow){
      wallet = await PowWallet.open({directory, config, peers: JSON.parse(env.AEGIS_POW_PEERS || '["http://127.0.0.1:8090"]'), limits: env.AEGIS_POW_LIMITS ? JSON.parse(env.AEGIS_POW_LIMITS) : undefined});
    } else {
    const genesisCommitments = JSON.parse(readFileSync(env.AEGIS_WALLET_GENESIS, 'utf8'));
    wallet = new LocalWallet({ directory, config, genesisCommitments, gatewayUrl: env.AEGIS_GATEWAY_URL || 'http://127.0.0.1:8081', gatewayTokenFile: env.AEGIS_GATEWAY_TOKEN_FILE, trustedAnchor: JSON.parse(readFileSync(env.AEGIS_WALLET_ANCHOR, 'utf8')) });
    }
    const server = createWalletServer({ wallet, token, allowedOrigin: env.AEGIS_WALLET_ORIGIN || 'http://localhost:8080',
      onDisposed: () => { void releaseProfile().catch(()=>{process.exitCode=1;}); } });
    server.once('error', () => { if (!server.listening) server.close(); });
    server.listen(8765, '127.0.0.1', () => console.log(`Local wallet listening on 127.0.0.1:8765. Pair using the token file: ${tokenPath}`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
    return server;
  } catch (error) { wallet?.close(); await releaseProfile(); throw error; }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await startLocalWallet();
