export type HorizonCommand =
  | "auth-rebind"
  | "auth-session-kill"
  | "node-sync"
  | "data-health"
  | "finance-audit";

export interface CommandConfig {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
}
