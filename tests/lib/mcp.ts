const URL_ = process.env.FULLVISION_MCP_URL ?? "https://data.fullvision.io/mcp";
const KEY = process.env.FULLVISION_API_KEY;

export const hasCredentials = Boolean(KEY);

async function rpc(method: string, params: unknown, sessionId?: string) {
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${KEY}`,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}`);
  const text = await res.text();
  // Streamable HTTP may answer as SSE; take the last `data:` line either way.
  const payload = text.includes("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).pop()!.slice(5)
    : text;
  const body = JSON.parse(payload);
  if (body.error) throw new Error(`${method} → ${JSON.stringify(body.error)}`);
  return { result: body.result, sessionId: res.headers.get("mcp-session-id") ?? sessionId };
}

/** Returns the live tool names and view names exposed by the FullVision MCP server. */
export async function fetchSurface(): Promise<{ tools: string[]; views: string[] }> {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fullvision-plugin-contract-test", version: "0.1.0" },
  });
  const sid = init.sessionId ?? undefined;

  const listed = await rpc("tools/list", {}, sid);
  const tools = (listed.result.tools as { name: string }[]).map((t) => t.name);

  const called = await rpc(
    "tools/call",
    { name: "list_views", arguments: {} },
    sid,
  );
  const raw = called.result.content[0].text as string;
  const parsed = JSON.parse(raw);
  const entries: { name: string }[] = Array.isArray(parsed)
    ? parsed
    : (parsed.views ?? parsed.data ?? []);
  return { tools, views: entries.map((v) => v.name) };
}

/** Every `fullvision:<tool>` and `view:<name>` reference in a skill body. */
export function extractReferences(body: string): { tools: string[]; views: string[] } {
  const tools = [...body.matchAll(/`fullvision:([a-z_]+)`/g)].map((m) => m[1]);
  const views = [...body.matchAll(/`view:([a-z0-9-]+)`/g)].map((m) => m[1]);
  return { tools: [...new Set(tools)], views: [...new Set(views)] };
}
