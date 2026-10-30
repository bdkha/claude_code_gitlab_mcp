import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient, GitLabError, type QueryValue } from "../gitlab.js";
import { paginationFooter, toText } from "../format.js";
import {
  iidSchema,
  paginationSchema,
  projectSchema,
  textResult,
  type ToolContext,
} from "./common.js";

export function register(
  server: McpServer,
  gl: GitLabClient,
  ctx: ToolContext,
): void {
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

  server.registerTool(
    "list_merge_request_commits",
    {
      title: "List merge request commits",
      description: "Commits in an MR.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        ...paginationSchema,
      },
    },
    async ({ project, iid, per_page, page }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/commits`,
        { per_page, page },
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "list_merge_request_pipelines",
    {
      title: "List merge request pipelines",
      description: "Pipelines run for an MR.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        ...paginationSchema,
      },
    },
    async ({ project, iid, per_page, page }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/pipelines`,
        { per_page, page },
      );
      return textResult(res.data, res.headers);
    },
  );

  if (ctx.readOnly) return;

  server.registerTool(
    "create_merge_request_note",
    {
      title: "Add a comment to a merge request",
      description: "Adds a general (non-inline) comment to an MR.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        body: z.string().min(1).describe("Markdown body of the comment"),
      },
    },
    async ({ project, iid, body }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/notes`,
        { body },
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "create_merge_request_discussion",
    {
      title: "Add an inline review comment",
      description:
        "Creates a new threaded discussion on a specific diff line. Get base_sha/start_sha/head_sha from get_merge_request (diff_refs) and new_path / new_line from get_merge_request_diff. Set new_line for added/modified lines, old_line for deleted lines, or both for unchanged context lines.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        body: z.string().min(1).describe("Markdown body of the comment"),
        position: z.object({
          base_sha: z.string(),
          start_sha: z.string(),
          head_sha: z.string(),
          new_path: z.string().optional(),
          old_path: z.string().optional(),
          new_line: z.number().int().optional(),
          old_line: z.number().int().optional(),
        }),
      },
    },
    async ({ project, iid, body, position }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/discussions`,
        {
          body,
          position: { ...position, position_type: "text" },
        },
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "reply_to_discussion",
    {
      title: "Reply to a discussion thread",
      description: "Add a reply note to an existing MR discussion thread.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        discussion_id: z
          .string()
          .describe("Discussion ID (string hash) from list_merge_request_discussions"),
        body: z.string().min(1),
      },
    },
    async ({ project, iid, discussion_id, body }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/discussions/${discussion_id}/notes`,
        { body },
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "resolve_discussion",
    {
      title: "Resolve or unresolve a discussion",
      description: "Mark an MR discussion thread as resolved (default) or unresolved.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        discussion_id: z.string(),
        resolved: z.boolean().optional(),
      },
    },
    async ({ project, iid, discussion_id, resolved }) => {
      const res = await gl.put(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/discussions/${discussion_id}`,
        undefined,
        { resolved: resolved ?? true },
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "approve_merge_request",
    {
      title: "Approve a merge request",
      description:
        "Approves an MR on behalf of the authenticated user. Optional 'sha' guards against approving an outdated commit (rejected by GitLab if HEAD has moved).",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        sha: z.string().optional(),
      },
    },
    async ({ project, iid, sha }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/approve`,
        sha ? { sha } : undefined,
      );
      return { content: [{ type: "text", text: toText(res.data) }] };
    },
  );

  server.registerTool(
    "unapprove_merge_request",
    {
      title: "Remove your approval from a merge request",
      description: "Removes the authenticated user's prior approval from an MR.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
      },
    },
    async ({ project, iid }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/unapprove`,
      );
      return {
        content: [
          {
            type: "text",
            text: res.status === 201 || res.status === 200
              ? "Unapproved."
              : toText(res.data),
          },
        ],
      };
    },
  );

  server.registerTool(
    "create_merge_request",
    {
      title: "Create a merge request",
      description: "Open a new MR from source_branch into target_branch.",
      inputSchema: {
        project: projectSchema,
        source_branch: z.string().min(1),
        target_branch: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        labels: z.string().optional().describe("Comma-separated label list"),
        assignee_ids: z.array(z.number().int()).optional(),
        reviewer_ids: z.array(z.number().int()).optional(),
        remove_source_branch: z.boolean().optional(),
        squash: z.boolean().optional(),
      },
    },
    async ({ project, ...body }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/merge_requests`,
        body,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "update_merge_request",
    {
      title: "Update a merge request",
      description:
        "Edit MR fields; state_event 'close' or 'reopen' changes its state. Only passed fields change.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        labels: z
          .string()
          .optional()
          .describe("Comma-separated; replaces all labels"),
        add_labels: z.string().optional().describe("Comma-separated"),
        remove_labels: z.string().optional().describe("Comma-separated"),
        assignee_ids: z.array(z.number().int()).optional(),
        reviewer_ids: z.array(z.number().int()).optional(),
        target_branch: z.string().min(1).optional(),
        state_event: z.enum(["close", "reopen"]).optional(),
        remove_source_branch: z.boolean().optional(),
        squash: z.boolean().optional(),
      },
    },
    async ({ project, iid, ...body }) => {
      const res = await gl.put(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}`,
        body,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "merge_merge_request",
    {
      title: "Merge a merge request",
      description:
        "Merge an MR. IRREVERSIBLE. Pass 'sha' (head_sha from get_merge_request) so GitLab rejects the merge (409) if HEAD has moved.",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        sha: z.string().optional().describe("Expected HEAD sha of the source branch"),
        squash: z.boolean().optional(),
        squash_commit_message: z.string().optional(),
        merge_commit_message: z.string().optional(),
        should_remove_source_branch: z.boolean().optional(),
        merge_when_pipeline_succeeds: z.boolean().optional(),
      },
    },
    async ({ project, iid, ...body }) => {
      const res = await gl.put(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/merge`,
        body,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "rebase_merge_request",
    {
      title: "Rebase a merge request",
      description:
        "Rebase the MR source branch onto target (async; check get_merge_request 'rebase_in_progress').",
      inputSchema: {
        project: projectSchema,
        iid: iidSchema,
        skip_ci: z.boolean().optional(),
      },
    },
    async ({ project, iid, skip_ci }) => {
      const res = await gl.put(
        `/projects/${gl.encodeProject(project)}/merge_requests/${iid}/rebase`,
        skip_ci === undefined ? undefined : { skip_ci },
      );
      return textResult(res.data);
    },
  );
}
