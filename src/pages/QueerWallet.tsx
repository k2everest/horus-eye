import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Download, LockKeyhole, RefreshCw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { LocalWalletClient, type WalletStatus } from "@/lib/queer-wallet";

const inputClass = "mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-fuchsia-300";
const buttonClass = "rounded-xl bg-fuchsia-200 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40";
const panelClass = "rounded-2xl border border-white/10 bg-white/[.035] p-6";
const errorText = (error: unknown) => {
  const messages: Record<string, string> = {
    VAULT_UNLOCK_FAILED: "Senha incorreta ou cofre adulterado.",
    PAIRING_REQUIRED: "Confira o token do serviço local e conecte novamente.",
    LOCAL_ORIGIN_REJECTED: "Esta página não está autorizada a acessar o serviço local. Confira o endereço configurado.",
    WALLET_LOCKED: "Desbloqueie o cofre para continuar.",
    WALLET_BUSY: "Aguarde a operação atual terminar.",
    WALLET_CONFIG_MISMATCH: "Este cofre pertence a outra configuração de rede.",
    UNTRUSTED_OR_STALE_GATEWAY_HEAD: "O gateway está atrasado ou diverge da rede e do checkpoint confiáveis.",
    WALLET_CATCH_UP_REQUIRED: "Há mais blocos para verificar. Sincronize novamente antes de enviar.",
    INSUFFICIENT_VERIFIED_FUNDS_OR_INPUT_LIMIT: "Saldo verificado insuficiente ou quantidade de notes acima do limite deste envio.",
    PENDING_TRANSFER_MUST_BE_RESOLVED: "Aguarde a finalização do envio pendente ou use o reenvio seguro.",
    RESTORE_REQUIRES_EMPTY_PROFILE: "Restaure em um perfil local vazio para preservar o cofre existente.",
    PROOF_GENERATION_FAILED: "Não foi possível gerar a prova local. Confira o prover antes de tentar novamente.",
    UNLOCK_RATE_LIMITED: "Muitas tentativas de desbloqueio. Aguarde um minuto.",
    "Token local inválido.": "Token local inválido.",
  };
  return error instanceof Error && messages[error.message] ? messages[error.message] : "Não foi possível concluir a operação. Confira o serviço local, a conexão e os dados informados.";
};

export default function QueerWallet() {
  const [client, setClient] = useState<LocalWalletClient>();
  const [status, setStatus] = useState<WalletStatus>();
  const [token, setToken] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recipient, setRecipient] = useState("");
  const [asset, setAsset] = useState("AEGIS");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    sessionStorage.removeItem("queer:testnet:wallet:v1");
    sessionStorage.removeItem("queer:testnet:history:v1");
  }, []);
  useEffect(() => {
    const lockHidden = () => { if (document.hidden && client) {
      setPassphrase(""); setConfirmation("");
      void client.lock().then(setStatus).catch(() => { /* Native idle lock remains active during an operation. */ });
    } };
    document.addEventListener("visibilitychange", lockHidden);
    return () => document.removeEventListener("visibilitychange", lockHidden);
  }, [client]);
  const run = async (operation: () => Promise<WalletStatus>, success: string) => {
    setBusy(true); setMessage("");
    try { setStatus(await operation()); setMessage(success); }
    catch (error) { setMessage(errorText(error)); if (client) { try { setStatus(await client.status()); } catch { setStatus(undefined); } } }
    finally { setBusy(false); setPassphrase(""); setConfirmation(""); }
  };
  const connect = async () => {
    setBusy(true);
    try { const local = new LocalWalletClient(token.trim()); setStatus(await local.status()); setClient(local); setToken(""); setMessage("Serviço local pareado."); }
    catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const backup = async () => {
    if (!client) return;
    setBusy(true);
    try {
      const envelope = await client.backup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "aegis-wallet-encrypted.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup criptografado exportado. Guarde a senha separadamente e teste a restauração em um perfil vazio.");
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusy(false); }
  };
  const restore = async (file?: File) => {
    if (!client || !file) return;
    if (file.size > 8 * 1024 * 1024) { setMessage("Backup excede o tamanho permitido."); return; }
    if (passphrase.length < 14) { setMessage("Informe a senha do backup, com pelo menos 14 caracteres."); return; }
    await run(async () => client.restore(JSON.parse(await file.text()), passphrase), "Backup restaurado. Sincronize para verificar o saldo atual.");
  };
  const unavailable = busy || status?.busy;
  const isPow = status?.consensus_model === "open-proof-of-work";
  return <main className="min-h-screen bg-[#08080c] text-white">
    <header className="border-b border-white/10 px-5 py-4"><div className="mx-auto flex max-w-5xl items-center justify-between"><Link to="/queer" className="flex items-center gap-2 text-sm text-white/60"><ArrowLeft className="size-4" /> QUEER</Link><span className="text-xs text-amber-200">LABORATÓRIO · SEM DEPÓSITOS REAIS</span></div></header>
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
      <div><h1 className="text-4xl font-black">Carteira QUEER</h1><p className="mt-3 text-white/60">Chaves locais protegidas por senha. Saldo conferido por provas e pela cadeia verificada no computador.</p></div>
      <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100"><ShieldAlert className="mr-2 inline size-4" />Uso experimental. A segurança pós-quântica de 128 bits e a auditoria independente seguem pendentes. {isPow ? "Confirmações PoW são probabilísticas e podem sofrer reorganizações." : status ? "Esta conexão usa a finalização da rede permissionada anterior." : "Confira o modelo da rede após conectar."}</div>
      {!client ? <section className={panelClass}><h2 className="font-semibold">Conectar à carteira local</h2><p className="mt-3 text-sm text-white/60">Inicie o serviço local conforme o runbook e informe o token de pareamento. A conexão usa 127.0.0.1:8765; suas chaves privadas ficam no serviço local.</p><label className="mt-4 block text-sm">Token de pareamento<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} className={inputClass} /></label><button className={`${buttonClass} mt-4`} disabled={busy} onClick={connect}>Conectar</button></section> : <>
        <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{status?.locked ? "Cofre bloqueado" : "Cofre local"}</h2><div className="flex gap-3"><button disabled={unavailable} onClick={() => run(() => client.status(), "Estado local atualizado.")} aria-label="Consultar cofre"><RefreshCw className="size-4" /></button>{!status?.locked && <button disabled={unavailable} onClick={() => run(() => client.lock(), "Cofre bloqueado.")} className="flex items-center gap-2 text-sm"><LockKeyhole className="size-4" /> Bloquear</button>}</div></div>
          {status && <p className="mt-3 break-all font-mono text-xs text-white/45">Rede: {status.network_id} · configuração: {status.config_id}</p>}
          {status?.locked && <div className="mt-4"><label className="block text-sm">Senha do cofre (mínimo 14 caracteres)<input type="password" autoComplete={status.exists ? "current-password" : "new-password"} value={passphrase} onChange={e => setPassphrase(e.target.value)} className={inputClass} /></label>{!status.exists && <label className="mt-3 block text-sm">Confirmar senha<input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /></label>}<button disabled={unavailable || passphrase.length < 14 || (!status.exists && passphrase !== confirmation)} className={`${buttonClass} mt-4`} onClick={() => run(() => status.exists ? client.unlock(passphrase) : client.create(passphrase), "Cofre desbloqueado. Sincronize antes de enviar.")}>{status.exists ? "Desbloquear" : "Criar cofre"}</button>{!status.exists && <label className="mt-5 block text-sm">Ou restaurar backup criptografado com a senha informada<input type="file" accept="application/json,.json" disabled={unavailable} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void restore(file); }} className="mt-2 block text-xs" /></label>}</div>}
          {!status?.locked && status && <div className="mt-5 space-y-4"><p className="text-sm text-white/60">As chaves são removidas da sessão ao bloquear. O serviço bloqueia após cinco minutos de inatividade.</p><label className="block text-sm">Endereço de recebimento<textarea readOnly value={status.address || ""} rows={3} className={`${inputClass} font-mono text-xs`} /></label>{isPow && <label className="block text-sm">Owner público para recompensas de mineração<input readOnly value={status.owner_tag || ""} className={`${inputClass} font-mono text-xs`} /></label>}<button className="flex items-center gap-2 text-sm text-fuchsia-200" onClick={async () => { await navigator.clipboard.writeText(status.address || ""); setMessage("Endereço público copiado."); }}><Copy className="size-4" /> Copiar endereço</button><button disabled={unavailable} onClick={backup} className="flex items-center gap-2 text-sm text-fuchsia-200"><Download className="size-4" /> Exportar backup criptografado</button><details><summary className="cursor-pointer text-sm">Alterar senha</summary><label className="mt-3 block text-sm">Nova senha<input type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} className={inputClass} /></label><label className="mt-3 block text-sm">Confirmar nova senha<input type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} /></label><button disabled={unavailable || passphrase.length < 14 || passphrase !== confirmation} className={`${buttonClass} mt-3`} onClick={() => run(() => client.changePassphrase(passphrase), "Senha alterada. Exporte um novo backup; os antigos conservam a senha anterior.")}>Salvar senha</button></details></div>}
        </section>
        {!status?.locked && status && <>
          <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-semibold">Saldo verificado</h2><button disabled={unavailable} className={buttonClass} onClick={() => run(() => client.sync(), "Sincronização concluída para este lote. Confira se o estado está atualizado.")}>Sincronizar</button></div><p className="mt-3 text-sm text-white/55">{isPow ? "Confirmação PoW" : "Checkpoint local"}: {status.finalized.height}. {isPow && `Tip: ${status.best_tip?.height ?? 0} · limiar: ${status.confirmations_required} confirmações. `} {status.synchronized ? "Estado sincronizado com os peers configurados." : "Sincronização necessária. Saldo disponível oculto até verificar o estado atual."}</p>{status.notes_deferred ? <p className="mt-3 text-sm text-amber-100">Há {status.notes_deferred} notes adicionais confirmadas fora da janela de envio. Gastar e sincronizar libera espaço; o saldo disponível inclui apenas as notes carregadas.</p> : null}{status.synchronized && <div className="mt-5 space-y-3">{Object.entries(status.balances || {}).length === 0 ? <p>0 — nenhuma note sua confirmada.</p> : Object.entries(status.balances || {}).map(([name, balance]) => <div key={name}><p className="text-3xl font-bold">{balance.available} <span className="text-lg text-fuchsia-200">{name}</span></p><p className="mt-1 text-xs text-white/50">Unidades inteiras · confirmado: {balance.confirmed} · reservado: {balance.reserved}</p></div>)}</div>}{!!status.pending?.length && <p className="mt-4 text-sm text-amber-200">{isPow ? "Envio pendente ou órfão: inputs permanecem reservados. Confirmações podem mudar com reorganizações." : "Envio pendente: fundos reservados até finalização ou invalidação por um checkpoint posterior."} <button disabled={unavailable} className="underline" onClick={() => run(() => client.retry(), "Envio pendente reavaliado; sincronize para acompanhar.")}>Reenviar com segurança</button></p>}</section>
          <section className={panelClass}><h2 className="font-semibold">Enviar com prova local</h2><label className="mt-4 block text-sm">Endereço do destinatário<textarea value={recipient} onChange={e => setRecipient(e.target.value.trim())} rows={3} className={inputClass} placeholder="aegis_receive1_…" /></label><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm">Ativo<input value={asset} onChange={e => setAsset(e.target.value)} className={inputClass} /></label><label className="text-sm">Quantidade em unidades inteiras<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></label></div><p className="mt-4 text-sm text-white/50">Confira endereço, ativo e quantidade. A prova é gerada no computador e pode levar vários minutos. O saldo não é confirmado pelo envio.</p><button disabled={unavailable || !status.synchronized || !!status.pending?.length || !recipient || !/^[1-9][0-9]*$/.test(amount)} className={`${buttonClass} mt-4`} onClick={() => run(() => client.send(recipient, asset, amount), isPow ? "Transação enviada. Aguarde confirmações PoW e sincronize." : "Transação enviada. Aguarde finalização e sincronize.")}>{busy ? "Processando…" : "Confirmar e enviar"}</button></section>
        </>}
      </>}
      {message && <p role="status" aria-live="polite" className="break-words rounded-xl border border-white/10 p-4 text-sm text-white/80">{message}</p>}
    </div>
  </main>;
}
