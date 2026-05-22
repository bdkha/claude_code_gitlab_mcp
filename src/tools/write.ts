import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab.js";
import { toText } from "../format.js";

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

export function registerWriteTools(server: McpServer, gl: GitLabClient): void {
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
}
