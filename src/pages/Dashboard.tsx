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
  Radar,
  ShieldAlert,
} from "lucide-react";
import { useMoneroBlocks } from "@/hooks/useMoneroBlocks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const quickLinks = [
  {
    title: "Auth Rebind",
    description: "Vincule identidades HORUS ao core autenticado",
    icon: Key,
    href: "/cli/auth-rebind",
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
    title: "Data Health",
    description: "Cheque o TerraNode e a integridade do fluxo em segundos",
    icon: Database,
    href: "/cli/data-health",
    glow: "primary",
  },
];

const recentActions = [
  { label: 'hz auth rebind --id "HORUS" --email "coebsm@gmail.com"', time: "2m ago", icon: Key },
  { label: "hz auth session-kill --all", time: "15m ago", icon: Shield },
  { label: "hz data health --source terranode", time: "1h ago", icon: Database },
  { label: "hz finance audit --user Horus --deep-scan", time: "3h ago", icon: ShieldCheck },
];

const systemStats = [
  { label: "Uptime", value: "99.97%", icon: Zap, color: "text-success" },
  { label: "Active Nodes", value: "12", icon: Cpu, color: "text-primary" },
  { label: "Threats Blocked", value: "847", icon: Shield, color: "text-accent" },
  { label: "Avg Latency", value: "12ms", icon: Activity, color: "text-primary" },
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

const SectionHeader = ({
  icon: Icon,
  title,
  accent = false,
  right,
}: {
  icon: React.ElementType;
  title: string;
  accent?: boolean;
  right?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between mb-5 pb-3 border-b border-primary/10">
    <div className="flex items-center gap-2.5">
      <div className={cn(
        "flex h-7 w-7 items-center justify-center rounded border",
        accent ? "border-accent/40 bg-accent/5" : "border-primary/40 bg-primary/5"
      )}>
        <Icon className={cn("h-3.5 w-3.5", accent ? "text-accent" : "text-primary")} />
      </div>
      <h2 className="font-display text-[11px] tracking-[0.3em] uppercase text-foreground/90">
        {title}
      </h2>
    </div>
    {right}
  </div>
);

const Dashboard = () => {
  const { blocks, height, nodeInfo, loading, error, refresh, healingState, healingReason, healingLog, runAutoHeal } = useMoneroBlocks(8, 15000);

  const healingTone =
    healingState === "recovering"
      ? "text-destructive"
      : healingState === "armed"
      ? "text-[hsl(var(--warning))]"
      : healingState === "watching"
      ? "text-primary"
      : "text-success";

  const healingLabel =
    healingState === "recovering"
      ? "auto-healing"
      : healingState === "armed"
      ? "armed"
      : healingState === "watching"
      ? "watching"
      : "stable";

  return (
    <div className="px-6 md:px-10 py-10 mx-auto w-full max-w-5xl space-y-10">
      {/* Hero header */}
      <section className="relative text-center py-12 corner-brackets">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 mb-5">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="font-display text-[10px] tracking-[0.3em] uppercase text-primary">
            System Online · Net.Sync
          </span>
        </div>
        <h1 className="font-display text-5xl md:text-6xl tracking-tight text-gradient-neon mb-3">
          HORIZON.SYS
        </h1>
        <p className="font-mono text-xs text-muted-foreground tracking-[0.2em] uppercase">
          &gt; cli management · security monitoring · web3 native
        </p>
        <div className="mx-auto mt-6 h-px w-24 bg-gradient-to-r from-transparent via-primary to-transparent" />
      </section>

      {/* Quick Actions */}
      <section>
        <div className="text-center mb-5">
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.4em] uppercase">
            // quick.access
          </p>
        </div>
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
      </section>

      {/* System Status */}
      <section className="neon-card rounded-lg p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <SectionHeader
          icon={Shield}
          title="System // Status"
          right={
            <span className="font-mono text-[10px] text-success flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              operational
            </span>
          }
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {systemStats.map((stat) => (
            <div key={stat.label} className="text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5">
                <stat.icon className={cn("h-3 w-3", stat.color)} />
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.2em]">{stat.label}</p>
              </div>
              <p className={cn("font-display text-3xl tabular-nums", stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="neon-card rounded-lg p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <SectionHeader
          icon={Radar}
          title="Node // Auto-Healing"
          right={
            <div className="flex items-center gap-2">
              <span className={cn("font-mono text-[10px] uppercase tracking-[0.25em]", healingTone)}>
                {healingLabel}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => runAutoHeal("disparo manual")}
                disabled={healingState === "recovering"}
                className="h-7 text-[10px] gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <ShieldAlert className="h-3 w-3" />
                Force heal
              </Button>
            </div>
          }
        />
        <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr_0.8fr]">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
                <ShieldAlert className={cn("h-4 w-4", healingTone)} />
              </div>
              <div className="space-y-1">
                <p className="font-display text-sm uppercase tracking-wider text-foreground">Watcher autonomy loop</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {healingReason ?? "Monitorando avanço do daemon, sincronização final e sinais de rejeição."}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Sync status</p>
            <p className="mt-2 font-display text-2xl text-foreground">
              {nodeInfo?.synchronized ? "synced" : nodeInfo ? "syncing" : "offline"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Current height</p>
            <p className="mt-2 font-display text-2xl text-foreground tabular-nums">
              {nodeInfo?.height?.toLocaleString() ?? height?.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>
        {healingLog.length > 0 && (
          <div className="mt-4 rounded-md border border-border/60 bg-background/40 p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
              // healing.trace
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {healingLog.map((entry, i) => (
                <div key={`${entry.ts}-${i}`} className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(entry.ts).toLocaleTimeString()}
                  </span>
                  <span className={entry.ok ? "text-success" : "text-destructive"}>
                    {entry.ok ? "✓" : "✗"}
                  </span>
                  <span className="text-foreground/90">{entry.step}</span>
                  {entry.detail && (
                    <span className="text-muted-foreground truncate">— {entry.detail}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Monero Blocks */}
      <section className="neon-card rounded-lg p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <SectionHeader
          icon={Boxes}
          title="Monero // Latest Blocks"
          accent
          right={
            <div className="flex items-center gap-2">
              {height !== null && (
                <span className="font-mono text-[10px] text-primary/80 px-2 py-0.5 rounded border border-primary/30 bg-primary/5">
                  tip #{height.toLocaleString()}
                </span>
              )}
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
          }
        />

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
            {blocks.map((b) => (
              <div
                key={b.hash || b.height}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all"
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
      </section>

      {/* Recent Commands */}
      <section className="neon-card rounded-lg p-6 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <SectionHeader
          icon={Terminal}
          title="Recent // Commands"
          right={
            <Link to="/terminal" className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors">
              view all →
            </Link>
          }
        />
        <div className="space-y-1">
          {recentActions.map((action, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2.5 border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all">
              <action.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs text-foreground/90 flex-1 truncate">
                <span className="text-primary">$</span> {action.label}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">{action.time}</span>
            </div>
          ))}
        </div>
      </section>

      {/* All Commands link */}
      <Link
        to="/cli"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-card/30 backdrop-blur-sm py-3.5 font-mono text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary hover:bg-primary/5"
      >
        <Terminal className="h-4 w-4" />
        &gt; browse all CLI commands
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default Dashboard;
