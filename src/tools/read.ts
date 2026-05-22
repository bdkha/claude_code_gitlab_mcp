import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient, GitLabError, type QueryValue } from "../gitlab.js";
import { paginationFooter, toText } from "../format.js";

const projectSchema = z
  .union([z.string(), z.number()])
  .describe(
    "Project ID (number) or URL-encoded path (e.g. 'group/subgroup/project')",
  );

const iidSchema = z
  .number()
  .int()
  .positive()
  .describe("Merge request internal ID (iid) as shown in the MR URL");

export function registerReadTools(server: McpServer, gl: GitLabClient): void {
  server.registerTool(
    "list_merge_requests",
    {
      title: "List merge requests",
      description:
        "List merge requests with optional filters. If 'project' is omitted, lists across all projects the token can see (combine with 'scope').",
      inputSchema: {
        project: projectSchema.optional(),
        scope: z
          .enum(["created_by_me", "assigned_to_me", "all"])
          .optional()
          .describe("Only used when 'project' is omitted"),
        state: z
          .enum(["opened", "closed", "locked", "merged", "all"])
          .optional(),
        author_username: z.string().optional(),
        assignee_username: z.string().optional(),
        reviewer_username: z.string().optional(),
        labels: z.string().optional().describe("Comma-separated label list"),
        target_branch: z.string().optional(),
        source_branch: z.string().optional(),
        search: z.string().optional(),
        order_by: z.enum(["created_at", "updated_at", "title"]).optional(),
        sort: z.enum(["asc", "desc"]).optional(),
        per_page: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => {
      const { project, ...rest } = args;
      const path =
        project === undefined
          ? "/merge_requests"
          : `/projects/${gl.encodeProject(project)}/merge_requests`;
      const res = await gl.get(path, rest as Record<string, QueryValue>);
      return {
        content: [
          {
            type: "text",
            text: toText(res.data) + paginationFooter(res.headers),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_merge_request",
    {
      title: "Get merge request",
      description:
        "Fetch a single MR. Response includes 'diff_refs' (base_sha/start_sha/head_sha) needed to post inline comments.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
      },
    },
    async ({ project, iid }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}`,
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "get_merge_request_diff",
    {
      title: "Get merge request diffs",
      description:
        "Per-file diff hunks for an MR. Use the file paths and line numbers here together with diff_refs from get_merge_request to build the 'position' for create_merge_request_discussion.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        per_page: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async ({ project, iid, per_page, page }) => {
      const projectPath = gl.encodeProject(project);
      const diffsPath = `/projects/${projectPath}/merge_requests/${iid}/diffs`;
      try {
        const res = await gl.get(diffsPath, { per_page, page });
        return {
          content: [
            {
              type: "text",
              text: toText(res.data) + paginationFooter(res.headers),
            },
          ],
        };
      } catch (err) {
        if (!(err instanceof GitLabError) || err.status !== 404) throw err;
      }
      const changesPath = `/projects/${projectPath}/merge_requests/${iid}/changes`;
      const res = await gl.get<{ changes?: unknown }>(changesPath);
      const changes =
        res.data && typeof res.data === "object" && "changes" in res.data
          ? (res.data as { changes: unknown }).changes
          : res.data;
      return {
        content: [
          {
            type: "text",
            text:
              toText(changes) +
              "\n\n[source=/changes (legacy endpoint — GitLab < 16.6)]",
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_merge_request_discussions",
    {
      title: "List merge request discussions",
      description:
        "Threaded discussions on an MR, including resolved status and diff position for inline notes.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        per_page: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async ({ project, iid, per_page, page }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/discussions`,
        { per_page, page },
      );
      return {
        content: [
          {
            type: "text",
            text: toText(res.data) + paginationFooter(res.headers),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_merge_request_notes",
    {
      title: "List merge request notes",
      description: "Flat (non-threaded) list of notes on an MR.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        sort: z.enum(["asc", "desc"]).optional(),
        order_by: z.enum(["created_at", "updated_at"]).optional(),
        per_page: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
      },
    },
    async ({ project, iid, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/notes`,
        rest as Record<string, QueryValue>,
      );
      return {
        content: [
          {
            type: "text",
            text: toText(res.data) + paginationFooter(res.headers),
          },
        ],
      };
    },
  );
}
