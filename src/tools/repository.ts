import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab.js";
import { toText, truncate } from "../format.js";
import {
  paginationSchema,
  projectSchema,
  textResult,
  type ToolContext,
} from "./common.js";

const maxCharsSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("Truncate output to this many chars (default 100000)");

const DEFAULT_MAX_CHARS = 100000;

export function register(
  server: McpServer,
  gl: GitLabClient,
  ctx: ToolContext,
): void {
  server.registerTool(
    "get_repository_tree",
    {
      title: "List repository tree",
      description: "List files and directories in a repository path.",
      inputSchema: {
        project: projectSchema,
        path: z.string().optional().describe("Directory path (default root)"),
        ref: z.string().optional().describe("Branch, tag or SHA"),
        recursive: z.boolean().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...query }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/repository/tree`,
        query,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_file",
    {
      title: "Get file content",
      description:
        "Read a raw file from the repository. Optional 1-based inclusive line range.",
      inputSchema: {
        project: projectSchema,
        file_path: z.string().describe("Path in repo, e.g. 'src/index.ts'"),
        ref: z
          .string()
          .optional()
          .describe("Branch, tag or SHA (default HEAD)"),
        start_line: z.number().int().positive().optional(),
        end_line: z.number().int().positive().optional(),
        max_chars: maxCharsSchema,
      },
    },
    async ({ project, file_path, ref, start_line, end_line, max_chars }) => {
      const res = await gl.getRaw(
        `/projects/${gl.encodeProject(project)}/repository/files/${encodeURIComponent(file_path)}/raw`,
        { ref: ref ?? "HEAD" },
      );
      let text = res.data;
      if (start_line !== undefined || end_line !== undefined) {
        const lines = text.split("\n");
        const selected = lines.slice((start_line ?? 1) - 1, end_line);
        if (!selected.length) {
          return textResult(
            `[empty range: start_line=${start_line ?? 1}, end_line=${end_line ?? "EOF"}; file has ${lines.length} lines]`,
          );
        }
        text = selected.join("\n");
      }
      return textResult(truncate(text, max_chars ?? DEFAULT_MAX_CHARS));
    },
  );

  server.registerTool(
    "list_branches",
    {
      title: "List branches",
      description: "List repository branches.",
      inputSchema: {
        project: projectSchema,
        search: z.string().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...query }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/repository/branches`,
        query,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_branch",
    {
      title: "Get branch",
      description: "Fetch a single branch with its latest commit.",
      inputSchema: {
        project: projectSchema,
        branch: z.string(),
      },
    },
    async ({ project, branch }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/repository/branches/${encodeURIComponent(branch)}`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "list_commits",
    {
      title: "List commits",
      description: "List repository commits with optional filters.",
      inputSchema: {
        project: projectSchema,
        ref_name: z.string().optional().describe("Branch, tag or SHA"),
        path: z.string().optional().describe("Only commits touching this path"),
        since: z.string().optional().describe("ISO 8601 date"),
        until: z.string().optional().describe("ISO 8601 date"),
        author: z.string().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...query }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/repository/commits`,
        query,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_commit",
    {
      title: "Get commit",
      description: "Fetch a single commit, optionally with its diff.",
      inputSchema: {
        project: projectSchema,
        sha: z.string().describe("Commit SHA, branch or tag"),
        include_diff: z.boolean().optional(),
        max_chars: maxCharsSchema,
      },
    },
    async ({ project, sha, include_diff, max_chars }) => {
      const path = `/projects/${gl.encodeProject(project)}/repository/commits/${encodeURIComponent(sha)}`;
      const commit = await gl.get(path);
      if (!include_diff) return textResult(commit.data);
      const diff = await gl.get(`${path}/diff`);
      return textResult(
        truncate(
          toText({ commit: commit.data, diff: diff.data }),
          max_chars ?? DEFAULT_MAX_CHARS,
        ),
      );
    },
  );

  server.registerTool(
    "compare",
    {
      title: "Compare refs",
      description: "Compare two branches, tags or commits (commits + diffs).",
      inputSchema: {
        project: projectSchema,
        from: z.string(),
        to: z.string(),
        straight: z
          .boolean()
          .optional()
          .describe("true = direct from..to diff instead of merge-base"),
        max_chars: maxCharsSchema,
      },
    },
    async ({ project, from, to, straight, max_chars }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/repository/compare`,
        { from, to, straight },
      );
      return textResult(
        truncate(toText(res.data), max_chars ?? DEFAULT_MAX_CHARS),
      );
    },
  );

  if (ctx.readOnly) return;

  server.registerTool(
    "create_branch",
    {
      title: "Create branch",
      description: "Create a new branch from a ref.",
      inputSchema: {
        project: projectSchema,
        branch: z.string().describe("New branch name"),
        ref: z.string().describe("Source branch, tag or SHA"),
      },
    },
    async ({ project, branch, ref }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/repository/branches`,
        undefined,
        { branch, ref },
      );
      return textResult(res.data);
    },
  );
}
