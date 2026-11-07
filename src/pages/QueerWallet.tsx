import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, FlaskConical, Loader2, RefreshCw, Send, ShieldAlert, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";
import { buildDemoEnvelope, createDemoWallet, isTestnetAddress, type QueerWalletAccount, type WalletTransfer } from "@/lib/queer-wallet";

const ACCOUNT_KEY = "queer:testnet:wallet:v1";
const HISTORY_KEY = "queer:testnet:history:v1";
const INITIAL_BALANCE = 1_000;
function readSession<T>(key: string, fallback: T): T { try { return JSON.parse(sessionStorage.getItem(key) || "") as T; } catch { return fallback; } }

export default function QueerWallet() {
  const [account, setAccount] = useState<QueerWalletAccount | null>(() => readSession(ACCOUNT_KEY, null));
  const [history, setHistory] = useState<WalletTransfer[]>(() => readSession(HISTORY_KEY, []));
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [gatewayUrl, setGatewayUrl] = useState(import.meta.env.VITE_AEGIS_GATEWAY_URL || "http://localhost:8080");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (account) sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(account)); }, [account]);
  useEffect(() => { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }, [history]);
  const spent = useMemo(() => history.filter((item) => item.status === "validated").reduce((sum, item) => sum + item.amount, 0), [history]);
  const balance = Math.max(0, INITIAL_BALANCE - spent);

  const generate = async () => {
    if (account && !window.confirm("Substituir a carteira de demonstração desta sessão?")) return;
    setAccount(await createDemoWallet()); setHistory([]); setMessage("Carteira testnet criada somente nesta sessão do navegador.");
  };
  const copyAddress = async () => { if (account) { await navigator.clipboard.writeText(account.address); setMessage("Endereço copiado."); } };
  const send = async () => {
    if (!account) return;
    const numericAmount = Number(amount);
    if (!isTestnetAddress(recipient)) { setMessage("Informe um endereço QUEER testnet válido."); return; }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > balance) { setMessage("Valor inválido ou saldo testnet insuficiente."); return; }
    setBusy(true); setMessage("Construindo envelope demonstrativo…");
    try {
      const envelope = await buildDemoEnvelope(account, recipient, numericAmount);
      const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/validate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
      const payload = await response.json();
      const status = response.ok && payload.valid ? "validated" : "rejected";
      setHistory((items) => [{ id: envelope.tx_blob.slice(-16), recipient, amount: numericAmount, status, createdAt: new Date().toISOString(), requestId: envelope.request_id }, ...items]);
      setMessage(status === "validated" ? "Envelope aceito pelo Validation Gateway." : `Gateway rejeitou: ${payload.failed_checks?.join("; ") || response.status}`);
    } catch { setMessage("Não foi possível acessar o gateway. Inicie o ambiente local e confira a URL."); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#08080c] text-white selection:bg-fuchsia-300 selection:text-black">
    <header className="border-b border-white/10 px-5 py-4"><div className="mx-auto flex max-w-6xl items-center justify-between"><Link to="/queer" className="flex items-center gap-2 text-sm text-white/60 hover:text-white"><ArrowLeft className="size-4" /> QUEER</Link><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs text-amber-200">TESTNET DEMO · SEM VALOR REAL</span></div></header>
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="font-mono text-xs uppercase tracking-[.24em] text-fuchsia-300">Public MVP wallet</p><h1 className="mt-3 text-4xl font-black tracking-[-.05em] sm:text-6xl">Carteira QUEER</h1><p className="mt-3 max-w-xl text-white/45">Crie uma identidade testnet, monte um envelope e envie-o ao Validation Gateway. Nenhum ativo ou blockchain real é usado nesta etapa.</p></div><button onClick={generate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-black hover:bg-fuchsia-200"><RefreshCw className="size-4" /> {account ? "Nova carteira" : "Criar carteira"}</button></div>
      <div className="mb-7 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm leading-6 text-amber-100/75"><ShieldAlert className="mr-2 inline size-4" /><strong>Limite de segurança:</strong> as chaves e assinaturas desta tela são demonstrativas e ficam apenas em <code>sessionStorage</code>. Não deposite dinheiro nem reutilize este endereço.</div>
      {!account ? <section className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[.02] text-center"><div><WalletCards className="mx-auto size-10 text-white/25" /><h2 className="mt-4 text-xl font-semibold">Nenhuma carteira nesta sessão</h2><p className="mt-2 text-sm text-white/40">Crie uma carteira de laboratório para começar.</p></div></section> : <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
        <section className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><p className="text-xs uppercase tracking-[.18em] text-white/35">Saldo faucet simulado</p><p className="mt-3 text-5xl font-black">{balance.toLocaleString("pt-BR")} <span className="text-lg text-fuchsia-300">QER</span></p><div className="mt-7 rounded-2xl bg-black/30 p-4"><p className="text-xs text-white/35">Seu endereço testnet</p><p className="mt-2 break-all font-mono text-sm text-white/75">{account.address}</p><button onClick={copyAddress} className="mt-3 inline-flex items-center gap-2 text-xs text-fuchsia-200"><Copy className="size-3" /> Copiar endereço</button></div><div className="mt-4 flex items-center gap-2 text-xs text-teal-200/70"><FlaskConical className="size-4" /> Saldo local fictício: {INITIAL_BALANCE} QER</div></section>
        <section className="rounded-3xl border border-white/10 bg-white/[.035] p-6"><h2 className="text-lg font-semibold">Enviar envelope de teste</h2><label className="mt-5 block text-xs text-white/40">Destinatário</label><input value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="queer_test1…" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm outline-none focus:border-fuchsia-300/50" /><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className="block text-xs text-white/40">Quantidade</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 outline-none focus:border-fuchsia-300/50" /></div><div><label className="block text-xs text-white/40">Gateway</label><input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-fuchsia-300/50" /></div></div><button onClick={send} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-300 py-3.5 font-bold text-black hover:bg-white disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Validar transação</button>{message && <p role="status" className="mt-4 text-sm text-white/55">{message}</p>}</section>
      </div>}
      {account && <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.025] p-6"><h2 className="font-semibold">Atividade desta sessão</h2>{history.length === 0 ? <p className="mt-4 text-sm text-white/35">Nenhuma transação testnet.</p> : <div className="mt-4 space-y-3">{history.map((item) => <div key={item.requestId} className="flex flex-col gap-2 rounded-xl border border-white/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CheckCircle2 className={`size-4 ${item.status === "validated" ? "text-teal-300" : "text-red-300"}`} /><span>{item.amount} QER</span><span className="font-mono text-xs text-white/30">{item.id}</span></div><span className="text-xs uppercase tracking-wider text-white/40">{item.status}</span></div>)}</div>}</section>}
    </div>
  </main>;
}
