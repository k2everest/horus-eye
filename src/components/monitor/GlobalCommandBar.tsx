import { useState, useEffect } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Shield,
  Activity,
  Search,
  Lock,
  AlertTriangle,
  RefreshCw,
  Database,
  Zap,
} from "lucide-react";

interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  shortcut?: string;
  group: string;
}

const actions: CommandAction[] = [
  { id: "scan", label: "Run Security Scan", description: "Full PCI-DSS compliance check", icon: Shield, shortcut: "⌘S", group: "Security" },
  { id: "lock", label: "Emergency Lockdown", description: "Freeze all outbound transactions", icon: Lock, shortcut: "⌘L", group: "Security" },
  { id: "flag", label: "Flag Transaction", description: "Mark a transaction for manual review", icon: AlertTriangle, group: "Security" },
  { id: "refresh-keys", label: "Rotate HSM Keys", description: "Trigger key rotation across all vaults", icon: RefreshCw, group: "Operations" },
  { id: "sync-db", label: "Force Ledger Sync", description: "Synchronize distributed ledger nodes", icon: Database, group: "Operations" },
  { id: "perf", label: "Performance Report", description: "Generate throughput & latency analysis", icon: Activity, group: "Analytics" },
  { id: "anomaly", label: "Anomaly Detection", description: "Run ML-based fraud detection sweep", icon: Zap, group: "Analytics" },
];

interface GlobalCommandBarProps {
  onAction?: (actionId: string) => void;
}

export function GlobalCommandBar({ onAction }: GlobalCommandBarProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const grouped = actions.reduce<Record<string, CommandAction[]>>((acc, a) => {
    (acc[a.group] ??= []).push(a);
    return acc;
  }, {});

  return (
    <>
      {/* Trigger bar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground focus:outline-none"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="font-mono text-xs">Command</span>
        <kbd className="ml-4 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {Object.entries(grouped).map(([group, items], i) => (
            <div key={group}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {items.map((action) => (
                  <CommandItem
                    key={action.id}
                    onSelect={() => {
                      onAction?.(action.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <action.icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                    {action.shortcut && (
                      <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {action.shortcut}
                      </kbd>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
