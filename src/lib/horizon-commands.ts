import type { ElementType } from "react";
import {
  Activity,
  BadgeDollarSign,
  Ban,
  Database,
  Eye,
  FileSearch,
  Fingerprint,
  GitBranch,
  Hammer,
  KeyRound,
  LogIn,
  Play,
  RefreshCw,
  Rocket,
  Route,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldX,
  Sprout,
  Trash2,
  Workflow,
  Wrench,
} from "lucide-react";
import type { HorizonCommand } from "@/types/horizon";

export interface HorizonCommandDefinition {
  id: HorizonCommand;
  domain: string;
  action: string;
  label: string;
  description: string;
  icon: ElementType;
  category: string;
}

export const horizonCommandGroups: { category: string; commands: HorizonCommandDefinition[] }[] = [
  {
    category: "Lifecycle & Monitor",
    commands: [
      {
        id: "start",
        domain: "",
        action: "start",
        label: "hz start",
        description: "Inicia todos os serviços e o núcleo do sistema.",
        icon: Play,
        category: "Lifecycle & Monitor",
      },
      {
        id: "status",
        domain: "",
        action: "status",
        label: "hz status",
        description: "Painel de monitoramento em tempo real (dashboard live).",
        icon: Activity,
        category: "Lifecycle & Monitor",
      },
      {
        id: "logs",
        domain: "",
        action: "logs",
        label: "hz logs",
        description: "Exibe os logs contínuos de um módulo específico.",
        icon: ScrollText,
        category: "Lifecycle & Monitor",
      },
      {
        id: "check-health",
        domain: "",
        action: "check",
        label: "hz check",
        description: "Diagnóstico de conectividade, permissões e estado geral.",
        icon: Wrench,
        category: "Lifecycle & Monitor",
      },
    ],
  },
  {
    category: "Maintenance & Deploy",
    commands: [
      {
        id: "build",
        domain: "",
        action: "build",
        label: "hz build",
        description: "Compila a versão mais recente do sistema.",
        icon: Hammer,
        category: "Maintenance & Deploy",
      },
      {
        id: "deploy",
        domain: "",
        action: "deploy",
        label: "hz deploy",
        description: "Envia a build atual para o ambiente de homologação.",
        icon: Rocket,
        category: "Maintenance & Deploy",
      },
      {
        id: "db-reset",
        domain: "db",
        action: "reset",
        label: "hz db reset",
        description: "Limpa a base local e reaplica migrações. Operação destrutiva.",
        icon: Trash2,
        category: "Maintenance & Deploy",
      },
    ],
  },
  {
    category: "Auth",
    commands: [
      {
        id: "auth-rebind",
        domain: "auth",
        action: "rebind",
        label: "hz auth rebind",
        description: "Vincula uma identidade ao core com ID e email controlados.",
        icon: Fingerprint,
        category: "Auth",
      },
      {
        id: "auth-session-kill",
        domain: "auth",
        action: "session-kill",
        label: "hz auth session-kill",
        description: "Encerra sessões ativas do operador ou força limpeza global.",
        icon: ShieldX,
        category: "Auth",
      },
      {
        id: "auth-login",
        domain: "auth",
        action: "login",
        label: "hz auth login",
        description: "Revalida credenciais de superusuário (admin).",
        icon: LogIn,
        category: "Auth",
      },
    ],
  },
  {
    category: "Security",
    commands: [
      {
        id: "keys-rotate",
        domain: "keys",
        action: "rotate",
        label: "hz keys rotate",
        description: "Gera novos tokens de acesso para APIs.",
        icon: KeyRound,
        category: "Security",
      },
      {
        id: "security-last-ban",
        domain: "security",
        action: "",
        label: "hz security --last-ban",
        description: "Mostra detalhes do último IP bloqueado pelo firewall.",
        icon: ShieldAlert,
        category: "Security",
      },
      {
        id: "logs-grep",
        domain: "",
        action: "logs",
        label: "hz logs --grep",
        description: "Filtra eventos de log por padrão (ex: AUTH_FAILURE).",
        icon: Search,
        category: "Security",
      },
    ],
  },
  {
    category: "Finance",
    commands: [
      {
        id: "finance-logs",
        domain: "finance",
        action: "logs",
        label: "hz finance logs",
        description: "Histórico financeiro por usuário e período.",
        icon: ScrollText,
        category: "Finance",
      },
      {
        id: "finance-audit",
        domain: "finance",
        action: "audit",
        label: "hz finance audit",
        description: "Auditoria forense profunda de um usuário.",
        icon: BadgeDollarSign,
        category: "Finance",
      },
      {
        id: "finance-inspect",
        domain: "finance",
        action: "inspect",
        label: "hz finance inspect",
        description: "Extrai metadados detalhados de uma transação.",
        icon: FileSearch,
        category: "Finance",
      },
      {
        id: "finance-trace",
        domain: "finance",
        action: "trace",
        label: "hz finance trace",
        description: "Rastreia o destino de uma transferência por hash ou valor.",
        icon: Route,
        category: "Finance",
      },
    ],
  },
  {
    category: "Data",
    commands: [
      {
        id: "data-health",
        domain: "data",
        action: "health",
        label: "hz data health",
        description: "Verifica integridade do fluxo de dados da fonte conectada.",
        icon: Database,
        category: "Data",
      },
      {
        id: "data-fetch",
        domain: "data",
        action: "fetch",
        label: "hz data fetch",
        description: "Busca métricas externas (ex: solo, NPK, pH no TerraNode).",
        icon: Sprout,
        category: "Data",
      },
    ],
  },
  {
    category: "Node",
    commands: [
      {
        id: "node-sync",
        domain: "node",
        action: "sync",
        label: "hz node sync",
        description: "Sincronização prioritária e rehash de blocos quando necessário.",
        icon: Workflow,
        category: "Node",
      },
      {
        id: "node-clear-peers",
        domain: "node",
        action: "",
        label: "hz node --clear-peers",
        description: "Remove peers travados que impedem a sincronização.",
        icon: Ban,
        category: "Node",
      },
      {
        id: "node-rehash",
        domain: "node",
        action: "",
        label: "hz node --rehash-last-blocks",
        description: "Reavalia ~2.4% dos últimos blocos para corrigir corrupção.",
        icon: RefreshCw,
        category: "Node",
      },
    ],
  },
];

export const horizonCommands = horizonCommandGroups.flatMap((group) => group.commands);

export const horizonCommandMap = Object.fromEntries(
  horizonCommands.map((command) => [command.id, command])
) as Record<HorizonCommand, HorizonCommandDefinition>;

export function isHorizonCommand(value: string): value is HorizonCommand {
  return value in horizonCommandMap;
}

export function buildHzCommand(
  command: HorizonCommand,
  flags: Record<string, string | boolean>
) {
  const definition = horizonCommandMap[command];
  const parts = ["hz"];
  if (definition.domain) parts.push(definition.domain);
  if (definition.action) parts.push(definition.action);

  Object.entries(flags).forEach(([key, value]) => {
    if (value === true) parts.push(`--${key}`);
    else if (value !== false && value !== "") parts.push(`--${key}`, String(value));
  });

  return parts.join(" ");
}

export const spotlightActions = [
  {
    id: "auth-status",
    label: "Run Auth Rebind",
    description: "Reassocia identidade HORUS ao core autenticado",
    icon: Fingerprint,
    group: "Auth",
    href: "/cli/auth-rebind",
  },
  {
    id: "node-health",
    label: "Node Priority Sync",
    description: "Prioriza peers rápidos e reavalia blocos finais",
    icon: Activity,
    group: "Node",
    href: "/cli/node-sync",
  },
  {
    id: "system-status",
    label: "System Status (live)",
    description: "Painel de monitoramento em tempo real",
    icon: Eye,
    group: "Lifecycle",
    href: "/cli/status",
  },
  {
    id: "system-health",
    label: "Health Check",
    description: "Diagnóstico de conectividade e permissões",
    icon: Wrench,
    group: "Lifecycle",
    href: "/cli/check-health",
  },
  {
    id: "deploy",
    label: "Deploy",
    description: "Envia a build atual para homologação",
    icon: Rocket,
    group: "Deploy",
    href: "/cli/deploy",
  },
  {
    id: "keys-rotate",
    label: "Rotate API Keys",
    description: "Gera novos tokens de acesso",
    icon: KeyRound,
    group: "Security",
    href: "/cli/keys-rotate",
  },
  {
    id: "finance-trace",
    label: "Finance Trace",
    description: "Rastreia destino de uma transferência",
    icon: Route,
    group: "Finance",
    href: "/cli/finance-trace",
  },
  {
    id: "data-fetch-soil",
    label: "Fetch TerraNode Soil",
    description: "Puxa NPK, pH e umidade do TerraNode",
    icon: Sprout,
    group: "Data",
    href: "/cli/data-fetch",
  },
];

// Re-export icon for backwards compat (GitBranch was used elsewhere)
export { GitBranch };
