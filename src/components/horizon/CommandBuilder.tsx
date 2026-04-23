import type { HorizonCommand } from "@/types/horizon";
import { FlagToggle } from "./FlagToggle";
import { FlagInput } from "./FlagInput";

interface FlagDef {
  key: string;
  label: string;
  description: string;
  type: "toggle" | "text";
  default?: string | boolean;
  placeholder?: string;
}

interface FlagGroup {
  title: string;
  flags: FlagDef[];
}

const authRebindFlags: FlagGroup[] = [
  {
    title: "Identity",
    flags: [
      { key: "id", label: "--id", description: "Identificador do operador ou core a vincular", type: "text", placeholder: "HORUS" },
      { key: "email", label: "--email", description: "Email que será associado ao vínculo autenticado", type: "text", placeholder: "ops@horizon.local" },
    ],
  },
];

const authSessionKillFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "all", label: "--all", description: "Encerra todas as sessões ativas do domínio autenticado", type: "toggle", default: true },
    ],
  },
];

const nodeSyncFlags: FlagGroup[] = [
  {
    title: "Recovery",
    flags: [
      { key: "priority", label: "--priority", description: "Busca pares de alta velocidade antes da sincronização padrão", type: "toggle", default: false },
      { key: "rehash", label: "--rehash", description: "Reavalia os blocos finais para corrigir corrupção parcial", type: "toggle", default: false },
    ],
  },
];

const dataHealthFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "source", label: "--source", description: "Origem do fluxo de dados que será inspecionada", type: "text", placeholder: "terranode" },
    ],
  },
];

const financeAuditFlags: FlagGroup[] = [
  {
    title: "Audit Scope",
    flags: [
      { key: "user", label: "--user", description: "Usuário alvo da auditoria financeira", type: "text", placeholder: "Horus" },
      { key: "deep-scan", label: "--deep-scan", description: "Habilita varredura forense profunda para admins", type: "toggle", default: false },
    ],
  },
];

const commandData: Record<HorizonCommand, { title: string; description: string; groups: FlagGroup[] }> = {
  "auth-rebind": {
    title: "hz auth rebind",
    description: "Vincula identidade operacional ao core autenticado com saída padronizada.",
    groups: authRebindFlags,
  },
  "auth-session-kill": {
    title: "hz auth session-kill",
    description: "Encerra sessões ativas de forma controlada, com opção global.",
    groups: authSessionKillFlags,
  },
  "node-sync": {
    title: "hz node sync",
    description: "Executa sincronização do nó com prioridade e rehash opcional dos últimos blocos.",
    groups: nodeSyncFlags,
  },
  "data-health": {
    title: "hz data health",
    description: "Consulta saúde do pipeline de dados da fonte conectada.",
    groups: dataHealthFlags,
  },
  "finance-audit": {
    title: "hz finance audit",
    description: "Rastreabilidade financeira com opção de deep scan para perfis administrativos.",
    groups: financeAuditFlags,
  },
};

interface CommandBuilderProps {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
  onFlagChange: (key: string, value: string | boolean) => void;
}

export function CommandBuilder({ command, flags, onFlagChange }: CommandBuilderProps) {
  const data = commandData[command];

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-mono text-lg font-semibold text-foreground">{data.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
      </div>

      {data.groups.length === 0 && (
        <div className="rounded-xl border bg-card p-6">
          <p className="font-mono text-sm text-muted-foreground">
            No configurable options. Click <strong className="text-foreground">Execute</strong> to run.
          </p>
        </div>
      )}

      {data.groups.map((group) => (
        <div key={group.title} className="mb-4 rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.title}
            </h3>
          </div>
          <div className="divide-y divide-border">
            {group.flags.map((flag) =>
              flag.type === "toggle" ? (
                <FlagToggle
                  key={flag.key}
                  label={flag.label}
                  description={flag.description}
                  checked={flags[flag.key] === true}
                  onChange={(v) => onFlagChange(flag.key, v)}
                />
              ) : (
                <FlagInput
                  key={flag.key}
                  label={flag.label}
                  description={flag.description}
                  value={(flags[flag.key] as string) || ""}
                  placeholder={flag.placeholder || ""}
                  onChange={(v) => onFlagChange(flag.key, v)}
                />
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
