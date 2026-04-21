import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NodeConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  https: boolean;
}

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

const defaultConfig: NodeConfig = {
  host: "127.0.0.1",
  port: "18081",
  username: "",
  password: "",
  https: false,
};

export function loadNodeConfig(): NodeConfig {
  try {
    const saved = localStorage.getItem("monero-node-config");
    return saved ? { ...defaultConfig, ...JSON.parse(saved) } : defaultConfig;
  } catch {
    return defaultConfig;
  }
}

async function callRpc(config: NodeConfig, method: string, params: Record<string, unknown> = {}) {
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

export function useMoneroBlocks(count = 8, pollMs = 15000) {
  const [blocks, setBlocks] = useState<MoneroBlock[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBlocks = useCallback(async () => {
    const config = loadNodeConfig();
    if (!config.host || !config.port) {
      setError("Nó Monero não configurado. Vá em Settings.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const countRes = await callRpc(config, "get_block_count");
      const tipHeight: number = countRes.count - 1;
      setHeight(tipHeight);

      const heights = Array.from({ length: count }, (_, i) => tipHeight - i);
      const results = await Promise.all(
        heights.map(async (h) => {
          try {
            const b = await callRpc(config, "get_block", { height: h });
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

  return { blocks, height, loading, error, refresh: fetchBlocks };
}
