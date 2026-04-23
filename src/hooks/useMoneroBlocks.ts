import { useEffect, useState, useCallback, useRef } from "react";
import { callMoneroRpc, loadNodeConfig, type NodeInfo } from "@/lib/monero-rpc";

export interface MoneroBlock {
  height: number;
  hash: string;
  timestamp: number;
  txCount: number;
  size: number;
  difficulty: number;
  reward: number;
  miner_tx_hash: string;
}

export function useMoneroBlocks(count = 8, pollMs = 15000) {
  const [blocks, setBlocks] = useState<MoneroBlock[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [healingState, setHealingState] = useState<"idle" | "watching" | "armed" | "recovering">("idle");
  const [healingReason, setHealingReason] = useState<string | null>(null);
  const stagnantSinceRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number | null>(null);
  const lastRecoverAtRef = useRef<number>(0);

  const fetchBlocks = useCallback(async () => {
    const config = loadNodeConfig();
    if (!config.host || !config.port) {
      setError("Nó Monero não configurado. Vá em Settings.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = (await callMoneroRpc(config, "get_info")) as NodeInfo;
      setNodeInfo(info);

      const countRes = await callMoneroRpc(config, "get_block_count");
      const tipHeight: number = countRes.count - 1;
      setHeight(tipHeight);

      const currentNodeHeight = info.height ?? tipHeight;
      const targetHeight = info.target_height ?? currentNodeHeight;
      const isNearTail = targetHeight > 0 && currentNodeHeight / targetHeight >= 0.976;
      const isAdvancing = lastHeightRef.current === null || currentNodeHeight > lastHeightRef.current;
      const isRejected = typeof info.status === "string" && info.status.toUpperCase().includes("BLOCK_REJECTED");

      if (isAdvancing) {
        stagnantSinceRef.current = null;
        setHealingState(info.synchronized ? "idle" : "watching");
        setHealingReason(null);
      } else if (!info.synchronized && isNearTail) {
        stagnantSinceRef.current ??= Date.now();
        const stalledForMs = Date.now() - stagnantSinceRef.current;
        const shouldRecover = stalledForMs >= 300000 || isRejected;

        if (shouldRecover && Date.now() - lastRecoverAtRef.current > 60000) {
          setHealingState("recovering");
          setHealingReason(isRejected ? "BLOCK_REJECTED detectado" : "estagnação acima de 300s em 97.6%+");
          lastRecoverAtRef.current = Date.now();
        } else {
          setHealingState(shouldRecover ? "recovering" : "armed");
          setHealingReason(isRejected ? "BLOCK_REJECTED detectado" : "watcher ativo para estagnação final");
        }
      } else if (!info.synchronized) {
        stagnantSinceRef.current = null;
        setHealingState("watching");
        setHealingReason(null);
      }

      lastHeightRef.current = currentNodeHeight;

      const heights = Array.from({ length: count }, (_, i) => tipHeight - i);
      const results = await Promise.all(
        heights.map(async (h) => {
          try {
            const b = await callMoneroRpc(config, "get_block", { height: h });
            const header = b.block_header ?? {};
            return {
              height: header.height ?? h,
              hash: header.hash ?? "",
              timestamp: header.timestamp ?? 0,
              txCount: (header.num_txes ?? 0) + 1,
              size: header.block_size ?? 0,
              difficulty: header.difficulty ?? 0,
              reward: header.reward ?? 0,
              miner_tx_hash: header.miner_tx_hash ?? "",
            } as MoneroBlock;
          } catch {
            return null;
          }
        })
      );
      setBlocks(results.filter((b): b is MoneroBlock => b !== null));
    } catch (err) {
      setHealingState("idle");
      setHealingReason(null);
      setError(err instanceof Error ? err.message : "Falha ao buscar blocos");
    } finally {
      setLoading(false);
    }
  }, [count]);

  useEffect(() => {
    fetchBlocks();
    if (pollMs > 0) {
      const id = setInterval(fetchBlocks, pollMs);
      return () => clearInterval(id);
    }
  }, [fetchBlocks, pollMs]);

  return { blocks, height, nodeInfo, loading, error, refresh: fetchBlocks, healingState, healingReason };
}
