import { loadSkills, isAnalysisSkill } from "./lib/skills";

const skills = loadSkills();
const writeSkills = skills.filter((s) => s.frontmatter.writes.length > 0);

describe("degradation contract", () => {
  it("ships the thirteen v0.3 skills", () => {
    expect(skills.map((s) => s.dir).sort()).toEqual([
      "fv-build-audience",
      "fv-capabilities",
      "fv-cut-wasted-spend",
      "fv-data-health",
      "fv-design-page-test",
      "fv-find-keyword-gaps",
      "fv-find-leaky-pages",
      "fv-fix-page",
      "fv-fix-striking-distance",
      "fv-login",
      "fv-onboard",
      "fv-verify-revenue-feedback-loop",
      "fv-win-back-churned",
    ]);
  });

  it("every analysis skill requires fullvision — it is the only non-optional server", () => {
    for (const s of skills.filter(isAnalysisSkill)) {
      expect(s.frontmatter.requires).toContain("fullvision");
    }
  });

  // Two skills could plausibly claim to be "the first thing you run", which is one too
  // many — a new user cannot pick between two entry points. fv-onboard owns the install
  // slot because it covers the whole journey and delegates the auth step to fv-login;
  // fv-login stays directly invocable for the narrower "connect this machine" case.
  it("exactly one skill claims the install slot", () => {
    const onInstall = skills.filter((s) => s.frontmatter.cadence === "on-install");
    expect(onInstall.map((s) => s.dir)).toEqual(["fv-onboard"]);
  });

  it("fv-onboard delegates authentication to fv-login rather than teaching a second way", () => {
    const onboard = skills.find((s) => s.dir === "fv-onboard")!;
    expect(onboard.body).toContain("fv-login");
    // The pre-fv-login flow had the user copy a secret key out of Settings and export
    // it. That path is gone; if it reappears there are two competing auth stories and
    // the secret key is back in a shell profile. (The publishable pk_ still lives on
    // that Settings page and is fine — this guards the sk_ export, not the page.)
    expect(onboard.body).not.toMatch(/export FULLVISION_API_KEY/);
  });

  it.each(writeSkills.map((s) => [s.dir, s] as const))(
    "%s documents read-only mode rather than treating a missing write server as an error",
    (_dir, skill) => {
      expect(skill.body.toLowerCase()).toContain("read-only");
      expect(skill.body).toMatch(/change-list/i);
    },
  );

  it("fv-capabilities explains the degradation rule to the user", () => {
    const caps = skills.find((s) => s.dir === "fv-capabilities")!;
    expect(caps.body).toMatch(/unavailable/i);
    expect(caps.body).toMatch(/read-only/i);
  });
});
