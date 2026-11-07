import { useMemo, useState } from "react";
import { ArrowRight, Check, Copy, EyeOff, Fingerprint, LockKeyhole, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const pillars = [
  { icon: EyeOff, title: "Privacidade por padrão", text: "Remetente, destinatário, valor e metadados permanecem blindados no desenho do protocolo." },
  { icon: ShieldCheck, title: "Preparada para PQC", text: "Envelopes com ML-KEM e ML-DSA formam a base de migração pós-quântica do Aegis Flow." },
  { icon: Network, title: "Integração verificável", text: "Contratos versionados, logs sem segredos e APIs prontas para evolução via gRPC." },
];

const stages = ["Envelope criado", "Assinatura verificada", "Nullifier reservado", "Transação aceita"];

export default function QueerLanding() {
  const [amount, setAmount] = useState("25");
  const [result, setResult] = useState<null | { id: string; elapsed: number }>(null);
  const [copied, setCopied] = useState(false);

  const txId = useMemo(() => result?.id ?? "qer_test_••••••••••••", [result]);

  const simulate = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return;
    setResult({
      id: `qer_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      elapsed: Math.floor(38 + Math.random() * 24),
    });
  };

  const copyId = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#08080c] text-white selection:bg-fuchsia-400 selection:text-black">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(232,121,249,0.16),transparent_30%),radial-gradient(circle_at_85%_30%,rgba(45,212,191,0.12),transparent_28%)]" />

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a href="#top" className="flex items-center gap-3" aria-label="QUEER início">
          <span className="grid size-9 place-items-center rounded-full border border-white/20 bg-white text-sm font-black text-black">Q</span>
          <span className="text-sm font-semibold tracking-[0.28em]">QUEER</span>
        </a>
        <div className="hidden items-center gap-8 text-sm text-white/60 md:flex">
          <a className="transition hover:text-white" href="#protocolo">Protocolo</a>
          <a className="transition hover:text-white" href="#laboratorio">Laboratório</a>
          <a className="transition hover:text-white" href="#manifesto">Manifesto</a>
        </div>
        <Link to="/auth" className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium transition hover:border-white/60 hover:bg-white hover:text-black">
          Abrir console
        </Link>
      </nav>

      <section id="top" className="relative z-10 mx-auto grid min-h-[76vh] max-w-7xl items-center gap-16 px-6 pb-20 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-10">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/5 px-3 py-1.5 text-xs font-medium text-fuchsia-200">
            <Sparkles className="size-3.5" /> Aegis Flow experimental network
          </div>
          <h1 className="max-w-4xl text-6xl font-black leading-[0.88] tracking-[-0.07em] sm:text-7xl lg:text-[7.2rem]">
            VALOR SEM<br />VIGILÂNCIA<span className="text-fuchsia-300">.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-8 text-white/58">
            QUEER é a identidade pública de uma experiência de dinheiro digital blindado: plural, privado e construído para um futuro pós-quântico.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/queer/wallet" className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 font-semibold text-black transition hover:bg-fuchsia-200">
              Abrir carteira testnet <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </Link>
            <a href="#protocolo" className="rounded-full border border-white/20 px-6 py-3.5 font-semibold text-white/80 transition hover:border-white/50">Conhecer o protocolo</a>
          </div>
          <p className="mt-6 text-xs text-white/35">Protótipo técnico · sem valor monetário · não constitui oferta de investimento</p>
        </div>

        <div className="relative mx-auto grid aspect-square w-full max-w-md place-items-center">
          <div className="absolute inset-[8%] rounded-full border border-fuchsia-300/20 [animation:spin_24s_linear_infinite]">
            <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-300 shadow-[0_0_18px_#f0abfc]" />
          </div>
          <div className="absolute inset-[18%] rounded-full border border-dashed border-teal-300/20 [animation:spin_18s_linear_infinite_reverse]" />
          <div className="relative grid size-48 place-items-center rounded-full border border-white/30 bg-[radial-gradient(circle_at_35%_25%,#fff_0%,#f0abfc_13%,#a855f7_39%,#111118_75%)] shadow-[0_0_100px_rgba(217,70,239,0.32)] sm:size-60">
            <span className="text-8xl font-black tracking-[-0.12em] text-black/80 sm:text-9xl">Q</span>
            <span className="absolute bottom-9 text-[10px] font-bold tracking-[0.45em] text-black/60">QUEER</span>
          </div>
        </div>
      </section>

      <section id="protocolo" className="relative z-10 border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid max-w-7xl divide-y divide-white/10 px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          {pillars.map(({ icon: Icon, title, text }) => (
            <article key={title} className="px-0 py-10 first:pl-0 md:px-8 md:py-14">
              <Icon className="mb-8 size-6 text-fuchsia-300" />
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-white/45">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="laboratorio" className="relative z-10 mx-auto grid max-w-7xl gap-14 px-6 py-28 lg:grid-cols-[0.8fr_1.2fr] lg:px-10">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-teal-300">Testnet laboratory</span>
          <h2 className="mt-5 text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Teste o fluxo.<br />Não a sua sorte.</h2>
          <p className="mt-6 max-w-md leading-7 text-white/50">Esta simulação demonstra os estados esperados do pipeline. Ela não movimenta ativos reais nem substitui os testes criptográficos automatizados.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl backdrop-blur sm:p-8">
          <div className="flex items-center justify-between border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-semibold">Transação de teste</p>
              <p className="mt-1 text-xs text-white/35">Ambiente isolado · QER sem valor</p>
            </div>
            <span className="flex items-center gap-2 rounded-full bg-teal-300/10 px-3 py-1 text-xs text-teal-200"><span className="size-1.5 rounded-full bg-teal-300" /> testnet online</span>
          </div>

          <label className="mt-7 block text-xs uppercase tracking-[0.16em] text-white/40" htmlFor="qer-amount">Quantidade de teste</label>
          <div className="mt-2 flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 focus-within:border-fuchsia-300/50">
            <input id="qer-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="min-w-0 flex-1 bg-transparent py-4 text-2xl font-semibold outline-none" aria-label="Quantidade de QER" />
            <span className="text-sm font-bold text-fuchsia-200">QER</span>
          </div>

          <button onClick={simulate} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-fuchsia-300 py-4 font-bold text-black transition hover:bg-white disabled:opacity-40" disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 0}>
            <LockKeyhole className="size-4" /> Simular envio blindado
          </button>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {stages.map((stage, index) => (
              <div key={stage} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-xs ${result ? "border-teal-300/15 bg-teal-300/5 text-white/75" : "border-white/5 text-white/25"}`}>
                <span className={`grid size-5 place-items-center rounded-full ${result ? "bg-teal-300 text-black" : "bg-white/5"}`}>{result ? <Check className="size-3" /> : index + 1}</span>
                {stage}
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between rounded-xl bg-black/25 px-4 py-3 font-mono text-xs text-white/40">
            <span>{txId}</span>
            <button onClick={copyId} disabled={!result} className="text-white/50 transition hover:text-white disabled:opacity-20" aria-label="Copiar identificador da transação">
              {copied ? <Check className="size-4 text-teal-300" /> : <Copy className="size-4" />}
            </button>
          </div>
          {result && <p className="mt-3 text-right font-mono text-[11px] text-teal-300">VALIDADA EM {result.elapsed}ms</p>}
        </div>
      </section>

      <section id="manifesto" className="relative z-10 border-t border-white/10 px-6 py-24 text-center">
        <Fingerprint className="mx-auto size-7 text-fuchsia-300" />
        <p className="mx-auto mt-7 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">Privacidade não é esconder quem somos. É escolher o que revelamos.</p>
        <p className="mt-7 text-sm text-white/40">QUEER / AEGIS FLOW · PROTOCOL PREVIEW</p>
      </section>
    </main>
  );
}

