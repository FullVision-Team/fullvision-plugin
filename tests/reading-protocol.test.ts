import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

const protocol = readFileSync(
  join(ROOT, "shared/reading-fullvision-data.md"), "utf8");

describe("reading protocol: whose window is whose", () => {
  it("keeps the per-platform table of platform-reported windows", () => {
    expect(protocol).toMatch(/\| Google \| 90-day click age/);
  });

  it("says the table describes platform-reported windows, not our own", () => {
    expect(protocol).toMatch(/platform-reported|as the platform reports/i);
  });

  it("states FullVision's own attribution is unbounded and is what decisions use", () => {
    expect(protocol).toMatch(/unbounded/i);
    expect(protocol).toMatch(/decisions? use|judge on|what we judge/i);
  });
});
