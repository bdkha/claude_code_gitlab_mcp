export const TOOLSET_NAMES = [
  "merge_requests",
  "issues",
  "repository",
  "pipelines",
  "projects",
  "api",
] as const;

export type ToolsetName = (typeof TOOLSET_NAMES)[number];

export interface ToolConfig {
  toolsets: Set<ToolsetName>;
  /** When true, no write tools are registered and gitlab_api only allows GET. */
  readOnly: boolean;
  /** When true, gitlab_api may send DELETE requests. */
  allowDelete: boolean;
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "true" || v === "1";
}

export function loadToolConfig(): ToolConfig {
  const raw = process.env.GITLAB_TOOLSETS?.trim();
  let toolsets: Set<ToolsetName>;
  if (!raw) {
    toolsets = new Set(TOOLSET_NAMES);
  } else {
    const names = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const unknown = names.filter(
      (n) => !(TOOLSET_NAMES as readonly string[]).includes(n),
    );
    if (!names.length) {
      throw new Error(
        `GITLAB_TOOLSETS is set but lists no toolsets. Valid: ${TOOLSET_NAMES.join(", ")}`,
      );
    }
    if (unknown.length) {
      throw new Error(
        `Unknown GITLAB_TOOLSETS value(s): ${unknown.join(", ")}. Valid: ${TOOLSET_NAMES.join(", ")}`,
      );
    }
    toolsets = new Set(names as ToolsetName[]);
  }
  return {
    toolsets,
    readOnly: envFlag("GITLAB_READ_ONLY"),
    allowDelete: envFlag("GITLAB_ALLOW_DELETE"),
  };
}
