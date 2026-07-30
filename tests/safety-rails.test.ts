import { loadSkills, isAnalysisSkill, isWriteSkill } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter(isWriteSkill);

describe("safety rails", () => {
  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s declares when it refuses",
    (_dir, skill) => {
      expect(skill.body).toMatch(/## Refuse when/);
      // At least one concrete refusal condition, not an empty heading.
      const section = skill.body.split("## Refuse when")[1] ?? "";
      expect(section.split("\n").filter((l) => l.trim().startsWith("-")).length)
        .toBeGreaterThan(0);
    },
  );

  it.each(skills.filter(isAnalysisSkill).map((s) => [s.dir, s] as const))(
    "%s calls check_data_health as a precondition",
    (_dir, skill) => {
      // data-health is now a gateway tool (fullvision:check_data_health), not a skill.
      // onboard is not exempt: it has no data to check while running, but it must still
      // hand the user their coverage numbers at the end via the same tool.
      expect(skill.body).toContain("check_data_health");
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s declares numeric thresholds rather than deciding at runtime",
    (_dir, skill) => {
      expect(skill.body).toMatch(/## Thresholds|## Scope limits/);
      // Thresholds must be actual numbers.
      expect(skill.body).toMatch(/\d/);
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s commits to propose-then-confirm and refuses irreversible actions",
    (_dir, skill) => {
      expect(skill.body).toMatch(/two turns|STOP\. Do not write|then STOP|Irreversible/i);
    },
  );

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s bounds its blast radius",
    (_dir, skill) => {
      expect(skill.body).toMatch(/blast radius|Max \*\*\d|Scope limits/i);
    },
  );
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/skills";

describe("coverage scoping rule", () => {
  const rails = readFileSync(join(ROOT, "shared/safety-rails.md"), "utf8");

  it("tells skills to gate on the coverage their own evidence rests on", () => {
    expect(rails).toMatch(/scope.{0,40}coverage|coverage.{0,40}your own evidence/i);
  });

  it("says a workspace-wide verdict is context, not an automatic stop", () => {
    expect(rails).toMatch(/not an automatic stop|context, never a stop|never a stop/i);
  });
});
