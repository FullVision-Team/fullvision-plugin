import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

export const ROOT = new URL("../..", import.meta.url).pathname;
export const SKILLS_DIR = join(ROOT, "skills");

export interface SkillFrontmatter {
  name: string;
  description: string;
  cadence: string;
  requires: string[];
  writes: string[];
  [k: string]: unknown;
}

export interface Skill {
  dir: string;
  path: string;
  frontmatter: SkillFrontmatter;
  body: string;
}

/** Split `---\n<yaml>\n---\n<body>`. Throws if the fence is missing or unterminated. */
export function splitFrontmatter(raw: string): { yaml: string; body: string } {
  if (!raw.startsWith("---\n")) throw new Error("missing opening --- fence");
  const end = raw.indexOf("\n---", 3);
  if (end === -1) throw new Error("unterminated frontmatter fence");
  return {
    yaml: raw.slice(4, end),
    body: raw.slice(raw.indexOf("\n", end + 1) + 1),
  };
}

export function loadSkills(): Skill[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const path = join(SKILLS_DIR, e.name, "SKILL.md");
      const raw = readFileSync(path, "utf8");
      const { yaml, body } = splitFrontmatter(raw);
      return {
        dir: e.name,
        path,
        frontmatter: parse(yaml) as SkillFrontmatter,
        body,
      };
    });
}

// Skills that establish the FullVision connection rather than read through it.
// The analysis contracts — requires: [fullvision], the check_data_health
// precondition, the shared reading protocol — all presuppose a working
// connection, so they cannot apply to the skill whose job is to create one.
// Kept as an explicit allowlist so adding a skill here is a deliberate act.
const CONNECTION_SKILLS = new Set(["login"]);

export function isAnalysisSkill(skill: Skill): boolean {
  return !CONNECTION_SKILLS.has(skill.dir);
}

// Skills that stage changes to the outside world. `writes` names MCP servers, so it
// goes empty when a skill's only path is a direct one (a GitHub PR) or a
// hand-executed artifact — but the safety contract binds those skills just the same.
// Explicit allowlist so adding a skill here is a deliberate act.
//
// `build-audience` belongs here on merit — its change-list targets real people — but
// it has never carried a ## Thresholds section, propose-then-confirm wording, or a
// blast-radius bound, so adding it turns three assertions red. That is a real gap to
// close by writing those sections, not by loosening the assertions; until someone
// does, listing it here would only trade a silent gap for a red suite.
const STAGING_SKILLS = new Set([
  "google-ads-review",
  "fix-page",
  "win-back-churned",
]);

export function isWriteSkill(skill: Skill): boolean {
  return skill.frontmatter.writes.length > 0 || STAGING_SKILLS.has(skill.dir);
}

export function mcpServerNames(): string[] {
  const cfg = JSON.parse(readFileSync(join(ROOT, ".mcp.json"), "utf8"));
  return Object.keys(cfg.mcpServers);
}
