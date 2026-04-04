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
      { key: "dev", label: "--dev", description: "Run in development mode (enables insecure defaults for local use)", type: "toggle", default: false },
      { key: "secure", label: "--secure", description: "Serve websockets and files over HTTPS", type: "toggle", default: true },
      { key: "permissions", label: "--permissions", description: "Enable permission checks on requests", type: "toggle", default: true },
      { key: "start-rethinkdb", label: "--start-rethinkdb", description: "Automatically start a local RethinkDB server", type: "toggle", default: false },
      { key: "auto-create-collection", label: "--auto-create-collection", description: "Create collections automatically on first use (dev only)", type: "toggle", default: false },
      { key: "auto-create-index", label: "--auto-create-index", description: "Create indexes automatically on first use (dev only)", type: "toggle", default: false },
    ],
  },
  {
    title: "General",
    flags: [
      { key: "project-name", label: "--project-name", description: "Name of the Horizon project (determines RethinkDB database name)", type: "text", placeholder: "my-app" },
      { key: "serve-static", label: "--serve-static", description: "Serve static files from a directory", type: "text", placeholder: "./dist" },
      { key: "schema-file", label: "--schema-file", description: "Use a given schema file for the database", type: "text", placeholder: ".hz/schema.toml" },
      { key: "debug", label: "--debug", description: "Print additional debug output", type: "toggle", default: false },
    ],
  },
  {
    title: "Network",
    flags: [
      { key: "bind", label: "--bind", description: "Host to listen on for incoming requests", type: "text", default: "localhost", placeholder: "0.0.0.0" },
      { key: "port", label: "--port", description: "Port for the Horizon server", type: "text", default: "8181", placeholder: "8181" },
      { key: "connect", label: "--connect", description: "RethinkDB host:port or rethinkdb:// URI", type: "text", default: "localhost:28015", placeholder: "localhost:28015" },
      { key: "key-file", label: "--key-file", description: "Path to TLS key file", type: "text", placeholder: "./horizon-key.pem" },
      { key: "cert-file", label: "--cert-file", description: "Path to TLS certificate file", type: "text", placeholder: "./horizon-cert.pem" },
      { key: "access-control-allow-origin", label: "--access-control-allow-origin", description: "Set CORS origin header", type: "text", placeholder: '"*"' },
      { key: "rdb_timeout", label: "--rdb_timeout", description: "Timeout for RethinkDB connection (seconds)", type: "text", default: "20", placeholder: "20" },
    ],
  },
  {
    title: "RethinkDB Connection",
    flags: [
      { key: "rdb_host", label: "--rdb_host", description: "RethinkDB hostname (alternative to --connect)", type: "text", placeholder: "localhost" },
      { key: "rdb_port", label: "--rdb_port", description: "RethinkDB port (alternative to --connect)", type: "text", placeholder: "28015" },
      { key: "rdb_user", label: "--rdb_user", description: "RethinkDB username", type: "text", placeholder: "admin" },
      { key: "rdb_password", label: "--rdb_password", description: "RethinkDB password", type: "text", placeholder: "••••" },
    ],
  },
  {
    title: "Authentication",
    flags: [
      { key: "allow-anonymous", label: "--allow-anonymous", description: "Allow anonymous user connections", type: "toggle", default: false },
      { key: "allow-unauthenticated", label: "--allow-unauthenticated", description: "Allow unauthenticated requests", type: "toggle", default: false },
      { key: "auth", label: "--auth", description: "Auth provider with ID and secret (e.g. facebook,ID,SECRET)", type: "text", placeholder: "github,ID,SECRET" },
      { key: "auth-redirect", label: "--auth-redirect", description: "URL to redirect to after authentication", type: "text", default: "/", placeholder: "/" },
      { key: "token-secret", label: "--token-secret", description: "Key string for signing JWTs", type: "text", placeholder: "my-secret-key" },
    ],
  },
];

const initFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "directory", label: "directory", description: "Directory/project name to initialize. Uses current directory if omitted.", type: "text", placeholder: "my-horizon-app" },
    ],
  },
];

const schemaFlags: FlagGroup[] = [
  {
    title: "Subcommand",
    flags: [
      { key: "save", label: "save", description: "Save current database schema to .hz/schema.toml", type: "toggle", default: false },
      { key: "apply", label: "apply", description: "Load a previously-saved schema into the cluster", type: "toggle", default: false },
    ],
  },
  {
    title: "Options",
    flags: [
      { key: "force", label: "--force", description: "Override conflicting schema on apply", type: "toggle", default: false },
      { key: "connect", label: "--connect", description: "RethinkDB host:port", type: "text", placeholder: "localhost:28015" },
    ],
  },
];

const makeTokenFlags: FlagGroup[] = [
  {
    title: "Options",
    flags: [
      { key: "user-id", label: "user-id", description: "The user ID to create a JWT for (e.g. admin user bootstrapping)", type: "text", placeholder: "admin-user-id" },
    ],
  },
];

const commandData: Record<HorizonCommand, { title: string; description: string; groups: FlagGroup[] }> = {
  serve: {
    title: "hz serve",
    description: "Start a Horizon server. Serves HTTP(S) requests and connects to RethinkDB. Use --dev for local development with insecure defaults.",
    groups: serveFlags,
  },
  init: {
    title: "hz init",
    description: "Initialize a new Horizon project with scaffolding and configuration files.",
    groups: initFlags,
  },
  "create-cert": {
    title: "hz create-cert",
    description: "Create a self-signed TLS certificate pair (horizon-cert.pem and horizon-key.pem) for development use.",
    groups: [],
  },
  version: {
    title: "hz version",
    description: "Display the current version of the Horizon CLI.",
    groups: [],
  },
  schema: {
    title: "hz schema",
    description: "Save or apply the database schema. Use 'save' to export current schema as TOML, or 'apply' to load a schema file.",
    groups: schemaFlags,
  },
  migrate: {
    title: "hz migrate",
    description: "Migrate a Horizon database from the 1.x to 2.x internal format. Required before using hz serve with a 1.x database.",
    groups: [],
  },
  "make-token": {
    title: "hz make-token",
    description: "Manually create a JSON Web Token for a user, enabling admin bootstrapping. The JWT is printed to the console.",
    groups: makeTokenFlags,
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
