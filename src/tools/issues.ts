import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient, type QueryValue } from "../gitlab.js";
import {
  paginationSchema,
  projectSchema,
  textResult,
  type ToolContext,
} from "./common.js";

const issueIidSchema = z
  .number()
  .int()
  .positive()
  .describe("Issue internal ID (iid) as shown in the issue URL");

export function register(
  server: McpServer,
  gl: GitLabClient,
  ctx: ToolContext,
): void {
  server.registerTool(
    "list_issues",
    {
      title: "List issues",
      description:
        "List issues with optional filters. If 'project' is omitted, lists across all projects the token can see (combine with 'scope').",
      inputSchema: {
        project: projectSchema.optional(),
        scope: z
          .enum(["created_by_me", "assigned_to_me", "all"])
          .optional()
          .describe("Only used when 'project' is omitted"),
        state: z.enum(["opened", "closed", "all"]).optional(),
        labels: z.string().optional().describe("Comma-separated label list"),
        milestone: z.string().optional().describe("Milestone title"),
        assignee_username: z.string().optional(),
        author_username: z.string().optional(),
        search: z.string().optional(),
        order_by: z
          .enum(["created_at", "updated_at", "priority", "due_date"])
          .optional(),
        sort: z.enum(["asc", "desc"]).optional(),
        ...paginationSchema,
      },
    },
    async (args) => {
      const { project, ...rest } = args;
      const path =
        project === undefined
          ? "/issues"
          : `/projects/${gl.encodeProject(project)}/issues`;
      const res = await gl.get(path, rest as Record<string, QueryValue>);
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get issue",
      description: "Fetch a single issue.",
      inputSchema: {
        project: projectSchema,
        iid: issueIidSchema,
      },
    },
    async ({ project, iid }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/issues/${iid}`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "list_issue_notes",
    {
      title: "List issue comments",
      description: "Comments (notes) on an issue.",
      inputSchema: {
        project: projectSchema,
        iid: issueIidSchema,
        sort: z.enum(["asc", "desc"]).optional(),
        ...paginationSchema,
      },
    },
    async ({ project, iid, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/issues/${iid}/notes`,
        rest,
      );
      return textResult(res.data, res.headers);
    },
  );

  if (ctx.readOnly) return;

  server.registerTool(
    "create_issue",
    {
      title: "Create issue",
      description: "Create a new issue in a project.",
      inputSchema: {
        project: projectSchema,
        title: z.string().min(1),
        description: z.string().optional().describe("Markdown body"),
        labels: z.string().optional().describe("Comma-separated label list"),
        assignee_ids: z.array(z.number().int()).optional(),
        milestone_id: z.number().int().optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        confidential: z.boolean().optional(),
      },
    },
    async ({ project, ...body }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/issues`,
        body,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update issue",
      description:
        "Edit an issue. Use state_event 'close' / 'reopen' to change its state.",
      inputSchema: {
        project: projectSchema,
        iid: issueIidSchema,
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        labels: z
          .string()
          .optional()
          .describe("Comma-separated; replaces all labels"),
        assignee_ids: z.array(z.number().int()).optional(),
        milestone_id: z.number().int().optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        confidential: z.boolean().optional(),
        state_event: z.enum(["close", "reopen"]).optional(),
      },
    },
    async ({ project, iid, ...body }) => {
      const res = await gl.put(
        `/projects/${gl.encodeProject(project)}/issues/${iid}`,
        body,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "create_issue_note",
    {
      title: "Add a comment to an issue",
      description: "Adds a comment to an issue.",
      inputSchema: {
        project: projectSchema,
        iid: issueIidSchema,
        body: z.string().min(1).describe("Markdown body of the comment"),
      },
    },
    async ({ project, iid, body }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/issues/${iid}/notes`,
        { body },
      );
      return textResult(res.data);
    },
  );
}
