import { extractReferences, collectNames } from "./lib/mcp";

describe("extractReferences", () => {
  it("extracts hyphenated tool names", () => {
    expect(extractReferences("call `fullvision:ad-report` now").tools)
      .toContain("ad-report");
  });

  it("still extracts underscored tool names", () => {
    expect(extractReferences("`fullvision:run_sql_query`").tools)
      .toContain("run_sql_query");
  });

  it("still extracts view names", () => {
    expect(extractReferences("`view:ads-leaderboard`").views)
      .toContain("ads-leaderboard");
  });

  it("does not treat a bare word after the colon as a tool", () => {
    expect(extractReferences("fullvision:ad-report").tools).toEqual([]);
  });
});

describe("collectNames", () => {
  it("collects from a bare array of entries", () => {
    expect(collectNames([{ name: "page-report" }, { name: "ad-report" }]))
      .toEqual(["page-report", "ad-report"]);
  });

  it("collects from every branch of a wrapper object", () => {
    const payload = {
      views: [{ name: "page-report" }],
      raw: [{ name: "ads-leaderboard" }, { name: "page-customers" }],
    };
    expect(collectNames(payload).sort())
      .toEqual(["ads-leaderboard", "page-customers", "page-report"]);
  });

  it("stops at the first `name` and does not descend into its children", () => {
    expect(collectNames({ name: "v", metrics: [{ name: "m" }] })).toEqual(["v"]);
  });

  it("reaches names nested under intermediate keys that have none", () => {
    const payload = { data: { catalog: { composite: [{ name: "form-report" }] } } };
    expect(collectNames(payload)).toEqual(["form-report"]);
  });

  it("ignores a non-string `name` and keeps descending", () => {
    expect(collectNames({ name: 42, views: [{ name: "gsc-striking-candidates" }] }))
      .toEqual(["gsc-striking-candidates"]);
  });

  it("returns [] for payloads with no names", () => {
    expect(collectNames([])).toEqual([]);
    expect(collectNames({})).toEqual([]);
    expect(collectNames({ views: [], total: 0 })).toEqual([]);
    expect(collectNames(null)).toEqual([]);
    expect(collectNames("ads-leaderboard")).toEqual([]);
  });
});
