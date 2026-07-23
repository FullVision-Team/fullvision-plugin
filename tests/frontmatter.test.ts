import { loadSkills, mcpServerNames, isAnalysisSkill } from "./lib/skills";

const skills = loadSkills();
const servers = mcpServerNames();
const CADENCES = [
  "on-install",
  "precondition",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "on-demand",
];

describe("skill frontmatter", () => {
  it("finds at least one skill", () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s has well-formed frontmatter",
    (dir, skill) => {
      const fm = skill.frontmatter;
      expect(fm.name).toBe(dir);
      expect(dir).toMatch(/^[a-z0-9-]+$/);
      expect(fm.description).toBeTypeOf("string");
      expect(fm.description.length).toBeGreaterThan(20);
      expect(CADENCES).toContain(fm.cadence);
      expect(Array.isArray(fm.requires)).toBe(true);
      expect(Array.isArray(fm.writes)).toBe(true);
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s only names servers declared in .mcp.json",
    (_dir, skill) => {
      for (const s of [...skill.frontmatter.requires, ...skill.frontmatter.writes]) {
        expect(servers).toContain(s);
      }
    },
  );

  it.each(skills.filter(isAnalysisSkill).map((s) => [s.dir, s] as const))(
    "%s references the shared protocols it is bound by",
    (_dir, skill) => {
      expect(skill.body).toContain("shared/reading-fullvision-data.md");
      if (skill.frontmatter.writes.length > 0) {
        expect(skill.body).toContain("shared/safety-rails.md");
        expect(skill.body).toContain("shared/sparse-data.md");
      }
    },
  );
});
