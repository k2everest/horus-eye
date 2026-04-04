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
} from "lucide-react";

const quickLinks = [
  {
    title: "Start Server",
    description: "Configure and launch hz serve",
    icon: Server,
    href: "/cli/serve",
    accent: true,
  },
  {
    title: "Monitor",
    description: "Real-time process & transaction monitoring",
    icon: Activity,
    href: "/monitor",
  },
  {
    title: "Terminal",
    description: "Command history and output logs",
    icon: Terminal,
    href: "/terminal",
  },
];

const recentActions = [
  { label: "hz serve --dev", time: "2m ago", icon: Server },
  { label: "hz schema save", time: "15m ago", icon: Database },
  { label: "hz create-cert", time: "1h ago", icon: ShieldCheck },
  { label: "hz make-token admin", time: "3h ago", icon: Key },
];

const Dashboard = () => {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Horizon</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CLI management & security monitoring dashboard.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="group rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.15)]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                <link.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
            </div>
            <h2 className="text-sm font-medium text-foreground">{link.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{link.description}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* System Status */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-4 w-4 text-accent" />
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">System Status</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Uptime", value: "99.97%", icon: Zap },
              { label: "Active Nodes", value: "12" },
              { label: "Threats Blocked", value: "847" },
              { label: "Avg Latency", value: "12ms" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="font-mono text-xl font-semibold text-foreground tabular-nums">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Commands */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent Commands</h2>
            </div>
            <Link to="/terminal" className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
              View all →
            </Link>
          </div>
          <div className="space-y-1">
            {recentActions.map((action, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-secondary/50 transition-colors">
                <action.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs text-foreground flex-1 truncate">{action.label}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{action.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* All Commands link */}
      <Link
        to="/cli"
        className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
      >
        <Terminal className="h-4 w-4" />
        Browse all CLI commands
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default Dashboard;
