import { useSimulatedWebSocket } from "@/hooks/useSimulatedWebSocket";
import { MetricCard } from "@/components/monitor/MetricCard";
import { ProcessTable } from "@/components/monitor/ProcessTable";
import { TransactionFeed } from "@/components/monitor/TransactionFeed";
import { GlobalCommandBar } from "@/components/monitor/GlobalCommandBar";
import { Link } from "react-router-dom";
import { ArrowLeft, Wifi, WifiOff, Eye } from "lucide-react";
import horusIcon from "@/assets/horus-icon.jpg";
import { toast } from "sonner";

const Monitor = () => {
  const { connected, processes, transactions, metrics } = useSimulatedWebSocket();

  const handleAction = (actionId: string) => {
    const labels: Record<string, string> = {
      scan: "Security scan initiated…",
      lock: "Emergency lockdown activated.",
      flag: "Transaction flagging mode enabled.",
      "refresh-keys": "HSM key rotation triggered.",
      "sync-db": "Ledger sync in progress…",
      perf: "Generating performance report…",
      anomaly: "Running anomaly detection sweep…",
    };
    toast(labels[actionId] || "Command executed.");
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-mono text-xs">CLI</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2.5">
            <img src={horusIcon} alt="Horus" className="h-7 w-7 rounded-lg object-cover" />
            <div>
              <h1 className="font-mono text-sm font-semibold text-foreground flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-primary" />
                Horus Monitor
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <GlobalCommandBar onAction={handleAction} />
          <div className="flex items-center gap-2">
            {connected ? (
              <Wifi className="h-3.5 w-3.5 text-accent" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-destructive" />
            )}
            <span className="font-mono text-[10px] text-muted-foreground">
              {connected ? "LIVE" : "DISCONNECTED"}
            </span>
            <div className={`h-2 w-2 rounded-full ${connected ? "bg-accent animate-pulse" : "bg-destructive"}`} />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
            <MetricCard label="CPU" value={metrics.cpuUsage} unit="%" trend={metrics.cpuUsage > 70 ? "down" : "stable"} accent />
            <MetricCard label="Memory" value={metrics.memoryUsage} unit="%" />
            <MetricCard label="Net In" value={Math.round(metrics.networkIn)} unit="KB/s" trend="up" />
            <MetricCard label="Net Out" value={Math.round(metrics.networkOut)} unit="KB/s" />
            <MetricCard label="Connections" value={metrics.activeConnections} />
            <MetricCard label="Throughput" value={Math.round(metrics.throughput)} unit="tx/s" accent />
            <MetricCard label="Latency" value={metrics.latency.toFixed(1)} unit="ms" trend={metrics.latency > 20 ? "down" : "stable"} />
          </div>

          {/* Main content */}
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ProcessTable processes={processes} />
            </div>
            <div className="lg:col-span-2">
              <TransactionFeed transactions={transactions} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Monitor;
