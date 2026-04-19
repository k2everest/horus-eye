// Edge Function: monero-rpc
// Proxies JSON-RPC calls to a user-supplied monerod daemon, handling
// HTTP Digest Authentication and CORS so the browser never sees credentials directly.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface RpcRequestBody {
  host: string;
  port: string | number;
  username?: string;
  password?: string;
  method: string;
  params?: Record<string, unknown>;
  // optional: "json_rpc" (default) or a raw path like "/get_info"
  endpoint?: "json_rpc" | "raw";
  rawPath?: string;
  https?: boolean;
}

function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  // hostname or IPv4 — simple permissive check
  return /^[a-zA-Z0-9._-]+$/.test(host);
}

function isValidPort(port: string | number): boolean {
  const n = typeof port === "number" ? port : parseInt(port, 10);
  return Number.isFinite(n) && n > 0 && n < 65536;
}

// Minimal MD5 implementation for Digest auth (Deno has no built-in md5)
async function md5(input: string): Promise<string> {
  // Use Web Crypto via SubtleCrypto MD5 polyfill alternative: hash with a JS impl.
  // Deno std provides md5 via crypto module:
  const { crypto: stdCrypto } = await import("https://deno.land/std@0.224.0/crypto/mod.ts");
  const data = new TextEncoder().encode(input);
  const hash = await stdCrypto.subtle.digest("MD5", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseDigestChallenge(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const stripped = header.replace(/^Digest\s+/i, "");
  // Match key=value or key="value"
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|([^,]*))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? "";
  }
  return out;
}

async function buildDigestHeader(opts: {
  username: string;
  password: string;
  method: string;
  uri: string;
  challenge: Record<string, string>;
  nc?: string;
}): Promise<string> {
  const { username, password, method, uri, challenge } = opts;
  const realm = challenge.realm ?? "";
  const nonce = challenge.nonce ?? "";
  const qop = challenge.qop ?? "auth";
  const algorithm = challenge.algorithm ?? "MD5";
  const opaque = challenge.opaque;
  const nc = opts.nc ?? "00000001";
  const cnonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  const ha1 = await md5(`${username}:${realm}:${password}`);
  const ha2 = await md5(`${method}:${uri}`);
  const response = await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `algorithm=${algorithm}`,
    `qop=${qop}`,
    `nc=${nc}`,
    `cnonce="${cnonce}"`,
    `response="${response}"`,
  ];
  if (opaque) parts.push(`opaque="${opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

async function rpcFetch(
  url: string,
  body: string,
  username?: string,
  password?: string,
): Promise<{ status: number; text: string }> {
  // First request — no auth
  const initial = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (initial.status !== 401 || !username) {
    const text = await initial.text();
    return { status: initial.status, text };
  }

  // Handle Digest auth challenge
  const wwwAuth = initial.headers.get("www-authenticate") ?? "";
  await initial.body?.cancel();

  if (!/^Digest/i.test(wwwAuth)) {
    return { status: 401, text: JSON.stringify({ error: "Unsupported auth scheme", scheme: wwwAuth }) };
  }

  const challenge = parseDigestChallenge(wwwAuth);
  const uri = new URL(url).pathname + new URL(url).search;
  const authHeader = await buildDigestHeader({
    username,
    password: password ?? "",
    method: "POST",
    uri,
    challenge,
  });

  const authed = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body,
  });
  const text = await authed.text();
  return { status: authed.status, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RpcRequestBody;

    if (!body.host || !isValidHost(body.host)) {
      return new Response(JSON.stringify({ error: "Invalid host" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isValidPort(body.port)) {
      return new Response(JSON.stringify({ error: "Invalid port" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.method || typeof body.method !== "string") {
      return new Response(JSON.stringify({ error: "Method is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scheme = body.https ? "https" : "http";
    const path =
      body.endpoint === "raw" && body.rawPath
        ? body.rawPath.startsWith("/") ? body.rawPath : `/${body.rawPath}`
        : "/json_rpc";
    const url = `${scheme}://${body.host}:${body.port}${path}`;

    const payload =
      body.endpoint === "raw"
        ? JSON.stringify(body.params ?? {})
        : JSON.stringify({
            jsonrpc: "2.0",
            id: "0",
            method: body.method,
            params: body.params ?? {},
          });

    const { status, text } = await rpcFetch(url, payload, body.username, body.password);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return new Response(JSON.stringify({ status, data: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("monero-rpc error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
