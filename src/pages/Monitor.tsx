import { useState } from "react";
import { useSimulatedWebSocket } from "@/hooks/useSimulatedWebSocket";
import { useRiskAlerts } from "@/hooks/useRiskAlerts";
import { MetricCard } from "@/components/monitor/MetricCard";
import { MetricsChart } from "@/components/monitor/MetricsChart";
import { ProcessTable } from "@/components/monitor/ProcessTable";
import { TransactionFeed } from "@/components/monitor/TransactionFeed";
import { AlertPanel } from "@/components/monitor/AlertPanel";
import { Wifi, WifiOff } from "lucide-react";

const Monitor = () => {
  const { connected, processes, transactions, metrics, metricsHistory } = useSimulatedWebSocket();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { alerts, activeAlerts, dismissAlert, dismissAll } = useRiskAlerts(transactions, soundEnabled);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground tracking-tight">Process Monitor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real-time system & transaction monitoring.</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="h-3.5 w-3.5 text-accent" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          <div className={`h-2 w-2 rounded-full ${connected ? "bg-accent animate-pulse" : "bg-destructive"}`} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7 mb-6">
        <MetricCard label="CPU" value={metrics.cpuUsage} unit="%" trend={metrics.cpuUsage > 70 ? "down" : "stable"} accent />
        <MetricCard label="Memory" value={metrics.memoryUsage} unit="%" />
        <MetricCard label="Net In" value={Math.round(metrics.networkIn)} unit="KB/s" trend="up" />
        <MetricCard label="Net Out" value={Math.round(metrics.networkOut)} unit="KB/s" />
        <MetricCard label="Conns" value={metrics.activeConnections} />
        <MetricCard label="Throughput" value={Math.round(metrics.throughput)} unit="tx/s" accent />
        <MetricCard label="Latency" value={metrics.latency.toFixed(1)} unit="ms" />
      </div>

      {/* Charts */}
      <div className="mb-6">
        <MetricsChart data={metricsHistory} />
      </div>

      {/* Tables & Alerts */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="space-y-6">
            <ProcessTable processes={processes} />
            <AlertPanel
              alerts={alerts}
              activeCount={activeAlerts.length}
              soundEnabled={soundEnabled}
              onToggleSound={() => setSoundEnabled((s) => !s)}
              onDismiss={dismissAlert}
              onDismissAll={dismissAll}
            />
          </div>
        </div>
        <div className="lg:col-span-2">
          <TransactionFeed transactions={transactions} />
        </div>
      </div>
    </div>
  );
};

export default Monitor;
