import { CachedToken, readTokens, writeTokens } from "./tokens.js";
import { OAuthConfig, loadOAuthConfig, refreshAccessToken } from "./oauth.js";

const REFRESH_SKEW_MS = 30_000;

export interface AuthHeader {
  name: string;
  value: string;
}

export interface AuthProvider {
  /** Returns the header to attach to GitLab requests. May refresh on the fly. */
  getAuthHeader(): Promise<AuthHeader>;
  /** Called after a 401. Returns true if a fresh token is now available. */
  invalidate(): Promise<boolean>;
  /** Short label for diagnostics. */
  describe(): string;
}

class PatAuth implements AuthProvider {
  constructor(private readonly token: string) {}
  async getAuthHeader(): Promise<AuthHeader> {
    return { name: "PRIVATE-TOKEN", value: this.token };
  }
  async invalidate(): Promise<boolean> {
    return false;
  }
  describe(): string {
    return "PAT (GITLAB_TOKEN)";
  }
}

class OAuthAuth implements AuthProvider {
  private cached: CachedToken;
  private inflight: Promise<boolean> | null = null;

  constructor(
    private readonly cfg: OAuthConfig,
    initial: CachedToken,
  ) {
    this.cached = initial;
  }

  async getAuthHeader(): Promise<AuthHeader> {
    if (
      this.cached.expires_at &&
      Date.now() > this.cached.expires_at - REFRESH_SKEW_MS
    ) {
      await this.refresh();
    }
    return {
      name: "Authorization",
      value: `Bearer ${this.cached.access_token}`,
    };
  }

  async invalidate(): Promise<boolean> {
    return this.refresh();
  }

  describe(): string {
    return `OAuth (${this.cfg.gitlabUrl})`;
  }

  private refresh(): Promise<boolean> {
    if (!this.cached.refresh_token) return Promise.resolve(false);
    if (!this.inflight) {
      const rt = this.cached.refresh_token;
      this.inflight = (async () => {
        try {
          const next = await refreshAccessToken(this.cfg, rt);
          if (!next.refresh_token && this.cached.refresh_token) {
            next.refresh_token = this.cached.refresh_token;
          }
          await writeTokens(next);
          this.cached = next;
          return true;
        } catch (e) {
          console.error(
            "OAuth refresh failed:",
            e instanceof Error ? e.message : e,
          );
          return false;
        } finally {
          this.inflight = null;
        }
      })();
    }
    return this.inflight;
  }
}

export async function createAuthProvider(): Promise<AuthProvider> {
  const cached = await readTokens();
  const cfg = loadOAuthConfig();
  if (cached && cfg && cached.gitlab_url === cfg.gitlabUrl) {
    return new OAuthAuth(cfg, cached);
  }
  const pat = process.env.GITLAB_TOKEN;
  if (pat) return new PatAuth(pat);
  const hints: string[] = [];
  if (!cached && cfg) {
    hints.push("OAuth client configured but no cached token — run `gitlab-mr-mcp login`.");
  }
  if (cached && cfg && cached.gitlab_url !== cfg.gitlabUrl) {
    hints.push(
      `Cached token was issued for ${cached.gitlab_url} but GITLAB_URL is ${cfg.gitlabUrl}. Run \`gitlab-mr-mcp logout\` then \`login\` again.`,
    );
  }
  if (!cfg && !pat) {
    hints.push(
      "Set GITLAB_TOKEN (Personal Access Token) or configure OAuth via GITLAB_OAUTH_CLIENT_ID + `gitlab-mr-mcp login`.",
    );
  }
  throw new Error(`No GitLab credentials available. ${hints.join(" ")}`);
}
