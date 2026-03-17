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

const serveFlags: FlagGroup[] = [
  {
    title: "Development",
    flags: [
      { key: "dev", label: "--dev", description: "Run in development mode (enables --secure no, --permissions no, --start-rethinkdb)", type: "toggle", default: false },
      { key: "secure", label: "--secure", description: "Serve websockets and files over HTTPS", type: "toggle", default: true },
      { key: "permissions", label: "--permissions", description: "Enable or disable permission checks on requests", type: "toggle", default: true },
      { key: "start-rethinkdb", label: "--start-rethinkdb", description: "Automatically start a local RethinkDB server", type: "toggle", default: false },
      { key: "auto-create-collection", label: "--auto-create-collection", description: "Create collections automatically on first use", type: "toggle", default: false },
      { key: "auto-create-index", label: "--auto-create-index", description: "Create indexes automatically on first use", type: "toggle", default: false },
    ],
  },
  {
    title: "Authentication",
    flags: [
      { key: "allow-anonymous", label: "--allow-anonymous", description: "Allow anonymous user connections", type: "toggle", default: false },
      { key: "allow-unauthenticated", label: "--allow-unauthenticated", description: "Allow unauthenticated requests", type: "toggle", default: false },
      { key: "auth", label: "--auth", description: "Auth providers (comma-separated: github,google,twitter,facebook)", type: "text", placeholder: "github,google" },
      { key: "token-secret", label: "--token-secret", description: "Key string for signing JWTs", type: "text", placeholder: "my-secret-key" },
    ],
  },
  {
    title: "Network",
    flags: [
      { key: "bind", label: "--bind", description: "Host to listen on for incoming requests", type: "text", default: "localhost", placeholder: "0.0.0.0" },
      { key: "port", label: "--port", description: "Port for the Horizon server", type: "text", default: "8181", placeholder: "8181" },
      { key: "connect", label: "--connect", description: "RethinkDB host:port or URI", type: "text", default: "localhost:28015", placeholder: "localhost:28015" },
      { key: "access-control-allow-origin", label: "--access-control-allow-origin", description: "Set CORS origin header", type: "text", placeholder: '"*"'},
    ],
  },
  {
    title: "SSL",
    flags: [
      { key: "cert-file", label: "--cert-file", description: "Path to certificate file", type: "text", placeholder: "./horizon-cert.pem" },
      { key: "key-file", label: "--key-file", description: "Path to key file", type: "text", placeholder: "./horizon-key.pem" },
    ],
  },
  {
    title: "General",
    flags: [
      { key: "project-name", label: "--project-name", description: "Name of the Horizon project", type: "text", placeholder: "my-app" },
      { key: "serve-static", label: "--serve-static", description: "Serve static files from a directory", type: "text", placeholder: "./dist" },
      { key: "debug", label: "--debug", description: "Enable debug logging", type: "toggle", default: false },
    ],
  },
];

const initFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "project-name", label: "project name", description: "Directory/project name to initialize", type: "text", placeholder: "my-horizon-app" },
    ],
  },
];

const schemaFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "apply", label: "--apply", description: "Apply the schema to the database", type: "toggle", default: false },
      { key: "save", label: "--save", description: "Save the current database schema to .hz/schema.toml", type: "toggle", default: false },
      { key: "connect", label: "--connect", description: "RethinkDB host:port", type: "text", placeholder: "localhost:28015" },
    ],
  },
];

const commandData: Record<HorizonCommand, { title: string; description: string; groups: FlagGroup[] }> = {
  serve: {
    title: "hz serve",
    description: "Start a Horizon server for your project. Serves HTTP(S) requests and connects to RethinkDB.",
    groups: serveFlags,
  },
  init: {
    title: "hz init",
    description: "Initialize a new Horizon project with scaffolding and configuration files.",
    groups: initFlags,
  },
  "make-cert": {
    title: "hz make-cert",
    description: "Create a self-signed SSL certificate for development use.",
    groups: [],
  },
  version: {
    title: "hz version",
    description: "Display the current version of the Horizon CLI.",
    groups: [],
  },
  schema: {
    title: "hz schema",
    description: "Apply or save the database schema for your Horizon project.",
    groups: schemaFlags,
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
      {/* Command Header */}
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
