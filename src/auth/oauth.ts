import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { CachedToken } from "./tokens.js";

const DEFAULT_REDIRECT_PORT = 7898;
const CALLBACK_PATH = "/callback";
const FLOW_TIMEOUT_MS = 5 * 60_000;

export interface OAuthConfig {
  gitlabUrl: string;
  clientId: string;
  clientSecret?: string;
  scope: string;
  redirectPort: number;
}

export function loadOAuthConfig(): OAuthConfig | null {
  const url = process.env.GITLAB_URL;
  const clientId = process.env.GITLAB_OAUTH_CLIENT_ID;
  if (!url || !clientId) return null;
  const portRaw = process.env.GITLAB_OAUTH_REDIRECT_PORT;
  const port = portRaw ? Number.parseInt(portRaw, 10) : DEFAULT_REDIRECT_PORT;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`GITLAB_OAUTH_REDIRECT_PORT is not a valid port: ${portRaw}`);
  }
  return {
    gitlabUrl: url.replace(/\/+$/, ""),
    clientId,
    clientSecret: process.env.GITLAB_OAUTH_CLIENT_SECRET || undefined,
    scope: process.env.GITLAB_OAUTH_SCOPE || "api",
    redirectPort: port,
  };
}

export function redirectUriFor(cfg: OAuthConfig): string {
  return `http://127.0.0.1:${cfg.redirectPort}${CALLBACK_PATH}`;
}

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest(),
  );
  return { verifier, challenge };
}

export async function runAuthorizationCodeFlow(
  cfg: OAuthConfig,
): Promise<CachedToken> {
  const { verifier, challenge } = pkce();
  const state = base64url(crypto.randomBytes(16));
  const redirectUri = redirectUriFor(cfg);

  const codePromise = startCallbackServer(cfg.redirectPort);

  const authorize = new URL(`${cfg.gitlabUrl}/oauth/authorize`);
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", cfg.scope);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const authUrl = authorize.toString();
  console.error("");
  console.error("Open this URL in your browser to authorize:");
  console.error(`  ${authUrl}`);
  console.error("");
  await tryOpenBrowser(authUrl);

  const result = await withTimeout(
    codePromise,
    FLOW_TIMEOUT_MS,
    "OAuth callback timed out after 5 minutes",
  );
  if (result.state !== state) {
    throw new Error("OAuth state mismatch — possible CSRF, aborting");
  }
  return exchangeCode(cfg, result.code, verifier, redirectUri);
}

function startCallbackServer(
  port: number,
): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        if (!req.url) {
          res.statusCode = 400;
          res.end("Bad request");
          return;
        }
        const u = new URL(req.url, `http://127.0.0.1:${port}`);
        if (u.pathname !== CALLBACK_PATH) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const err = u.searchParams.get("error");
        if (err) {
          const desc = u.searchParams.get("error_description") || "";
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<h1>Authorization failed</h1><pre>${escapeHtml(err)} ${escapeHtml(desc)}</pre>`,
          );
          reject(new Error(`GitLab authorization error: ${err} ${desc}`));
          closeSoon(server);
          return;
        }
        const code = u.searchParams.get("code");
        const gotState = u.searchParams.get("state");
        if (!code || !gotState) {
          res.statusCode = 400;
          res.end("Missing code or state");
          reject(new Error("Missing code or state in callback"));
          closeSoon(server);
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<!doctype html><html><body style=\"font-family:system-ui;padding:2rem\"><h1>✓ Login successful</h1><p>You can close this tab and return to the terminal.</p></body></html>",
        );
        resolve({ code, state: gotState });
        closeSoon(server);
      } catch (e) {
        reject(e);
        closeSoon(server);
      }
    });
    server.once("error", (e) => reject(e));
    server.listen(port, "127.0.0.1");
  });
}

function closeSoon(server: http.Server): void {
  setTimeout(() => server.close(), 100);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

async function exchangeCode(
  cfg: OAuthConfig,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  return tokenRequest(cfg, body);
}

export async function refreshAccessToken(
  cfg: OAuthConfig,
  refreshToken: string,
): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
  });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  return tokenRequest(cfg, body);
}

async function tokenRequest(
  cfg: OAuthConfig,
  body: URLSearchParams,
): Promise<CachedToken> {
  const res = await fetch(`${cfg.gitlabUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `GitLab /oauth/token → ${res.status} ${res.statusText}: ${JSON.stringify(json)}`,
    );
  }
  if (typeof json.access_token !== "string") {
    throw new Error(`Token response missing access_token: ${JSON.stringify(json)}`);
  }
  const now = Date.now();
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : Number(json.expires_in);
  return {
    access_token: json.access_token,
    refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    token_type: typeof json.token_type === "string" ? json.token_type : "Bearer",
    scope: typeof json.scope === "string" ? json.scope : undefined,
    expires_at: Number.isFinite(expiresIn) && expiresIn > 0 ? now + expiresIn * 1000 : undefined,
    gitlab_url: cfg.gitlabUrl,
  };
}

async function tryOpenBrowser(url: string): Promise<void> {
  try {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "cmd"
          : "xdg-open";
    const args =
      process.platform === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {
      // browser open is best-effort; the URL is also printed
    });
    child.unref();
  } catch {
    // ignore — the URL has been printed
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
