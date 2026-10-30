import type { AuthProvider } from "./auth/index.js";

const URL_ENV = "GITLAB_URL";

export class GitLabError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "GitLabError";
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Return the response body as text without JSON parsing (raw files, job logs). */
  raw?: boolean;
}

export interface GitLabResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class GitLabClient {
  private readonly baseUrl: string;

  constructor(private readonly auth: AuthProvider) {
    const url = process.env[URL_ENV];
    if (!url) throw new Error(`${URL_ENV} env var is required`);
    this.baseUrl = url.replace(/\/+$/, "") + "/api/v4";
  }

  encodeProject(project: string | number): string {
    if (typeof project === "number") return String(project);
    if (/^\d+$/.test(project)) return project;
    return encodeURIComponent(project);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<GitLabResponse<T>> {
    return this.requestOnce<T>(method, path, opts, true);
  }

  private async requestOnce<T>(
    method: string,
    path: string,
    opts: RequestOptions,
    allowAuthRetry: boolean,
  ): Promise<GitLabResponse<T>> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const authHeader = await this.auth.getAuthHeader();
    const headers: Record<string, string> = {
      [authHeader.name]: authHeader.value,
      Accept: "application/json",
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, { method, headers, body });
    const text = await res.text();
    let data: unknown = null;
    if (opts.raw && res.ok) {
      data = text;
    } else if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (res.status === 401 && allowAuthRetry) {
      const refreshed = await this.auth.invalidate();
      if (refreshed) {
        return this.requestOnce<T>(method, path, opts, false);
      }
    }
    if (!res.ok) {
      throw new GitLabError(
        res.status,
        data,
        `GitLab ${method} ${path} → ${res.status} ${res.statusText}: ${
          typeof data === "string" ? data : JSON.stringify(data)
        }`,
      );
    }
    const respHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    return { data: data as T, status: res.status, headers: respHeaders };
  }

  get<T = unknown>(path: string, query?: Record<string, QueryValue>) {
    return this.request<T>("GET", path, { query });
  }

  getRaw(path: string, query?: Record<string, QueryValue>) {
    return this.request<string>("GET", path, { query, raw: true });
  }

  post<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ) {
    return this.request<T>("POST", path, { body, query });
  }

  put<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ) {
    return this.request<T>("PUT", path, { body, query });
  }
}
