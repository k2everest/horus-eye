import { useEffect, useRef, useCallback, useState } from "react";
import type { Transaction } from "@/hooks/useSimulatedWebSocket";
import { toast } from "@/hooks/use-toast";

export interface RiskAlert {
  id: string;
  transaction: Transaction;
  timestamp: Date;
  dismissed: boolean;
}

const RISK_THRESHOLD = 70;

// Simple beep using Web Audio API
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}

export function useRiskAlerts(transactions: Transaction[], soundEnabled: boolean) {
  const seenIds = useRef(new Set<string>());
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
  }, []);

  const dismissAll = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, dismissed: true })));
  }, []);

  useEffect(() => {
    const newHighRisk = transactions.filter(
      (tx) => tx.riskScore > RISK_THRESHOLD && !seenIds.current.has(tx.id)
    );

    if (newHighRisk.length === 0) return;

    newHighRisk.forEach((tx) => seenIds.current.add(tx.id));

    const newAlerts: RiskAlert[] = newHighRisk.map((tx) => ({
      id: tx.id,
      transaction: tx,
      timestamp: new Date(),
      dismissed: false,
    }));

    setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));

    // Sound + toast for each
    newHighRisk.forEach((tx) => {
      if (soundEnabled) playAlertSound();
      toast({
        variant: "destructive",
        title: `⚠ High Risk: ${tx.id}`,
        description: `${tx.from} → ${tx.to} · Risk ${tx.riskScore} · ${new Intl.NumberFormat("en-US", { style: "currency", currency: tx.currency, maximumFractionDigits: 0 }).format(tx.amount)}`,
      });
    });
  }, [transactions, soundEnabled]);

  const activeAlerts = alerts.filter((a) => !a.dismissed);

  return { alerts, activeAlerts, dismissAlert, dismissAll };
}
