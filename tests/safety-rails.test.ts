import { loadSkills, isAnalysisSkill } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter((s) => s.frontmatter.writes.length > 0);

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
    "%s runs data-health as a precondition",
    (_dir, skill) => {
      // capabilities summarises health rather than gating on it. onboard is not
      // exempt: it has no data to check while running, but it must still hand the user
      // their coverage numbers at the end, so the assertion below applies to it.
      if (skill.dir === "data-health" || skill.dir === "capabilities") return;
      expect(skill.body).toContain("data-health");
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
