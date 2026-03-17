import type { ProcessEntry } from "@/hooks/useSimulatedWebSocket";
import { cn } from "@/lib/utils";

interface ProcessTableProps {
  processes: ProcessEntry[];
}

const statusStyles: Record<ProcessEntry["status"], string> = {
  running: "bg-accent/15 text-accent",
  completed: "bg-primary/15 text-primary",
  failed: "bg-destructive/15 text-destructive",
  pending: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
};

const typeLabels: Record<ProcessEntry["type"], string> = {
  transaction: "TXN",
  audit: "AUD",
  encryption: "ENC",
  sync: "SYN",
  auth: "AUTH",
};

export function ProcessTable({ processes }: ProcessTableProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active Processes</h2>
      </div>
      <div className="divide-y divide-border">
        {processes.map((p) => (
          <div key={p.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/30">
            {/* Status dot */}
            <div className={cn(
              "h-2 w-2 rounded-full",
              p.status === "running" && "bg-accent animate-pulse",
              p.status === "completed" && "bg-primary",
              p.status === "failed" && "bg-destructive",
              p.status === "pending" && "bg-[hsl(var(--warning))]",
            )} />

            {/* Name + Type */}
            <div className="flex-1 min-w-0">
              <p className="truncate font-mono text-sm text-foreground">{p.name}</p>
              <p className="text-[10px] text-muted-foreground">{p.id}</p>
            </div>

            {/* Type badge */}
            <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {typeLabels[p.type]}
            </span>

            {/* CPU */}
            <div className="w-16 text-right">
              <p className="font-mono text-xs text-foreground tabular-nums">{p.cpu}%</p>
              <div className="mt-1 h-1 w-full rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", p.cpu > 70 ? "bg-destructive" : "bg-accent")}
                  style={{ width: `${p.cpu}%` }}
                />
              </div>
            </div>

            {/* Memory */}
            <div className="w-16 text-right">
              <p className="font-mono text-xs text-foreground tabular-nums">{p.memory}%</p>
              <div className="mt-1 h-1 w-full rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${p.memory}%` }}
                />
              </div>
            </div>

            {/* Status */}
            <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium", statusStyles[p.status])}>
              {p.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
