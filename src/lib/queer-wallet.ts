export type WalletStatus = {
  consensus_model?: "open-proof-of-work"; finality?: "probabilistic";
  confirmations_required?: number; owner_tag?: string;
  best_tip?: {height:number;hash:string;work:string};
  notes_deferred?: number; minimum_transaction_fee?: string;
  exists: boolean; locked: boolean; busy: boolean; synchronized: boolean; network_id: string; config_id: string;
  finalized: { height: number; checkpoint_id: string; root: string }; production_ready: false;
  address?: string; balances?: Record<string, { confirmed: string; reserved: string; available: string }>;
  pending?: { request_id: string; transaction_id: string }[];
};

// Secret material is handled by the paired native service. Capability and
// passphrase remain in memory and are never sent to a user-selected URL.
export class LocalWalletClient {
  #token: string;
  constructor(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Token local inválido.");
    this.#token = token;
  }
  async #request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`http://127.0.0.1:8765${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error", cache: "no-store",
      headers: { authorization: `Bearer ${this.#token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(660_000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "LOCAL_WALLET_UNAVAILABLE");
    return result as T;
  }
  status() { return this.#request<WalletStatus>("/status"); }
  create(passphrase: string) { return this.#request<WalletStatus>("/create", { passphrase }); }
  unlock(passphrase: string) { return this.#request<WalletStatus>("/unlock", { passphrase }); }
  lock() { return this.#request<WalletStatus>("/lock", {}); }
  sync() { return this.#request<WalletStatus>("/sync", {}); }
  send(recipient: string, assetId: string, amount: string, fee?: string) { return this.#request<WalletStatus>("/send", { recipient, assetId, amount, ...(fee === undefined ? {} : { fee }) }); }
  retry() { return this.#request<WalletStatus>("/retry", {}); }
  backup() { return this.#request<unknown>("/backup"); }
  restore(envelope: unknown, passphrase: string) { return this.#request<WalletStatus>("/restore", { envelope, passphrase }); }
  changePassphrase(passphrase: string) { return this.#request<WalletStatus>("/passphrase", { passphrase }); }
}
