import { supabase } from "@/integrations/supabase/client";

export interface NodeConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  https: boolean;
}

export interface NodeInfo {
  version?: string;
  height?: number;
  target_height?: number;
  status?: string;
  synchronized?: boolean;
  nettype?: string;
  outgoing_connections_count?: number;
  incoming_connections_count?: number;
  busy_syncing?: boolean;
}

export const defaultConfig: NodeConfig = {
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

export async function callMoneroRpc(config: NodeConfig, method: string, params: Record<string, unknown> = {}) {
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
    const code = data?.data?.error?.code;
    const msg = data?.data?.error?.message || `RPC error ${data.status}`;
    if (code === "NODE_UNREACHABLE") {
      throw new Error(
        `Nó Monero inacessível em ${config.host}:${config.port}. ` +
        `Edge Functions não conseguem acessar 127.0.0.1 da sua máquina — exponha o daemon publicamente (ngrok/Cloudflare Tunnel/IP público) e atualize Settings.`,
      );
    }
    throw new Error(msg);
  }

  return data?.data?.result ?? data?.data;
}