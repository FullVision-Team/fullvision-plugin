#!/usr/bin/env node
// ─── 1-click FullVision login ──────────────────────────────────────────────
//
// Opens the browser, waits for the operator to approve, and writes the issued
// key to ~/.fullvision/credentials.json.
//
// Zero dependencies on purpose — the plugin ships no runtime deps, and a login
// path is the last place to want a supply chain.
//
// The security-load-bearing parts:
//   * PKCE. The callback listener is plain HTTP on loopback, reachable by any
//     local process, so the one-time code is deliberately not sufficient on
//     its own — the verifier never leaves this process.
//   * state. Compared before the code is exchanged, so a stray request to our
//     listener can't drive the exchange.
//   * 0600 on both the file and the directory.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

const APP_URL = (process.env.FULLVISION_APP_URL ?? "https://app.fullvision.io").replace(/\/+$/, "");
const TIMEOUT_MS = 5 * 60 * 1000;

const b64url = (buf) => buf.toString("base64url");

function openBrowser(url) {
  const cmd =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#171717">
<div style="text-align:center"><h1 style="font-size:17px;margin:0 0 6px">${title}</h1>
<p style="color:#737373;margin:0">${body}</p></div>`;
}

/** Wait for the browser redirect and return the one-time code. */
function awaitCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname !== "/cb") {
        res.writeHead(404).end();
        return;
      }

      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";

      // Constant-time, and length-checked first so the compare can't throw.
      const a = Buffer.from(state);
      const b = Buffer.from(expectedState);
      const stateOk = a.length === b.length && timingSafeEqual(a, b);

      if (!stateOk || !code) {
        res.writeHead(400, { "content-type": "text/html" })
           .end(page("Login failed", "The response did not match this request. Re-run the command."));
        finish(() => reject(new Error("state mismatch — possible cross-site request")));
        return;
      }

      res.writeHead(200, { "content-type": "text/html" })
         .end(page("Connected to FullVision", "You can close this tab and return to Claude Code."));
      finish(() => resolve(code));
    });

    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Let the response flush before tearing the listener down.
      setTimeout(() => server.close(() => fn()), 50);
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("timed out after 5 minutes waiting for approval")));
    }, TIMEOUT_MS);

    server.on("error", reject);
    // Port 0 → OS picks a free ephemeral port. Bound to loopback only, never 0.0.0.0.
    server.listen(0, "127.0.0.1", () => {
      pendingPort.resolve(server.address().port);
    });
  });
}

// The port is needed to build the authorize URL, but it's only known once the
// server is listening — so the listener hands it back out of band.
const pendingPort = {};
pendingPort.promise = new Promise((r) => { pendingPort.resolve = r; });

async function main() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));

  const callback = awaitCallback(state);
  const port = await pendingPort.promise;

  const qs = new URLSearchParams({
    challenge,
    state,
    port: String(port),
    client: `Claude Code on ${hostname()}`.slice(0, 48),
  });
  const authorizeUrl = `${APP_URL}/cli/authorize?${qs.toString()}`;

  console.log("Opening your browser to approve this login…\n");
  if (!openBrowser(authorizeUrl)) {
    console.log("Could not open a browser automatically. Open this URL:\n");
  }
  console.log(`  ${authorizeUrl}\n`);

  const code = await callback;

  const res = await fetch(`${APP_URL}/api/cli/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, verifier }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (typeof data.apiKey !== "string" || !data.apiKey.startsWith("sk_")) {
    throw new Error("token exchange returned no key");
  }

  const dir = join(homedir(), ".fullvision");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "credentials.json");
  writeFileSync(
    file,
    `${JSON.stringify({
      apiKey: data.apiKey,
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      savedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  chmodSync(file, 0o600); // explicit — writeFileSync mode is umask-masked on some platforms

  console.log(`✅ Connected to workspace "${data.workspaceName}"`);
  console.log(`   Key saved to ${file}`);
}

main().catch((err) => {
  console.error(`\n❌ Login failed: ${err.message}`);
  process.exit(1);
});
