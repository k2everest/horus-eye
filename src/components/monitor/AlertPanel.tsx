import type { RiskAlert } from "@/hooks/useRiskAlerts";
import { cn } from "@/lib/utils";
import { ShieldAlert, X, BellOff, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AlertPanelProps {
  alerts: RiskAlert[];
  activeCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}

export function AlertPanel({
  alerts,
  activeCount,
  soundEnabled,
  onToggleSound,
  onDismiss,
  onDismissAll,
}: AlertPanelProps) {
  const recent = alerts.slice(0, 10);

  return (
    <div className="rounded-xl border border-destructive/30 bg-card/50">
      <div className="flex items-center justify-between border-b border-destructive/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-destructive">
            Risk Alerts
          </h2>
          {activeCount > 0 && (
            <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleSound}
            title={soundEnabled ? "Mute alerts" : "Enable sound"}
          >
            {soundEnabled ? (
              <Bell className="h-3 w-3 text-muted-foreground" />
            ) : (
              <BellOff className="h-3 w-3 text-muted-foreground" />
            )}
          </Button>
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground" onClick={onDismissAll}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      {recent.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No high-risk transactions detected.</p>
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto divide-y divide-border/50">
          {recent.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 transition-all",
                alert.dismissed ? "opacity-40" : "bg-destructive/5 animate-in fade-in slide-in-from-top-1 duration-300"
              )}
            >
              <div
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  alert.dismissed ? "bg-muted-foreground/30" : "bg-destructive animate-pulse"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{alert.transaction.from}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="font-mono text-xs text-foreground">{alert.transaction.to}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">{alert.id}</span>
                  <span className="rounded bg-destructive/20 px-1 text-[9px] font-bold text-destructive tabular-nums">
                    RISK {alert.transaction.riskScore}
                  </span>
                </div>
              </div>
              <span className="font-mono text-xs font-medium text-foreground tabular-nums">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: alert.transaction.currency,
                  maximumFractionDigits: 0,
                }).format(alert.transaction.amount)}
              </span>
              {!alert.dismissed && (
                <button
                  onClick={() => onDismiss(alert.id)}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
