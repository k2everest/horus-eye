import { Link } from "react-router-dom";
import { Server, Activity, Terminal, Shield, ArrowRight } from "lucide-react";

const quickLinks = [
  {
    title: "CLI Builder",
    description: "Configure and execute Horizon commands",
    icon: Terminal,
    href: "/cli/serve",
  },
  {
    title: "Process Monitor",
    description: "Real-time system & transaction monitoring",
    icon: Activity,
    href: "/monitor",
  },
  {
    title: "Terminal",
    description: "View command history and output logs",
    icon: Server,
    href: "/terminal",
  },
];

const Dashboard = () => {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Horizon CLI management & security monitoring platform.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            className="group rounded-xl border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-[0_0_24px_-8px_hsl(var(--primary)/0.2)]"
          >
            <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            <h2 className="mt-3 text-sm font-medium text-foreground">{link.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{link.description}</p>
            <div className="mt-4 flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
              <span>Open</span>
              <ArrowRight className="h-3 w-3" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">System Status</h2>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: "Uptime", value: "99.97%" },
            { label: "Active Nodes", value: "12" },
            { label: "Threats Blocked", value: "847" },
            { label: "Latency", value: "12ms" },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="font-mono text-xl font-semibold text-foreground tabular-nums">{stat.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
