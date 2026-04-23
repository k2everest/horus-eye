import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { horizonCommandGroups } from "@/lib/horizon-commands";

const CLIPage = () => {
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Unified CLI Commands</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Execute a spec única do Horizon com domínios auth, node, data e finance.
        </p>
      </div>

      {horizonCommandGroups.map((group) => (
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
