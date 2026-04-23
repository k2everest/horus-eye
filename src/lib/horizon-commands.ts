import {
  Activity,
  BadgeDollarSign,
  Database,
  Fingerprint,
  ShieldX,
  Workflow,
} from "lucide-react";
import type { HorizonCommand } from "@/types/horizon";

export interface HorizonCommandDefinition {
  id: HorizonCommand;
  domain: "auth" | "node" | "data" | "finance";
  action: string;
  label: string;
  description: string;
  icon: React.ElementType;
  category: string;
}

export const horizonCommandGroups: { category: string; commands: HorizonCommandDefinition[] }[] = [
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
        description: "Executa sincronização prioritária e rehash de blocos quando necessário.",
        icon: Workflow,
        category: "Node",
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
    ],
  },
  {
    category: "Finance",
    commands: [
      {
        id: "finance-audit",
        domain: "finance",
        action: "audit",
        label: "hz finance audit",
        description: "Executa auditoria rastreável com modo deep scan para análise crítica.",
        icon: BadgeDollarSign,
        category: "Finance",
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
  const parts = ["hz", definition.domain, definition.action];

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
];