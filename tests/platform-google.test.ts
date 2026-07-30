import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const googleRef = readFileSync(join(ROOT, "shared/platforms/google.md"), "utf8");

describe("google platform reference: attribution window", () => {
  it("does not tell skills to judge on a trailing 90-day window", () => {
    expect(googleRef).not.toMatch(/judge google on a trailing 90-day window/i);
  });

  it("keeps the 90-day click age, scoped to what Google can receive", () => {
    expect(googleRef).toMatch(/90-day click age/i);
    // Anchored to the paragraph that states it — an unscoped match is satisfied by the
    // "upload" wording in the conversion-feedback-loop section and proves nothing.
    const paragraph = googleRef
      .split(/\n\s*\n/)
      .find((p) => /90-day click age/i.test(p)) ?? "";
    expect(paragraph).toMatch(/upload|receive|cannot be uploaded/i);
  });

  it("states that FullVision's own attribution is unbounded", () => {
    expect(googleRef).toMatch(/unbounded|no limit|not bounded/i);
    expect(googleRef).toMatch(/first-touch|person-stitched/i);
  });
});
