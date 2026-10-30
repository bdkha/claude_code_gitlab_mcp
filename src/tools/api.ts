import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab.js";
import { textResult, type ToolContext } from "./common.js";

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

export function register(
  server: McpServer,
  gl: GitLabClient,
  ctx: ToolContext,
): void {
  const restriction = ctx.readOnly
    ? "Currently only GET is allowed (GITLAB_READ_ONLY is on)."
    : ctx.allowDelete
      ? "All methods are allowed, including DELETE."
      : "DELETE is blocked (set GITLAB_ALLOW_DELETE=true to enable).";

  server.registerTool(
    "gitlab_api",
    {
      title: "Call GitLab REST API",
      description:
        "Call any GitLab REST v4 endpoint not covered by a dedicated tool. 'path' is relative to /api/v4 (e.g. '/version', '/projects/123/labels'). " +
        restriction,
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z
          .string()
          .describe("Path starting with '/', without the /api/v4 prefix"),
        query: z
          .record(z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
        body: z.unknown().optional().describe("JSON request body"),
      },
    },
    async ({ method, path, query, body }) => {
      // Guards run before any network call; the path must stay on the configured host.
      if (
        !path.startsWith("/") ||
        path.startsWith("//") ||
        path.includes("://")
      ) {
        return errorResult(
          "Invalid path: it must start with a single '/' and must not contain '://'.",
        );
      }
      if (path === "/api/v4" || path.startsWith("/api/v4/")) {
        return errorResult(
          "Invalid path: drop the '/api/v4' prefix, it is added automatically.",
        );
      }
      // Dot segments (incl. %2e-encoded) are normalized by URL and could escape /api/v4.
      if (!new URL("http://x/api/v4" + path).pathname.startsWith("/api/v4/")) {
        return errorResult(
          "Invalid path: it must not navigate outside /api/v4 (no '..' segments).",
        );
      }
      if (method === "GET" && body !== undefined) {
        return errorResult(
          "GET requests cannot have a body; pass parameters via 'query'.",
        );
      }
      if (ctx.readOnly && method !== "GET") {
        return errorResult(
          `${method} is not allowed: server runs with GITLAB_READ_ONLY enabled.`,
        );
      }
      if (method === "DELETE" && !ctx.allowDelete) {
        return errorResult(
          "DELETE is disabled. Set GITLAB_ALLOW_DELETE=true to enable it.",
        );
      }
      const res = await gl.request(method, path, { query, body });
      return textResult(res.data, res.headers);
    },
  );
}
