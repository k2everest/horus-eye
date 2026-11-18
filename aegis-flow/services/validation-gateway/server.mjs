import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { validateShieldedTx } from './index.mjs';
import { assertDemoRuntime } from './runtime-policy.mjs';
import { assertPqcRuntime } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { PersistentLedger, LedgerConflict } from '../ledger-state/store.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
import { submitProvenTransfer } from '../ledger-state/submit-transfer.mjs';

function sendJson(res, statusCode, payload) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:8080',
    'access-control-allow-headers': 'content-type,x-request-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

export function createValidationServer({ sink = console.log, faultInjector = () => false, maxBodyBytes = 65536, maxSubmitBytes = 12 * 1024 * 1024, maxInFlightBodies = 8,
  ledgerPath, networkId = process.env.AEGIS_NETWORK_ID || 'aegis-lab-v1', starkBackend = defaultStarkBackend(), settlementConfig, trustedFinalizedCheckpoint } = {}) {
  assertDemoRuntime();
  assertPqcRuntime();
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1048576) {
    throw new RangeError('maxBodyBytes must be between 1 and 1048576');
  }
  if (!Number.isSafeInteger(maxSubmitBytes) || maxSubmitBytes < 1 || maxSubmitBytes > 12 * 1024 * 1024) throw new RangeError('invalid submit size limit');
  if (!Number.isSafeInteger(maxInFlightBodies) || maxInFlightBodies < 1 || maxInFlightBodies > 64) throw new RangeError('invalid body admission limit');
  const ledger = ledgerPath ? new PersistentLedger({ filename: ledgerPath, networkId, trustedFinalizedCheckpoint }) : undefined;
  try {
    if (settlementConfig) {
      if (!ledger) throw new Error('STATE_NOT_CONFIGURED');
      ledger.configureSettlement(settlementConfig);
    }
  } catch (error) { ledger?.close(); throw error; }
  let verifying = false;
  let inFlightBodies = 0;
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { status: 'ok', service: 'validation-gateway', mode: 'demo', production_ready: false, state_persistence: Boolean(ledger), stark_verification: Boolean(starkBackend?.availableForVerification()) });
      return;
    }

    const certificateMatch = req.url?.match(/^\/settlement\/certificates\/([1-9][0-9]{0,14})$/);
    const finalizedBlockMatch = req.url?.match(/^\/settlement\/blocks\/([1-9][0-9]{0,14})$/);
    const finalizedProofMatch = req.url?.match(/^\/settlement\/proof\/([0-9a-f]{64})$/);
    if (req.method === 'GET' && (req.url === '/settlement/status' || req.url === '/settlement/config' || certificateMatch || finalizedBlockMatch || finalizedProofMatch)) {
      if (!ledger) { sendJson(res, 503, { status_code: 'STATE_NOT_CONFIGURED' }); return; }
      try {
        const state = ledger.settlementStatus();
        if (!state) { sendJson(res, 503, { status_code: 'SETTLEMENT_NOT_CONFIGURED' }); return; }
        const result = finalizedProofMatch ? ledger.finalizedInclusionProof(finalizedProofMatch[1]) : certificateMatch ? ledger.finalityCertificate(Number(certificateMatch[1])) : finalizedBlockMatch ? ledger.finalizedBlock(Number(finalizedBlockMatch[1])) :
          req.url === '/settlement/config' ? ledger.settlementConfig() : { ...state, included: ledger.latest() };
        sendJson(res, result ? 200 : 404, result ?? { status_code: 'NOT_FOUND' });
      } catch (error) { sendJson(res, error.message === 'UNKNOWN_COMMITMENT' ? 404 : 503, { status_code: error.message === 'UNKNOWN_COMMITMENT' ? 'UNKNOWN_COMMITMENT' : 'STATE_UNAVAILABLE' }); }
      return;
    }

    const receiptMatch = req.url?.match(/^\/receipts\/([A-Za-z0-9_-]{1,128})$/);
    const transactionMatch = req.url?.match(/^\/transactions\/([0-9a-f]{64})$/);
    if (req.method === 'GET' && transactionMatch) {
      if (!ledger) { sendJson(res, 503, { status_code: 'STATE_NOT_CONFIGURED' }); return; }
      try {
        const transaction = ledger.publicTransaction(transactionMatch[1]);
        sendJson(res, transaction ? 200 : 404, transaction ?? { status_code: 'NOT_FOUND' });
      } catch { sendJson(res, 503, { status_code: 'STATE_UNAVAILABLE' }); }
      return;
    }
    if (req.method === 'GET' && receiptMatch) {
      if (!ledger) { sendJson(res, 503, { status_code: 'STATE_NOT_CONFIGURED' }); return; }
      try {
        const receipt = ledger.receipt(receiptMatch[1]) ?? ledger.verificationReceipt(receiptMatch[1]);
        sendJson(res, receipt ? 200 : 404, receipt ?? { status_code: 'NOT_FOUND' });
      } catch {
        sendJson(res, 503, { status_code: 'STATE_UNAVAILABLE' });
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/ledger/root') {
      if (!ledger) { sendJson(res, 503, { status_code: 'STATE_NOT_CONFIGURED' }); return; }
      try { sendJson(res, 200, { network_id: ledger.networkId, ...ledger.latest(), production_ready: false }); }
      catch { sendJson(res, 503, { status_code: 'STATE_UNAVAILABLE' }); }
      return;
    }
    const proofMatch = req.url?.match(/^\/ledger\/proof\/([0-9a-f]{64})$/);
    if (req.method === 'GET' && proofMatch) {
      if (!ledger) { sendJson(res, 503, { status_code: 'STATE_NOT_CONFIGURED' }); return; }
      try { sendJson(res, 200, ledger.inclusionProof({ commitment: proofMatch[1] })); }
      catch { sendJson(res, 404, { status_code: 'UNKNOWN_COMMITMENT' }); }
      return;
    }
    if (req.method === 'POST' && req.url === '/submit' && (!ledger || !starkBackend?.availableForVerification() || verifying)) {
      req.resume();
      sendJson(res, 503, { valid: false, status_code: !ledger ? 'STATE_NOT_CONFIGURED' : verifying ? 'VERIFIER_BUSY' : 'ZK_BACKEND_NOT_CONFIGURED', settled: false });
      return;
    }

    if (req.method === 'POST' && (req.url === '/validate' || req.url === '/submit' || req.url === '/settlement/certificates')) {
      const submitting = req.url === '/submit';
      const finalizing = req.url === '/settlement/certificates';
      if (finalizing && (!ledger || !ledger.settlementStatus())) {
        req.resume(); sendJson(res, 503, { status_code: 'SETTLEMENT_NOT_CONFIGURED' }); return;
      }
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        req.resume();
        sendJson(res, 415, { valid: false, status_code: 'UNSUPPORTED_MEDIA_TYPE' });
        return;
      }
      // Reserve before reading any bytes, not only when verification starts.
      if (inFlightBodies >= maxInFlightBodies) {
        req.resume();
        res.setHeader('retry-after', '1');
        sendJson(res, 429, { valid: false, status_code: 'REQUEST_CAPACITY_EXCEEDED' });
        return;
      }
      inFlightBodies += 1;
      let released = false;
      const release = () => {
        if (!released) { released = true; inFlightBodies -= 1; }
      };
      req.once('aborted', release);
      req.once('error', release);
      res.once('finish', release);
      res.once('close', release);
      let body = '';
      let bytes = 0;
      let oversized = false;
      const chunks = [];
      req.on('data', (chunk) => {
        if (oversized) return;
        bytes += chunk.length;
        if (bytes > (submitting ? maxSubmitBytes : maxBodyBytes)) {
          oversized = true;
          chunks.length = 0;
          sendJson(res, 413, { valid: false, status_code: 'PAYLOAD_TOO_LARGE' });
          return;
        }
        chunks.push(chunk);
      });
      req.on('error', () => { if (!res.writableEnded) res.destroy(); });

      req.on('end', async () => {
        if (oversized) return;
        if (submitting && verifying) {
          chunks.length = 0;
          sendJson(res, 503, { status_code: 'VERIFIER_BUSY' });
          return;
        }
        body = Buffer.concat(chunks).toString('utf8');
        if (faultInjector({ method: req.method, url: req.url })) {
          sendJson(res, 503, { status_code: 'UNAVAILABLE', retryable: true });
          return;
        }

        let parsed;
        try {
          parsed = body ? JSON.parse(body) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object');
        } catch {
          sendJson(res, 400, {
            valid: false,
            failed_checks: ['INVALID_ARGUMENT: corpo JSON inválido'],
            request_id: undefined,
            status_code: 'INVALID_ARGUMENT',
          });
          return;
        }
        try {
          if (finalizing) {
            if (Object.keys(parsed).join(',') !== 'certificate') { sendJson(res, 400, { status_code: 'CERTIFICATE_REQUIRED' }); return; }
            try {
              const certificate = ledger.acceptFinality(parsed.certificate);
              sendJson(res, 200, { status_code: 'FINALIZED_PERMISSIONED', certificate, settlement_scope: 'aegis-permissioned-authority', production_ready: false });
            } catch (error) {
              sendJson(res, error instanceof LedgerConflict ? 409 : 400, { status_code: error instanceof LedgerConflict ? error.code : 'INVALID_FINALITY_CERTIFICATE' });
            }
            return;
          }
          if (submitting) {
            if (Object.keys(parsed).sort().join(',') !== 'proof,transaction') {
              sendJson(res, 400, { valid: false, status_code: 'PUBLIC_TRANSACTION_AND_PROOF_REQUIRED' });
              return;
            }
            if (verifying) { sendJson(res, 503, { status_code: 'VERIFIER_BUSY' }); return; }
            verifying = true;
            try {
              const result = await submitProvenTransfer({ ledger, transaction: parsed.transaction, proof: parsed.proof, backend: starkBackend });
              const conflict = ['STALE_ROOT', 'INPUT_ALREADY_SPENT', 'NULLIFIER_ALREADY_USED', 'REQUEST_ID_CONFLICT', 'TX_ID_CONFLICT', 'COMMITMENT_ALREADY_EXISTS'];
              sendJson(res, result.valid ? 200 : conflict.includes(result.status_code) ? 409 : result.status_code === 'ZK_BACKEND_NOT_CONFIGURED' ? 503 : 400, result);
            } finally { verifying = false; }
            return;
          }
          const response = validateShieldedTx(parsed, sink);
          if (response.valid && ledger) response.receipt = ledger.recordVerification(parsed);
          sendJson(res, response.valid ? 200 : 400, response);
        } catch (error) {
          sendJson(res, error instanceof LedgerConflict ? 409 : 503, {
            valid: false, status_code: error instanceof LedgerConflict ? error.code : 'STATE_OR_VERIFIER_UNAVAILABLE',
          });
        }
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 15_000;
  server.once('close', () => ledger?.close());
  server.on('error', () => { if (!server.listening) ledger?.close(); });
  return server;
}

export function startValidationServer({ port = Number(process.env.PORT || 8080), sink = console.log, ledgerPath = process.env.AEGIS_LEDGER_PATH || 'work/aegis-ledger.sqlite', ...options } = {}) {
  const settlementConfig = process.env.AEGIS_SETTLEMENT_CONFIG_PATH ? JSON.parse(readFileSync(process.env.AEGIS_SETTLEMENT_CONFIG_PATH, 'utf8')) : undefined;
  const trustedFinalizedCheckpoint = process.env.AEGIS_FINALITY_ANCHOR_PATH ? JSON.parse(readFileSync(process.env.AEGIS_FINALITY_ANCHOR_PATH, 'utf8')) : undefined;
  const server = createValidationServer({ sink, ledgerPath, settlementConfig, trustedFinalizedCheckpoint, ...options });
  server.listen(port, () => {
    sink(JSON.stringify({ level: 'info', service: 'validation-gateway', message: `listening on :${port}` }));
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startValidationServer();
}
