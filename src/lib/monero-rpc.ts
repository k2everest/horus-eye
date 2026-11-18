import { supabase } from "@/integrations/supabase/client";

if (typeof localStorage !== "undefined") localStorage.removeItem("monero-node-config");

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

// Remove legacy persisted daemon credentials, including profiles saved by old builds.
export function loadNodeConfig(): NodeConfig {
  localStorage.removeItem("monero-node-config");
  return {...defaultConfig};
}

export async function callMoneroRpc(_config: NodeConfig, method: string, params: Record<string, unknown> = {}) {
  const {data,error}=await supabase.functions.invoke("monero-rpc",{body:{method,params}});
  if(error)throw new Error(error.message);
  if(data?.error)throw new Error(data.error);
  return data?.data?.result ?? data?.data;
}
