const URL_ENV = "GITLAB_URL";
const TOKEN_ENV = "GITLAB_TOKEN";

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

export interface GitLabResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class GitLabClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    const url = process.env[URL_ENV];
    const token = process.env[TOKEN_ENV];
    if (!url) throw new Error(`${URL_ENV} env var is required`);
    if (!token) throw new Error(`${TOKEN_ENV} env var is required`);
    this.baseUrl = url.replace(/\/+$/, "") + "/api/v4";
    this.token = token;
  }

  encodeProject(project: string | number): string {
    if (typeof project === "number") return String(project);
    if (/^\d+$/.test(project)) return project;
    return encodeURIComponent(project);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<GitLabResponse<T>> {
    const url = new URL(this.baseUrl + path);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": this.token,
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
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
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
