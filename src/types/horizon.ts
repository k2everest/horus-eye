export type HorizonCommand = "serve" | "init" | "make-cert" | "version" | "schema";

export interface CommandConfig {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
}
