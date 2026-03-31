import { useState, useEffect, useCallback, useRef } from "react";

export interface ProcessEntry {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "pending";
  cpu: number;
  memory: number;
  uptime: number;
  type: "transaction" | "audit" | "encryption" | "sync" | "auth";
}

export interface Transaction {
  id: string;
  timestamp: Date;
  from: string;
  to: string;
  amount: number;
  currency: string;
  status: "verified" | "pending" | "flagged" | "rejected";
  riskScore: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkIn: number;
  networkOut: number;
  activeConnections: number;
  throughput: number;
  latency: number;
  uptime: number;
}

const processNames = [
  "TLS Handshake Validator",
  "AES-256 Cipher Engine",
  "Token Auth Gateway",
  "SWIFT Relay Node",
  "KYC Verification",
  "Fraud Detection ML",
  "Ledger Sync Worker",
  "HSM Key Rotation",
  "PCI Compliance Scan",
  "Rate Limiter Guard",
];

const entities = ["VAULT-A7", "BANK-EU", "NODE-US3", "HSM-01", "RELAY-JP", "CORE-SG", "EDGE-UK"];

function randomId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function randomProcess(): ProcessEntry {
  const statuses: ProcessEntry["status"][] = ["running", "running", "running", "completed", "pending", "failed"];
  const types: ProcessEntry["type"][] = ["transaction", "audit", "encryption", "sync", "auth"];
  return {
    id: randomId(),
    name: processNames[Math.floor(Math.random() * processNames.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    cpu: Math.round(Math.random() * 85 + 5),
    memory: Math.round(Math.random() * 70 + 10),
    uptime: Math.floor(Math.random() * 86400),
    type: types[Math.floor(Math.random() * types.length)],
  };
}

function randomTransaction(): Transaction {
  const statuses: Transaction["status"][] = ["verified", "verified", "verified", "pending", "flagged", "rejected"];
  return {
    id: `TXN-${randomId()}`,
    timestamp: new Date(),
    from: entities[Math.floor(Math.random() * entities.length)],
    to: entities[Math.floor(Math.random() * entities.length)],
    amount: Math.round(Math.random() * 500000 + 1000),
    currency: ["USD", "EUR", "GBP", "JPY"][Math.floor(Math.random() * 4)],
    status: statuses[Math.floor(Math.random() * statuses.length)],
    riskScore: Math.round(Math.random() * 100),
  };
}

export function useSimulatedWebSocket() {
  const [connected, setConnected] = useState(false);
  const [processes, setProcesses] = useState<ProcessEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics>({
    cpuUsage: 34,
    memoryUsage: 52,
    networkIn: 1240,
    networkOut: 890,
    activeConnections: 47,
    throughput: 1250,
    latency: 12,
    uptime: 0,
  });
  const [metricsHistory, setMetricsHistory] = useState<{ time: string; cpu: number; throughput: number }[]>([]);
  const intervalRef = useRef<number>();

  const connect = useCallback(() => {
    setConnected(true);
    // Initialize
    setProcesses(Array.from({ length: 6 }, randomProcess));
    setTransactions(Array.from({ length: 8 }, randomTransaction));
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  useEffect(() => {
    if (!connected) return;
    intervalRef.current = window.setInterval(() => {
      // Update metrics with slight variations
      setMetrics((prev) => ({
        cpuUsage: Math.max(5, Math.min(95, prev.cpuUsage + (Math.random() - 0.5) * 8)),
        memoryUsage: Math.max(20, Math.min(90, prev.memoryUsage + (Math.random() - 0.5) * 4)),
        networkIn: Math.max(200, prev.networkIn + (Math.random() - 0.5) * 300),
        networkOut: Math.max(100, prev.networkOut + (Math.random() - 0.5) * 200),
        activeConnections: Math.max(10, Math.round(prev.activeConnections + (Math.random() - 0.5) * 6)),
        throughput: Math.max(500, prev.throughput + (Math.random() - 0.5) * 200),
        latency: Math.max(1, prev.latency + (Math.random() - 0.5) * 4),
        uptime: prev.uptime + 2,
      }));

      // Occasionally add/update processes
      if (Math.random() > 0.6) {
        setProcesses((prev) => {
          const updated = [...prev];
          const idx = Math.floor(Math.random() * updated.length);
          updated[idx] = { ...updated[idx], cpu: Math.round(Math.random() * 85 + 5), memory: Math.round(Math.random() * 70 + 10) };
          if (Math.random() > 0.8) {
            updated[idx].status = ["running", "completed", "failed"][Math.floor(Math.random() * 3)] as ProcessEntry["status"];
          }
          return updated;
        });
      }

      // Occasionally add transactions
      if (Math.random() > 0.7) {
        setTransactions((prev) => [randomTransaction(), ...prev].slice(0, 20));
      }
    }, 2000);
    return () => clearInterval(intervalRef.current);
  }, [connected]);

  return { connected, processes, transactions, metrics, connect, disconnect };
}
