import { loadSkills } from "./lib/skills";
import { fetchSurface, extractReferences, hasCredentials } from "./lib/mcp";

const skills = loadSkills();

// Skipped without a key so contributors can run the suite offline; CI always has one.
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
