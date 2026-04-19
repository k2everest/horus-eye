import { useState } from "react";
import { useSimulatedWebSocket } from "@/hooks/useSimulatedWebSocket";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Server, Wifi, WifiOff, ArrowUpRight, ArrowDownLeft, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

interface NodeInfo {
  version?: string;
  height?: number;
  target_height?: number;
  status?: string;
  synchronized?: boolean;
  nettype?: string;
  outgoing_connections_count?: number;
  incoming_connections_count?: number;
}

async function callMoneroRpc(config: NodeConfig, method: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("monero-rpc", {
    body: {
      host: config.host,
      port: config.port,
      username: config.username || undefined,
      password: config.password || undefined,
      https: config.https,
      method,
      params,
    },
  });
  if (error) throw new Error(error.message);
  if (data?.status && data.status >= 400) {
    throw new Error(data?.data?.error?.message || `RPC error ${data.status}`);
  }
  return data?.data?.result ?? data?.data;
}

interface NodeConfig {
  host: string;
  port: string;
  username: string;
  password: string;
}

const defaultConfig: NodeConfig = {
  host: "127.0.0.1",
  port: "18081",
  username: "",
  password: "",
};

function loadConfig(): NodeConfig {
  try {
    const saved = localStorage.getItem("monero-node-config");
    return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

const statusIcon: Record<string, React.ReactNode> = {
  verified: <CheckCircle2 className="h-3.5 w-3.5 text-accent" />,
  pending: <Clock className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />,
  flagged: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />,
  rejected: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const SettingsPage = () => {
  const [config, setConfig] = useState<NodeConfig>(loadConfig);
  const [nodeStatus, setNodeStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const { transactions, metrics } = useSimulatedWebSocket();

  const handleSave = () => {
    localStorage.setItem("monero-node-config", JSON.stringify(config));
    toast.success("Node configuration saved.");
  };

  const handleConnect = () => {
    if (!config.host || !config.port) {
      toast.error("Host and port are required.");
      return;
    }
    setNodeStatus("connecting");
    setTimeout(() => {
      setNodeStatus("connected");
      toast.success(`Connected to ${config.host}:${config.port}`);
    }, 1500);
  };

  const handleDisconnect = () => {
    setNodeStatus("disconnected");
    toast("Disconnected from node.");
  };

  // Derived stats
  const totalVolume = transactions.reduce((s, t) => s + t.amount, 0);
  const flaggedCount = transactions.filter((t) => t.status === "flagged" || t.status === "rejected").length;
  const verifiedCount = transactions.filter((t) => t.status === "verified").length;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Node configuration & transaction dashboard.</p>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="node">Monero Node</TabsTrigger>
        </TabsList>

        {/* ─── Dashboard Tab ─── */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Transactions</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">{transactions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Volume</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-foreground tabular-nums">
                  ${Math.round(totalVolume / 1000)}k
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Verified</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-accent tabular-nums">{verifiedCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Flagged</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-destructive tabular-nums">{flaggedCount}</p>
              </CardContent>
            </Card>
          </div>

          {/* Transaction flow */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Transaction Flow</CardTitle>
              <CardDescription className="text-xs">Recent activity with risk analysis</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[420px] overflow-y-auto">
                <div className="divide-y divide-border">
                  {transactions.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">No transactions yet…</p>
                  )}
                  {transactions.map((tx) => (
                    <div
                      key={tx.id + tx.timestamp.getTime()}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/30",
                        tx.riskScore > 70 && "bg-destructive/5"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                        {tx.amount > 0 ? (
                          <ArrowDownLeft className="h-4 w-4 text-accent" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-foreground truncate">{tx.from}</span>
                          <span className="text-[10px] text-muted-foreground">→</span>
                          <span className="font-mono text-xs text-foreground truncate">{tx.to}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {statusIcon[tx.status]}
                          <span className="text-[10px] text-muted-foreground capitalize">{tx.status}</span>
                          {tx.riskScore > 70 && (
                            <Badge variant="destructive" className="h-4 text-[9px] px-1">
                              RISK {tx.riskScore}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="font-mono text-xs font-medium text-foreground tabular-nums">
                          {formatCurrency(tx.amount, tx.currency)}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {tx.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Monero Node Tab ─── */}
        <TabsContent value="node" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium">Monero Node</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {nodeStatus === "connected" ? (
                    <Wifi className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={cn(
                    "font-mono text-[10px] uppercase",
                    nodeStatus === "connected" ? "text-accent" : nodeStatus === "connecting" ? "text-[hsl(var(--warning))]" : "text-muted-foreground"
                  )}>
                    {nodeStatus}
                  </span>
                  {nodeStatus === "connected" && (
                    <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                  )}
                </div>
              </div>
              <CardDescription className="text-xs">
                Connect to your own Monero daemon (monerod) for private transaction verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Host / IP</Label>
                  <Input
                    placeholder="127.0.0.1"
                    className="font-mono text-xs h-9 bg-secondary/50"
                    value={config.host}
                    onChange={(e) => setConfig((c) => ({ ...c, host: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  <Input
                    placeholder="18081"
                    className="font-mono text-xs h-9 bg-secondary/50"
                    value={config.port}
                    onChange={(e) => setConfig((c) => ({ ...c, port: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Username (optional)</Label>
                  <Input
                    placeholder="rpc_user"
                    className="font-mono text-xs h-9 bg-secondary/50"
                    value={config.username}
                    onChange={(e) => setConfig((c) => ({ ...c, username: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Password (optional)</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="font-mono text-xs h-9 bg-secondary/50"
                    value={config.password}
                    onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={handleSave}>
                  Save
                </Button>
                {nodeStatus === "connected" ? (
                  <Button size="sm" variant="destructive" onClick={handleDisconnect}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={handleConnect} disabled={nodeStatus === "connecting"}>
                    {nodeStatus === "connecting" ? "Connecting…" : "Connect"}
                  </Button>
                )}
              </div>

              {nodeStatus === "connected" && (
                <div className="mt-4 rounded-lg border bg-secondary/30 p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node Info</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Endpoint</span>
                      <p className="font-mono text-foreground">{config.host}:{config.port}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Throughput</span>
                      <p className="font-mono text-foreground">{Math.round(metrics.throughput)} tx/s</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Latency</span>
                      <p className="font-mono text-foreground">{metrics.latency.toFixed(1)} ms</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Connections</span>
                      <p className="font-mono text-foreground">{metrics.activeConnections}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;
