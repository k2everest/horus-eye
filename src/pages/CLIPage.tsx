import { Link } from "react-router-dom";
import { Server, FolderPlus, Database, ShieldCheck, Info, ArrowRight, RefreshCw, Key } from "lucide-react";

const commandGroups = [
  {
    category: "Server",
    commands: [
      { id: "serve", label: "hz serve", description: "Start a Horizon server for your project", icon: Server },
    ],
  },
  {
    category: "Project",
    commands: [
      { id: "init", label: "hz init", description: "Initialize a new Horizon project", icon: FolderPlus },
      { id: "schema", label: "hz schema", description: "Save or apply database schema", icon: Database },
      { id: "migrate", label: "hz migrate", description: "Migrate database from 1.x to 2.x format", icon: RefreshCw },
    ],
  },
  {
    category: "Utilities",
    commands: [
      { id: "create-cert", label: "hz create-cert", description: "Create a self-signed TLS certificate pair", icon: ShieldCheck },
      { id: "make-token", label: "hz make-token", description: "Manually create a JWT for user bootstrapping", icon: Key },
      { id: "version", label: "hz version", description: "Display the current CLI version", icon: Info },
    ],
  },
];

const CLIPage = () => {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">CLI Commands</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and execute Horizon CLI commands with a visual interface.
        </p>
      </div>

      {commandGroups.map((group) => (
        <div key={group.category} className="mb-6">
          <p className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {group.category}
          </p>
          <div className="space-y-1.5">
            {group.commands.map((cmd) => (
              <Link
                key={cmd.id}
                to={`/cli/${cmd.id}`}
                className="group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 transition-all hover:border-primary/30 hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.15)]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary shrink-0">
                  <cmd.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-foreground">{cmd.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cmd.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CLIPage;
