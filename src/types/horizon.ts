export type HorizonCommand = "serve" | "init" | "create-cert" | "version" | "schema" | "migrate" | "make-token";

export interface CommandConfig {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
}
