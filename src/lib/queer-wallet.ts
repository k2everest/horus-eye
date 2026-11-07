export type QueerWalletAccount = { address: string; publicKey: string; secretKey: string; createdAt: string };
export type WalletTransfer = { id: string; recipient: string; amount: number; status: "validated" | "rejected"; createdAt: string; requestId: string };

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function createDemoWallet(): Promise<QueerWalletAccount> {
  const secretKey = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const publicKey = await sha256Hex(`QUEER_DEMO_PUBLIC_V1:${secretKey}`);
  const addressHash = await sha256Hex(`QUEER_DEMO_ADDRESS_V1:${publicKey}`);
  return { address: `queer_test1${addressHash.slice(0, 48)}`, publicKey, secretKey, createdAt: new Date().toISOString() };
}

export function isTestnetAddress(value: string) {
  return /^queer_test1[0-9a-f]{48}$/.test(value);
}

export async function buildDemoEnvelope(account: QueerWalletAccount, recipient: string, amount: number) {
  if (!isTestnetAddress(recipient)) throw new Error("Endereço testnet inválido.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor deve ser maior que zero.");
  const requestId = crypto.randomUUID();
  const transcriptHash = await sha256Hex(JSON.stringify({ version: 1, sender: account.address, recipient, amount, requestId }));
  return {
    request_id: requestId,
    tx_blob: `QUEER_DEMO_V1:${transcriptHash}`,
    pq_signature: await sha256Hex(`ML-DSA-DEMO:${account.secretKey}:${transcriptHash}`),
    pq_public_key: account.publicKey,
    kem_ciphertext: await sha256Hex(`ML-KEM-DEMO:${recipient}:${transcriptHash}`),
    signature_algorithm: "ML-DSA-65-DEMO",
    kem_algorithm: "ML-KEM-768-DEMO",
  };
}
