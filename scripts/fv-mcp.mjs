#!/usr/bin/env node
// ─── FullVision MCP stdio ↔ Streamable HTTP bridge ─────────────────────────
//
// Why this exists rather than a plain `"type": "http"` entry in .mcp.json:
// that form interpolates ${FULLVISION_API_KEY} from the process environment,
// which means the key has to be exported into every Claude Code session before
// the client starts. This bridge reads the credential file that `fv-login`
// writes instead, so a fresh login takes effect on the next tool call with no
// restart and no secret in the environment.
//
// Transport mapping:
//   stdin/stdout  — MCP stdio: one JSON-RPC message per line.
//   upstream      — MCP Streamable HTTP: POST per message; the reply is either
//                   application/json (one message) or text/event-stream (a run
//                   of messages). Both are flattened back to lines.
//
// Zero dependencies, matching the rest of the plugin.

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const MCP_URL = process.env.FULLVISION_MCP_URL ?? "https://data.fullvision.io/mcp";

function loadApiKey() {
  // Env still wins — CI and the nightly automations set it directly, and an
  // explicit export should override whatever was last logged in.
  if (process.env.FULLVISION_API_KEY) return process.env.FULLVISION_API_KEY;

  const path = join(homedir(), ".fullvision", "credentials.json");
  if (!existsSync(path)) return null;
  try {
    const creds = JSON.parse(readFileSync(path, "utf-8"));
    return typeof creds.apiKey === "string" && creds.apiKey ? creds.apiKey : null;
  } catch {
    return null;
  }
}

const apiKey = loadApiKey();
if (!apiKey) {
  process.stderr.write(
    "FullVision: not connected. Run /fullvision:fv-login in Claude Code to connect.\n",
  );
  process.exit(1);
}

// The server assigns this on initialize and expects it echoed on every
// subsequent request; without it the session is re-created per call.
let sessionId = null;

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

/** Pull JSON-RPC messages out of an SSE body and emit each one. */
function emitSse(text) {
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      send(JSON.parse(data));
    } catch {
      // A malformed frame is the server's problem, not a reason to tear the
      // session down — drop it and keep the stream alive.
    }
  }
}

async function forward(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${apiKey}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  let res;
  try {
    res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(msg) });
  } catch (err) {
    // Only a request can receive an error reply; a failed notification has
    // nowhere to go, so it's dropped rather than fabricating an id.
    if (msg.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: `FullVision unreachable: ${err.message}` },
      });
    }
    return;
  }

  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  if (res.status === 401 || res.status === 403) {
    if (msg.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32001,
          message:
            "FullVision key rejected or expired. Run /fullvision:fv-login to reconnect.",
        },
      });
    }
    return;
  }

  // 202 with no body is the correct reply to a notification.
  if (res.status === 202) return;

  const body = await res.text();
  if (!body) return;

  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    emitSse(body);
    return;
  }

  try {
    send(JSON.parse(body));
  } catch {
    if (msg.id !== undefined) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32000, message: `Malformed response (HTTP ${res.status})` },
      });
    }
  }
}

// Messages are forwarded in arrival order. Serialising rather than firing
// concurrently keeps initialize strictly ahead of the calls that depend on the
// session id it establishes.
// debt: serial forwarding caps in-flight requests at 1, revisit if tool calls feel slow
let chain = Promise.resolve();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(() => forward(line));
});

// Drain before exiting. Exiting the moment stdin closes would drop replies for
// requests still in flight — which is exactly what happens when the client
// sends its last message and immediately closes the pipe.
rl.on("close", () => {
  chain.then(() => process.exit(0));
});
