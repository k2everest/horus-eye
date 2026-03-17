import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  accent?: boolean;
}

export function MetricCard({ label, value, unit, trend, accent }: MetricCardProps) {
  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 transition-all duration-300",
      accent && "border-primary/30 shadow-[0_0_20px_-8px_hsl(var(--primary)/0.3)]"
    )}>
      <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold text-foreground tabular-nums">
          {typeof value === "number" ? Math.round(value) : value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        {trend && (
          <span className={cn(
            "ml-auto text-xs font-medium",
            trend === "up" && "text-accent",
            trend === "down" && "text-destructive",
            trend === "stable" && "text-muted-foreground",
          )}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
          </span>
        )}
      </div>
    </div>
  );
}
