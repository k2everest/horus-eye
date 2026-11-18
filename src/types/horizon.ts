export type HorizonCommand =
  // Lifecycle & monitoring
  | "start"
  | "status"
  | "logs"
  | "check-health"
  // Maintenance & deploy
  | "build"
  | "deploy"
  | "db-reset"
  // Auth
  | "auth-rebind"
  | "auth-session-kill"
  | "auth-login"
  // Security
  | "keys-rotate"
  | "security-last-ban"
  | "logs-grep"
  // Finance
  | "finance-logs"
  | "finance-audit"
  | "finance-inspect"
  | "finance-trace"
  // Data
  | "data-health"
  | "data-fetch"
  // Node
  | "node-sync"
  | "node-clear-peers"
  | "node-rehash";

export interface CommandConfig {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
}
