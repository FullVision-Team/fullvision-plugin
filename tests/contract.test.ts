import { loadSkills } from "./lib/skills";
import { fetchSurface, extractReferences, hasCredentials } from "./lib/mcp";

const skills = loadSkills();

// Contributors may run the suite offline — without a key this file skips.
// CI may NOT. This job exists to fail loudly when a view or tool is renamed
// upstream, and a suite that skips every assertion still exits 0, so the job
// goes green having checked nothing. That is a worse failure than a red build:
// it is a green light that means "we didn't look". Fail closed instead.
if (process.env.CI && !hasCredentials) {
  throw new Error(
    "FULLVISION_API_KEY is not set in CI. The contract suite would skip all " +
      "assertions and report success. A skipped contract suite is not a passing one.",
  );
}

describe.skipIf(!hasCredentials)("live FullVision MCP contract", () => {
  let surface: { tools: string[]; views: string[] };

  beforeAll(async () => {
    surface = await fetchSurface();
  }, 30_000);

  it("exposes the tools the plugin depends on", () => {
    for (const t of ["list_views", "query_view", "run_sql_query", "get_guidance", "list_metrics"]) {
      expect(surface.tools).toContain(t);
    }
  });

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s references only tools that exist",
    (_dir, skill) => {
      for (const t of extractReferences(skill.body).tools) {
        expect(surface.tools).toContain(t);
      }
    },
  );

  it.each(skills.map((s) => [s.dir, s] as const))(
    "%s references only views that exist",
    (_dir, skill) => {
      for (const v of extractReferences(skill.body).views) {
        expect(surface.views).toContain(v);
      }
    },
  );
});
