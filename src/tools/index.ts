import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab.js";
import type { ToolConfig, ToolsetName } from "../config.js";
import type { ToolContext } from "./common.js";
import * as api from "./api.js";
import * as issues from "./issues.js";
import * as mergeRequests from "./merge-requests.js";
import * as pipelines from "./pipelines.js";
import * as projects from "./projects.js";
import * as repository from "./repository.js";

type RegisterFn = (server: McpServer, gl: GitLabClient, ctx: ToolContext) => void;

const TOOLSETS: Record<ToolsetName, RegisterFn> = {
  merge_requests: mergeRequests.register,
  issues: issues.register,
  repository: repository.register,
  pipelines: pipelines.register,
  projects: projects.register,
  api: api.register,
};

export function registerTools(
  server: McpServer,
  gl: GitLabClient,
  cfg: ToolConfig,
): void {
  const ctx: ToolContext = {
    readOnly: cfg.readOnly,
    allowDelete: cfg.allowDelete,
  };
  for (const [name, register] of Object.entries(TOOLSETS)) {
    if (cfg.toolsets.has(name as ToolsetName)) register(server, gl, ctx);
  }
}
