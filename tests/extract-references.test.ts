import { extractReferences } from "./lib/mcp";

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
