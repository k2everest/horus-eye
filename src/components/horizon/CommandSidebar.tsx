import { Terminal, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import type { HorizonCommand } from "@/types/horizon";
import { horizonCommandGroups } from "@/lib/horizon-commands";

const commands: {
  category: string;
  items: { id: HorizonCommand; label: string; icon: React.ElementType }[];
}[] = horizonCommandGroups.map((group) => ({
  category: group.category,
  items: group.commands.map((command) => ({
    id: command.id,
    label: `${command.domain} ${command.action}`,
    icon: command.icon,
  })),
}));

interface CommandSidebarProps {
  activeCommand: HorizonCommand;
  onSelectCommand: (cmd: HorizonCommand) => void;
}

export function CommandSidebar({ activeCommand, onSelectCommand }: CommandSidebarProps) {
  return (
    <aside className="flex w-56 flex-col border-r bg-card">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <Terminal className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight">
          Horizon <span className="text-muted-foreground font-normal">GUI</span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {commands.map((group) => (
          <div key={group.category} className="mb-4">
            <p className="mb-1.5 px-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.category}
            </p>
            {group.items.map((item) => {
              const isActive = activeCommand === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectCommand(item.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="font-mono text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <Link
          to="/monitor"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Activity className="h-4 w-4" />
          <span className="font-mono text-xs">Monitor</span>
        </Link>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          hz v3.0.0 • unified spec
        </p>
      </div>
    </aside>
  );
}
