#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitLabClient } from "./gitlab.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";

async function main(): Promise<void> {
  const gl = new GitLabClient();
  const server = new McpServer({
    name: "gitlab-mr-mcp",
    version: "0.1.0",
  });

  registerReadTools(server, gl);
  registerWriteTools(server, gl);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gitlab-mr-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
