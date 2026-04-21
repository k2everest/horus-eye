import { Link } from "react-router-dom";
import {
  Server,
  Activity,
  Terminal,
  Shield,
  ArrowRight,
  Database,
  Key,
  ShieldCheck,
  Zap,
  Boxes,
  RefreshCw,
  AlertCircle,
  Cpu,
} from "lucide-react";
import { useMoneroBlocks } from "@/hooks/useMoneroBlocks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const quickLinks = [
  {
    title: "Start Server",
    description: "Configure & launch hz serve",
    icon: Server,
    href: "/cli/serve",
    glow: "primary",
  },
  {
    title: "Monitor",
    description: "Realtime process & tx monitoring",
    icon: Activity,
    href: "/monitor",
    glow: "accent",
  },
  {
    title: "Terminal",
    description: "Command history & output logs",
    icon: Terminal,
    href: "/terminal",
    glow: "primary",
  },
];

const recentActions = [
  { label: "hz serve --dev", time: "2m ago", icon: Server },
  { label: "hz schema save", time: "15m ago", icon: Database },
  { label: "hz create-cert", time: "1h ago", icon: ShieldCheck },
  { label: "hz make-token admin", time: "3h ago", icon: Key },
];

function shortHash(hash: string, len = 8) {
  if (!hash) return "—";
  return `${hash.slice(0, len)}…${hash.slice(-4)}`;
}

function formatAge(ts: number) {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatXmr(atomic: number) {
  return (atomic / 1e12).toFixed(4);
}

const Dashboard = () => {
  const { blocks, height, loading, error, refresh } = useMoneroBlocks(8, 15000);

  return (
    <div className="p-6 md:p-10 space-y-8">
      {/* Hero header */}
      <div className="relative text-center py-8 corner-brackets">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="font-display text-[10px] tracking-[0.3em] uppercase text-primary">
            System Online · Net.Sync
          </span>
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight text-gradient-neon mb-2">
          HORIZON.SYS
        </h1>
        <p className="font-mono text-xs text-muted-foreground tracking-wider">
          &gt; CLI management &amp; security monitoring · web3 native
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="neon-card group rounded-lg p-5 transition-all hover:border-primary/60 hover:shadow-[0_0_32px_-8px_hsl(var(--primary)/0.6)] hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md border transition-all",
                link.glow === "accent"
                  ? "border-accent/40 bg-accent/10 group-hover:shadow-[0_0_16px_hsl(var(--accent)/0.5)]"
                  : "border-primary/40 bg-primary/10 group-hover:shadow-[0_0_16px_hsl(var(--primary)/0.5)]"
              )}>
                <link.icon className={cn(
                  "h-4 w-4 transition-colors",
                  link.glow === "accent" ? "text-accent" : "text-primary"
                )} />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
            <h2 className="font-display text-sm tracking-wider uppercase text-foreground mb-1">{link.title}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{link.description}</p>
          </Link>
        ))}
      </div>

      {/* Monero Blocks (real data) */}
      <div className="neon-card rounded-lg p-5 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-accent text-glow-accent" />
            <h2 className="font-display text-[11px] tracking-[0.25em] uppercase text-foreground">
              Monero // Latest Blocks
            </h2>
            {height !== null && (
              <span className="font-mono text-[10px] text-primary/80 px-2 py-0.5 rounded border border-primary/30 bg-primary/5">
                tip #{height.toLocaleString()}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            className="h-7 text-[10px] gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
          >
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            Sync
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 mb-3">
            <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-destructive">{error}</p>
              <Link to="/settings" className="font-mono text-[10px] text-muted-foreground hover:text-primary">
                &gt; configure node →
              </Link>
            </div>
          </div>
        )}

        {!error && blocks.length === 0 && loading && (
          <p className="font-mono text-xs text-muted-foreground py-6 text-center animate-pulse">
            &gt; fetching blocks from chain...
          </p>
        )}

        {blocks.length > 0 && (
          <div className="space-y-1">
            {blocks.map((b, i) => (
              <div
                key={b.hash || b.height}
                className="flex items-center gap-3 rounded-md px-2 py-2 border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded border border-accent/30 bg-accent/5 shrink-0">
                  <Boxes className="h-3.5 w-3.5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary tabular-nums">
                      #{b.height.toLocaleString()}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                      {shortHash(b.hash)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {b.txCount} tx
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {(b.size / 1024).toFixed(1)}KB
                    </span>
                    <span className="font-mono text-[10px] text-success">
                      ◆ {formatXmr(b.reward)} XMR
                    </span>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                  {formatAge(b.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* System Status */}
        <div className="neon-card rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-success" />
            <h2 className="font-display text-[11px] tracking-[0.25em] uppercase text-foreground">System // Status</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Uptime", value: "99.97%", icon: Zap, color: "text-success" },
              { label: "Active Nodes", value: "12", icon: Cpu, color: "text-primary" },
              { label: "Threats Blocked", value: "847", icon: Shield, color: "text-accent" },
              { label: "Avg Latency", value: "12ms", icon: Activity, color: "text-primary" },
            ].map((stat) => (
              <div key={stat.label} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <stat.icon className={cn("h-3 w-3", stat.color)} />
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                </div>
                <p className={cn("font-display text-2xl tabular-nums", stat.color)}>{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Commands */}
        <div className="neon-card rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <h2 className="font-display text-[11px] tracking-[0.25em] uppercase text-foreground">Recent // Commands</h2>
            </div>
            <Link to="/terminal" className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors">
              view all →
            </Link>
          </div>
          <div className="space-y-1">
            {recentActions.map((action, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md px-2 py-2 border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all">
                <action.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs text-foreground/90 flex-1 truncate">
                  <span className="text-primary">$</span> {action.label}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{action.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All Commands link */}
      <Link
        to="/cli"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-card/30 backdrop-blur-sm py-3 font-mono text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
      >
        <Terminal className="h-4 w-4" />
        &gt; browse all CLI commands
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default Dashboard;
