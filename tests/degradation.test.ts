import { loadSkills, isAnalysisSkill } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter((s) => s.frontmatter.writes.length > 0);

describe("degradation contract", () => {
  it("ships the twelve v0.2 skills", () => {
    expect(skills.map((s) => s.dir).sort()).toEqual([
      "fv-build-audience",
      "fv-cut-wasted-spend",
      "fv-data-health",
      "fv-design-page-test",
      "fv-find-keyword-gaps",
      "fv-find-leaky-pages",
      "fv-fix-page",
      "fv-fix-striking-distance",
      "fv-login",
      "fv-setup",
      "fv-verify-revenue-feedback-loop",
      "fv-win-back-churned",
    ]);
  });

  it("every analysis skill requires fullvision — it is the only non-optional server", () => {
    for (const s of skills.filter(isAnalysisSkill)) {
      expect(s.frontmatter.requires).toContain("fullvision");
    }
  });

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s documents read-only mode rather than treating a missing write server as an error",
    (_dir, skill) => {
      expect(skill.body.toLowerCase()).toContain("read-only");
      expect(skill.body).toMatch(/change-list/i);
    },
  );

  it("fv-setup explains the degradation rule to the user", () => {
    const setup = skills.find((s) => s.dir === "fv-setup")!;
    expect(setup.body).toMatch(/unavailable/i);
    expect(setup.body).toMatch(/read-only/i);
  });
});
