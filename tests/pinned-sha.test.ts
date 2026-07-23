import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
const reviewRecord = readFileSync(join(ROOT, "docs/mcp-servers.md"), "utf8");

// Hosted, first-party/official servers have no artifact to pin — they may float.
const HOSTED = new Set(["fullvision", "webflow", "brevo"]);

describe("supply chain", () => {
  const entries = Object.entries(cfg.mcpServers) as [string, Record<string, unknown>][];
  const pinned = entries.filter(([n]) => !HOSTED.has(n));

  // Zero non-hosted servers today; the loop guards any future addition — a
  // community/self-hosted server must pin a full SHA and record it in docs.
  it("every non-hosted server pins a full 40-char commit SHA", () => {
    for (const [, server] of pinned) {
      const refs = JSON.stringify(server);
      expect(refs).not.toMatch(/@latest|@main\b|@master\b|#main\b|#master\b/);
      expect(refs).toMatch(/[@#][0-9a-f]{40}\b/);
    }
  });

  it("every non-hosted server pin is recorded in docs/mcp-servers.md", () => {
    for (const [, server] of pinned) {
      const sha = JSON.stringify(server).match(/[@#]([0-9a-f]{40})\b/)![1];
      expect(reviewRecord).toContain(sha);
    }
  });

  it("every server in .mcp.json exists in the review record", () => {
    for (const name of Object.keys(cfg.mcpServers)) {
      expect(reviewRecord).toContain(`\`${name}\``);
    }
  });
});
