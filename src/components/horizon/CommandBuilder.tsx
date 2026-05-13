import type { HorizonCommand } from "@/types/horizon";
import { horizonCommandMap } from "@/lib/horizon-commands";
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

const commandFlags: Record<HorizonCommand, FlagGroup[]> = {
  // Lifecycle & monitor
  start: [
    {
      title: "Scope",
      flags: [
        { key: "all", label: "--all", description: "Inicia todos os serviços e o núcleo do sistema", type: "toggle", default: true },
      ],
    },
  ],
  status: [
    {
      title: "Mode",
      flags: [
        { key: "watch", label: "--watch", description: "Painel de monitoramento em tempo real", type: "toggle", default: true },
      ],
    },
  ],
  logs: [
    {
      title: "Stream",
      flags: [
        { key: "f", label: "-f", description: "Segue (follow) o stream de logs continuamente", type: "toggle", default: true },
        { key: "service", label: "[serviço]", description: "Nome do módulo/serviço alvo (posicional)", type: "text", placeholder: "core" },
      ],
    },
  ],
  "check-health": [
    {
      title: "Diagnóstico",
      flags: [
        { key: "health", label: "--health", description: "Verifica conectividade, permissões e saúde geral", type: "toggle", default: true },
      ],
    },
  ],

  // Maintenance & deploy
  build: [],
  deploy: [],
  "db-reset": [
    {
      title: "Confirmação",
      flags: [
        { key: "force", label: "--force", description: "Força reset destrutivo da base local", type: "toggle", default: false },
      ],
    },
  ],

  // Auth
  "auth-rebind": [
    {
      title: "Identity",
      flags: [
        { key: "id", label: "--id", description: "Identificador do operador ou core a vincular", type: "text", placeholder: "HORUS" },
        { key: "email", label: "--email", description: "Email associado ao vínculo autenticado", type: "text", placeholder: "ops@horizon.local" },
      ],
    },
  ],
  "auth-session-kill": [
    {
      title: "Options",
      flags: [
        { key: "all", label: "--all", description: "Encerra todas as sessões ativas", type: "toggle", default: true },
      ],
    },
  ],
  "auth-login": [
    {
      title: "Role",
      flags: [
        { key: "admin", label: "--admin", description: "Revalida credenciais de superusuário", type: "toggle", default: true },
      ],
    },
  ],

  // Security
  "keys-rotate": [],
  "security-last-ban": [
    {
      title: "Filter",
      flags: [
        { key: "last-ban", label: "--last-ban", description: "Mostra detalhes do último IP bloqueado", type: "toggle", default: true },
      ],
    },
  ],
  "logs-grep": [
    {
      title: "Pattern",
      flags: [
        { key: "grep", label: "--grep", description: "Padrão a filtrar nos logs", type: "text", placeholder: "AUTH_FAILURE" },
      ],
    },
  ],

  // Finance
  "finance-logs": [
    {
      title: "Query",
      flags: [
        { key: "user", label: "--user", description: "Usuário alvo do histórico", type: "text", placeholder: "Ivan" },
        { key: "period", label: "--period", description: "Janela temporal (ex: 4m, 30d)", type: "text", placeholder: "4m" },
      ],
    },
  ],
  "finance-audit": [
    {
      title: "Audit Scope",
      flags: [
        { key: "user", label: "--user", description: "Usuário alvo da auditoria financeira", type: "text", placeholder: "Horus" },
        { key: "deep-scan", label: "--deep-scan", description: "Varredura forense profunda (admin)", type: "toggle", default: false },
      ],
    },
  ],
  "finance-inspect": [
    {
      title: "Transaction",
      flags: [
        { key: "amount", label: "--amount", description: "Valor da transação a inspecionar", type: "text", placeholder: "1250.00" },
        { key: "detail", label: "--detail", description: "Inclui metadados e justificativa completa", type: "toggle", default: true },
      ],
    },
  ],
  "finance-trace": [
    {
      title: "Lookup",
      flags: [
        { key: "hash", label: "--hash", description: "Identificador da transação a rastrear", type: "text", placeholder: "0xabc123" },
        { key: "amount", label: "--amount", description: "Alternativa: rastrear por valor", type: "text", placeholder: "1250.00" },
      ],
    },
  ],

  // Data
  "data-health": [
    {
      title: "Source",
      flags: [
        { key: "source", label: "--source", description: "Origem do fluxo de dados a inspecionar", type: "text", placeholder: "terranode" },
      ],
    },
  ],
  "data-fetch": [
    {
      title: "Source",
      flags: [
        { key: "source", label: "--source", description: "Microserviço de origem", type: "text", placeholder: "terranode" },
        { key: "soil-metrics", label: "--soil-metrics", description: "Inclui NPK, pH e umidade do solo", type: "toggle", default: true },
      ],
    },
  ],

  // Node
  "node-sync": [
    {
      title: "Recovery",
      flags: [
        { key: "priority", label: "--priority", description: "Busca pares de alta velocidade primeiro", type: "toggle", default: false },
        { key: "rehash", label: "--rehash", description: "Reavalia os blocos finais", type: "toggle", default: false },
      ],
    },
  ],
  "node-clear-peers": [
    {
      title: "Peers",
      flags: [
        { key: "clear-peers", label: "--clear-peers", description: "Remove peers travados", type: "toggle", default: true },
      ],
    },
  ],
  "node-rehash": [
    {
      title: "Blocks",
      flags: [
        { key: "rehash-last-blocks", label: "--rehash-last-blocks", description: "Reavalia ~2.4% dos últimos blocos", type: "toggle", default: true },
      ],
    },
  ],
};

interface CommandBuilderProps {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
  onFlagChange: (key: string, value: string | boolean) => void;
}

export function CommandBuilder({ command, flags, onFlagChange }: CommandBuilderProps) {
  const def = horizonCommandMap[command];
  const groups = commandFlags[command] ?? [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-mono text-lg font-semibold text-foreground">{def.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{def.description}</p>
      </div>

      {groups.length === 0 && (
        <div className="rounded-xl border bg-card p-6">
          <p className="font-mono text-sm text-muted-foreground">
            No configurable options. Click <strong className="text-foreground">Execute</strong> to run.
          </p>
        </div>
      )}

      {groups.map((group) => (
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
