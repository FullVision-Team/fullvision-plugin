import { loadSkills } from "./lib/skills";

const skill = loadSkills().find((s) => s.dir === "google-ads-review")!;

describe("google-ads-review: health gating", () => {
  it("does not abort the whole run on a workspace-global red verdict", () => {
    expect(skill.body).not.toMatch(/on `?red`?,? abort/i);
  });

  it("still reports the global verdict for context", () => {
    expect(skill.body).toContain("check_data_health");
  });

  it("reads ads-scoped coverage from the ad-report payload, not the view", () => {
    expect(skill.body).toContain("obs_gclid_clicks");
    expect(skill.body).toContain("`fullvision:ad-report`");
    expect(skill.body).toMatch(/not a declared metric|payload, not the view/i);
  });

  it("declares the gclid coverage floor as a fixed number", () => {
    expect(skill.body).toMatch(/70\s*%/);
  });

  it("withholds only the destructive path below the floor", () => {
    expect(skill.body).toMatch(/withh(e|o)ld/i);
  });

  it("treats unknown coverage as failing, not passing", () => {
    expect(skill.body).toMatch(/unknown coverage is not good coverage|absent.{0,60}withheld/i);
  });
});

describe("google-ads-review: unavailable ads surface", () => {
  it("checks capabilities before assuming the google tools exist", () => {
    expect(skill.body).toContain("get_capabilities");
  });

  it("declares a read-only run rather than dying on a tool error", () => {
    expect(skill.body).toMatch(/read-only run/i);
    expect(skill.body).toMatch(/ready.{0,10}false/i);
  });

  it("names skipped GAQL diagnostics instead of silently shortening the list", () => {
    expect(skill.body).toMatch(/skipped, not faked|names each skipped/i);
  });
});
