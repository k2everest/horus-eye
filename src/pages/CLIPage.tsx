import { Link } from "react-router-dom";
import { Server, FolderPlus, Database, ShieldCheck, Info, ArrowRight } from "lucide-react";

const commands = [
  { id: "serve", label: "hz serve", description: "Start a Horizon server", icon: Server },
  { id: "init", label: "hz init", description: "Initialize a new project", icon: FolderPlus },
  { id: "schema", label: "hz schema", description: "Manage database schema", icon: Database },
  { id: "make-cert", label: "hz make-cert", description: "Create SSL certificate", icon: ShieldCheck },
  { id: "version", label: "hz version", description: "Display CLI version", icon: Info },
];

const CLIPage = () => {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">CLI Commands</h1>
        <p className="mt-1 text-sm text-muted-foreground">Select a command to configure and execute.</p>
      </div>

      <div className="space-y-2">
        {commands.map((cmd) => (
          <Link
            key={cmd.id}
            to={`/cli/${cmd.id}`}
            className="group flex items-center gap-4 rounded-xl border bg-card px-5 py-4 transition-all hover:border-primary/30"
          >
            <cmd.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm text-foreground">{cmd.label}</p>
              <p className="text-xs text-muted-foreground">{cmd.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
};

export default CLIPage;
