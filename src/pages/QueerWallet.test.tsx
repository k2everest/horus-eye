import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import QueerWallet from "./QueerWallet";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); sessionStorage.clear(); });
describe("carteira verificada", () => {
  it("removes legacy secrets and exposes balances only after synchronization", async () => {
    sessionStorage.setItem("queer:testnet:wallet:v1", JSON.stringify({ secretKey: "legacy-demo-secret" }));
    const status = { exists: true, locked: false, busy: false, synchronized: false, network_id: "aegis-lab-v1", config_id: "a".repeat(64),
      finalized: { height: 0, checkpoint_id: "b".repeat(64), root: "c".repeat(64) }, address: "aegis_receive1_public", balances: { AEGIS: { confirmed: "7", available: "7", reserved: "0" } }, pending: [] };
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => status })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...status, synchronized: true }) });
    vi.stubGlobal("fetch", mockFetch);
    render(<MemoryRouter><QueerWallet /></MemoryRouter>);
    expect(sessionStorage.getItem("queer:testnet:wallet:v1")).toBeNull();
    expect(screen.queryByText(/1.000/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Token de pareamento"), { target: { value: "ab".repeat(32) } });
    fireEvent.click(screen.getByText("Conectar"));
    await screen.findByText("Saldo verificado");
    expect(screen.queryByText(/Unidades inteiras · confirmado/)).toBeNull();
    fireEvent.click(screen.getByText("Sincronizar"));
    await screen.findByText(/Unidades inteiras · confirmado: 7/);
    expect(mockFetch.mock.calls.every(([url]) => String(url).startsWith("http://127.0.0.1:8765/"))).toBe(true);
    expect(sessionStorage.length).toBe(0);
  });
});
it('identifies PoW confirmations and exposes only the public mining owner', async () => {
 const status={exists:true,locked:false,busy:false,synchronized:true,consensus_model:'open-proof-of-work',finality:'probabilistic',confirmations_required:6,
  network_id:'pow-v2',config_id:'a'.repeat(64),finalized:{height:7,checkpoint_id:'b'.repeat(64),root:'c'.repeat(64)},best_tip:{height:12,hash:'d'.repeat(64),work:'1000'},
  owner_tag:'e'.repeat(64),address:'aegis_pow_receive2_public',balances:{AEGIS:{confirmed:'3',reserved:'0',available:'3'}},pending:[]};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>status}));render(<MemoryRouter><QueerWallet /></MemoryRouter>);
 fireEvent.change(screen.getByLabelText('Token de pareamento'),{target:{value:'ab'.repeat(32)}});fireEvent.click(screen.getByText('Conectar'));
 await screen.findByText(/Confirmações PoW são probabilísticas/);expect(screen.getByLabelText('Owner público para recompensas de mineração')).toHaveValue(status.owner_tag);
 expect(screen.getByText(/Confirmação PoW/)).toBeInTheDocument();expect(screen.queryByText(/depende da autoridade/)).toBeNull();
});
