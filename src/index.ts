#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitLabClient } from "./gitlab.js";
import { registerTools } from "./tools/index.js";
import { loadToolConfig } from "./config.js";
import { createAuthProvider } from "./auth/index.js";
import {
  loadOAuthConfig,
  redirectUriFor,
  runAuthorizationCodeFlow,
} from "./auth/oauth.js";
import {
  deleteTokens,
  readTokens,
  tokenFilePath,
  writeTokens,
} from "./auth/tokens.js";

async function main(): Promise<void> {
  const sub = process.argv[2];
  switch (sub) {
    case "login":
      return loginCommand();
    case "logout":
      return logoutCommand();
    case "status":
      return statusCommand();
    case "help":
    case "--help":
    case "-h":
      return helpCommand();
    default:
      return runServer();
  }
}

async function runServer(): Promise<void> {
  const cfg = loadToolConfig();
  const auth = await createAuthProvider();
  const gl = new GitLabClient(auth);
  const server = new McpServer({
    name: "gitlab-mr-mcp",
    version: "0.3.1",
  });
  registerTools(server, gl, cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `gitlab-mr-mcp running on stdio (auth: ${auth.describe()}; toolsets: ${[
      ...cfg.toolsets,
    ].join(",")}${cfg.readOnly ? "; read-only" : ""})`,
  );
}

async function loginCommand(): Promise<void> {
  const cfg = loadOAuthConfig();
  if (!cfg) {
    console.error("Cannot start OAuth flow — required env vars missing:");
    console.error("  GITLAB_URL                  — base URL of your GitLab");
    console.error("  GITLAB_OAUTH_CLIENT_ID      — OAuth application Client ID");
    console.error("Optional:");
    console.error("  GITLAB_OAUTH_CLIENT_SECRET  — for confidential apps");
    console.error("  GITLAB_OAUTH_SCOPE          — default 'api'");
    console.error(`  GITLAB_OAUTH_REDIRECT_PORT  — default 7898`);
    process.exit(2);
  }
  console.error(`Authorizing against ${cfg.gitlabUrl} (scope: ${cfg.scope})`);
  console.error(`Redirect URI: ${redirectUriFor(cfg)}`);
  console.error(
    "(Register the same redirect URI in your GitLab OAuth Application.)",
  );
  const token = await runAuthorizationCodeFlow(cfg);
  await writeTokens(token);
  console.error(`✔ Tokens saved to ${tokenFilePath()}`);
  if (token.scope) console.error(`  scope:    ${token.scope}`);
  if (token.expires_at) {
    console.error(`  expires:  ${new Date(token.expires_at).toISOString()}`);
  }
  if (token.refresh_token) {
    console.error(`  refresh:  available`);
  } else {
    console.error(
      `  refresh:  NOT available — you'll need to \`login\` again when the access token expires`,
    );
  }
}

async function logoutCommand(): Promise<void> {
  const removed = await deleteTokens();
  if (removed) console.error(`✔ Removed ${tokenFilePath()}`);
  else console.error("No cached tokens found.");
}

async function statusCommand(): Promise<void> {
  const cached = await readTokens();
  const cfg = loadOAuthConfig();
  const pat = !!process.env.GITLAB_TOKEN;

  console.error("=== gitlab-mr-mcp status ===");
  console.error(`Token cache:  ${tokenFilePath()}`);
  if (cached) {
    console.error(`  gitlab_url: ${cached.gitlab_url}`);
    if (cached.scope) console.error(`  scope:      ${cached.scope}`);
    if (cached.expires_at) {
      const ms = cached.expires_at - Date.now();
      const min = Math.round(ms / 60_000);
      console.error(
        `  expires:    ${new Date(cached.expires_at).toISOString()} (${
          ms > 0 ? `in ${min} min` : `${-min} min ago — refresh on next request`
        })`,
      );
    }
    console.error(
      `  refresh:    ${cached.refresh_token ? "available" : "NOT available"}`,
    );
  } else {
    console.error("  (no cached tokens)");
  }
  console.error("");
  console.error(`OAuth config: ${cfg ? "yes" : "no"}`);
  if (cfg) {
    console.error(`  gitlab_url:  ${cfg.gitlabUrl}`);
    console.error(`  client_id:   ${cfg.clientId}`);
    console.error(
      `  client_secret: ${cfg.clientSecret ? "set" : "not set (public client / PKCE-only)"}`,
    );
    console.error(`  scope:       ${cfg.scope}`);
    console.error(`  redirect:    ${redirectUriFor(cfg)}`);
  }
  console.error("");
  console.error(`PAT fallback (GITLAB_TOKEN): ${pat ? "set" : "not set"}`);
  console.error("");
  if (cached && cfg && cached.gitlab_url === cfg.gitlabUrl) {
    console.error("→ MCP will use OAuth.");
  } else if (pat) {
    console.error("→ MCP will use PAT.");
  } else {
    console.error("→ MCP will FAIL to start — no credentials available.");
  }
}

function helpCommand(): void {
  console.error(`gitlab-mr-mcp — MCP server for self-hosted GitLab (MRs, issues, repository, pipelines)

Usage:
  gitlab-mr-mcp              Run the MCP server on stdio (default)
  gitlab-mr-mcp login        Run the OAuth authorization-code flow and cache tokens
  gitlab-mr-mcp logout       Remove cached tokens
  gitlab-mr-mcp status       Print current auth configuration and cached-token state
  gitlab-mr-mcp help         Show this message

Auth env vars:
  GITLAB_URL                  base URL of your GitLab (no /api/v4)
  GITLAB_TOKEN                Personal Access Token (PAT fallback)
  GITLAB_OAUTH_CLIENT_ID      OAuth application Client ID
  GITLAB_OAUTH_CLIENT_SECRET  optional, for confidential OAuth apps
  GITLAB_OAUTH_SCOPE          optional, default "api"
  GITLAB_OAUTH_REDIRECT_PORT  optional, default 7898

Tool env vars:
  GITLAB_TOOLSETS             comma-separated toolsets to enable (default: all)
                              merge_requests,issues,repository,pipelines,projects,api
  GITLAB_READ_ONLY            "true" to register no write tools; gitlab_api allows GET only
  GITLAB_ALLOW_DELETE         "true" to allow DELETE via gitlab_api (blocked by default)

Token cache: ~/.config/gitlab-mr-mcp/tokens.json (chmod 600)`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
