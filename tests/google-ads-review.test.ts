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

describe("google-ads-review: judging window", () => {
  it("does not judge on a trailing 90-day window", () => {
    expect(skill.body).not.toMatch(/trailing\s+\*{0,2}90\*{0,2}\s*days?/i);
  });

  it("judges from the measurement start to a maturity line", () => {
    expect(skill.body).toContain("ads-measurement-start");
    expect(skill.body).toMatch(/maturity|maturation/i);
  });

  it("derives the maturity line from observed click-to-charge lag", () => {
    expect(skill.body).toMatch(/p80/i);
    expect(skill.body).toContain("run_sql_query");
  });

  it("declares the fallback constant and when it applies", () => {
    expect(skill.body).toMatch(/60\s*days/i);
    expect(skill.body).toMatch(/\b8\b/);
  });

  it("carries a debt marker to promote the lag into a gateway view", () => {
    expect(skill.body).toMatch(/debt:/);
  });

  it("reports payers too old to upload as a finding", () => {
    expect(skill.body).toMatch(/never be uploaded|cannot be uploaded/i);
  });
});

describe("google-ads-review: negative-keyword sources", () => {
  it("does not mine the organic GSC keyword view", () => {
    expect(skill.body).not.toContain("view:keyword-performance");
  });

  it("takes search terms from GAQL search_term_view only", () => {
    expect(skill.body).toContain("search_term_view");
    expect(skill.body).toContain("`fullvision:google_ads_search`");
  });

  it("uses the paid keyword grain for keyword-level context", () => {
    expect(skill.body).toMatch(/ads-leaderboard|level=keyword/);
  });
});

it("puts the coverage figure and the maturity date in the report header", () => {
  const output = skill.body.split("## Output")[1] ?? "";
  expect(output).toMatch(/coverage/i);
  expect(output).toMatch(/maturity/i);
});

describe("google-ads-review: launch phase", () => {
  it("declares the phase boundary as a volume fact", () => {
    expect(skill.body).toMatch(/launch phase/i);
    expect(skill.body).toMatch(/qualifying terms/i);
  });

  it("no longer refuses on a short measurable window", () => {
    expect(skill.body).not.toMatch(/measurable window is shorter than/i);
  });

  it("no longer refuses when fewer than five terms qualify", () => {
    const refusals = skill.body.split("## Refuse when")[1] ?? "";
    expect(refusals).not.toMatch(/fewer than \*{0,2}5\*{0,2} terms/i);
  });

  it("still declares at least one refusal", () => {
    const refusals = skill.body.split("## Refuse when")[1] ?? "";
    expect(refusals.split("\n").filter((l) => l.trim().startsWith("-")).length)
      .toBeGreaterThan(0);
  });

  it("allows irrelevance negatives on a non-statistical criterion", () => {
    expect(skill.body).toMatch(/irrelevance negative/i);
    expect(skill.body).toMatch(/non-statistical|independent of n|not volume/i);
  });

  it("hard-zeroes budget, bidding and status in launch phase", () => {
    expect(skill.body).toMatch(/hard-zero/i);
  });

  it("caps irrelevance negatives at 25", () => {
    expect(skill.body).toMatch(/25/);
  });

  it("declares a minimum n for the journey diagnosis and forbids per-person stories", () => {
    expect(skill.body).toMatch(/\b20\b/);
    expect(skill.body).toContain("journeys");
    expect(skill.body).toMatch(/PII|drop-off shape/i);
  });
});
