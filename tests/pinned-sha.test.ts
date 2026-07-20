import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
const reviewRecord = readFileSync(join(ROOT, "docs/mcp-servers.md"), "utf8");

// Hosted, first-party/official servers have no artifact to pin — they may float.
const HOSTED = new Set(["fullvision", "meta-ads", "webflow", "brevo"]);

describe("supply chain", () => {
  const entries = Object.entries(cfg.mcpServers) as [string, Record<string, unknown>][];

  it.each(entries.filter(([n]) => !HOSTED.has(n)))(
    "%s pins a full 40-char commit SHA",
    (_name, server) => {
      const refs = JSON.stringify(server);
      expect(refs).not.toMatch(/@latest|@main\b|@master\b|#main\b|#master\b/);
      expect(refs).toMatch(/[@#][0-9a-f]{40}\b/);
    },
  );

  it.each(entries.filter(([n]) => !HOSTED.has(n)))(
    "%s pin is recorded in docs/mcp-servers.md",
    (_name, server) => {
      const sha = JSON.stringify(server).match(/[@#]([0-9a-f]{40})\b/)![1];
      expect(reviewRecord).toContain(sha);
    },
  );

  it("every server in the review record exists in .mcp.json", () => {
    for (const name of Object.keys(cfg.mcpServers)) {
      expect(reviewRecord).toContain(`\`${name}\``);
    }
  });
});
