import type { Transaction } from "@/hooks/useSimulatedWebSocket";
import { cn } from "@/lib/utils";

interface TransactionFeedProps {
  transactions: Transaction[];
}

const statusIcon: Record<Transaction["status"], string> = {
  verified: "✓",
  pending: "◌",
  flagged: "⚠",
  rejected: "✕",
};

const statusColor: Record<Transaction["status"], string> = {
  verified: "text-accent",
  pending: "text-[hsl(var(--warning))]",
  flagged: "text-destructive",
  rejected: "text-destructive",
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function TransactionFeed({ transactions }: TransactionFeedProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Transaction Feed</h2>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <div className="divide-y divide-border">
          {transactions.map((tx) => (
            <div key={tx.id + tx.timestamp.getTime()} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-secondary/30">
              <span className={cn("text-sm font-bold", statusColor[tx.status])}>
                {statusIcon[tx.status]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{tx.from}</span>
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <span className="font-mono text-xs text-foreground">{tx.to}</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{tx.id}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-xs font-medium text-foreground tabular-nums">
                  {formatCurrency(tx.amount, tx.currency)}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  risk: {tx.riskScore}
                </p>
              </div>
              {tx.riskScore > 70 && (
                <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
