import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient, type QueryValue } from "../gitlab.js";
import {
  paginationSchema,
  projectSchema,
  textResult,
  type ToolContext,
} from "./common.js";

// All tools here are reads, so ctx.readOnly does not affect this toolset.
export function register(
  server: McpServer,
  gl: GitLabClient,
  _ctx: ToolContext,
): void {
  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List projects visible to the token, with optional filters.",
      inputSchema: {
        search: z.string().optional(),
        membership: z.boolean().optional(),
        owned: z.boolean().optional(),
        starred: z.boolean().optional(),
        archived: z.boolean().optional(),
        order_by: z
          .enum([
            "id",
            "name",
            "path",
            "created_at",
            "updated_at",
            "last_activity_at",
          ])
          .optional(),
        ...paginationSchema,
      },
    },
    async (args) => {
      const res = await gl.get("/projects", args as Record<string, QueryValue>);
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Fetch a single project.",
      inputSchema: {
        project: projectSchema,
      },
    },
    async ({ project }) => {
      const res = await gl.get(`/projects/${gl.encodeProject(project)}`);
      return textResult(res.data);
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Search GitLab globally, or within one project if 'project' is given ('projects' scope is global only). Global 'blobs' search may need Advanced Search on self-hosted.",
      inputSchema: {
        project: projectSchema.optional(),
        scope: z.enum([
          "projects",
          "issues",
          "merge_requests",
          "milestones",
          "blobs",
          "commits",
          "users",
        ]),
        search: z.string().min(1),
        ...paginationSchema,
      },
    },
    async (args) => {
      const { project, ...rest } = args;
      const path =
        project === undefined
          ? "/search"
          : `/projects/${gl.encodeProject(project)}/search`;
      const res = await gl.get(path, rest as Record<string, QueryValue>);
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "list_labels",
    {
      title: "List labels",
      description: "Labels of a project.",
      inputSchema: {
        project: projectSchema,
        search: z.string().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/labels`,
        rest,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "list_milestones",
    {
      title: "List milestones",
      description: "Milestones of a project.",
      inputSchema: {
        project: projectSchema,
        state: z.enum(["active", "closed"]).optional(),
        search: z.string().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/milestones`,
        rest,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "list_users",
    {
      title: "List users",
      description: "Find users by name/email ('search') or exact 'username'.",
      inputSchema: {
        search: z.string().optional(),
        username: z.string().optional(),
        ...paginationSchema,
      },
    },
    async (args) => {
      const res = await gl.get("/users", args);
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_current_user",
    {
      title: "Get current user",
      description: "The user that owns the configured token.",
      inputSchema: {},
    },
    async () => {
      const res = await gl.get("/user");
      return textResult(res.data);
    },
  );
}
