# gitlab-mr-mcp

An MCP (Model Context Protocol) server that lets Claude **work with a
self-hosted GitLab instance**: merge requests, issues, repository, pipelines
and more.

Tools are grouped into toolsets you can enable selectively:

- **merge_requests** — list/inspect MRs, diffs and discussions, review
  comments, approve, plus create/update/merge/rebase.
- **issues** — list/inspect, create/update/close, comment.
- **repository** — browse the tree, read files, branches, commits, compare.
- **pipelines** — pipelines and jobs, job logs, run/retry/cancel.
- **projects** — projects, search, labels, milestones, users.
- **api** — `gitlab_api`, a guarded generic call for any other REST endpoint.

Everything goes through the GitLab REST API. A read-only mode and a DELETE
guard are available (see [Safety](#safety)).

Authentication can use either a Personal Access Token **or** a browser-based
OAuth 2.0 login (authorization-code + PKCE) with automatic refresh.

## Requirements

- Node.js **≥ 18.17**
- A self-hosted GitLab instance reachable from where the MCP server runs
- **One** of the following credentials (see [Configuration](#configuration)):
  - A **Personal Access Token** with `api` scope, **or**
  - A registered **OAuth Application** in your GitLab

## Install

Most users do **not** need to clone or build. The published npm package can be
launched on demand via `npx`:

```bash
npx -y @bdkha/gitlab-mr-mcp@latest help
```

Pin to a specific version with `@bdkha/gitlab-mr-mcp@0.2.0`. See
[Use with Claude Code](#use-with-claude-code) for the actual registration.

### Build from source (contributors only)

```bash
git clone https://github.com/bdkha/claude_code_gitlab_mcp.git
cd claude_code_gitlab_mcp
npm install
npm run build
```

This produces `dist/index.js`, the entry point for the MCP server.

## Configuration

The server reads its config from environment variables. `GITLAB_URL` is always
required; for credentials, set **either** `GITLAB_TOKEN` (PAT path) **or** the
`GITLAB_OAUTH_*` variables and run `gitlab-mr-mcp login` once.

| Variable                     | Required? | Purpose                                                                |
| ---------------------------- | --------- | ---------------------------------------------------------------------- |
| `GITLAB_URL`                 | yes       | Base URL of your GitLab (`https://gitlab.example.com`). No `/api/v4`.  |
| `GITLAB_TOKEN`               | PAT path  | Personal Access Token with `api` scope.                                |
| `GITLAB_OAUTH_CLIENT_ID`     | OAuth path | OAuth Application Client ID.                                          |
| `GITLAB_OAUTH_CLIENT_SECRET` | optional  | Only for **confidential** OAuth apps. Public/PKCE apps omit this.     |
| `GITLAB_OAUTH_SCOPE`         | optional  | Default `api`.                                                         |
| `GITLAB_OAUTH_REDIRECT_PORT` | optional  | Loopback port for the OAuth callback. Default `7898`.                  |
| `GITLAB_TOOLSETS`            | optional  | Comma-separated toolsets to enable. Default: all (see [Tools](#tools)). |
| `GITLAB_READ_ONLY`           | optional  | `true` → no write tools; `gitlab_api` allows `GET` only.               |
| `GITLAB_ALLOW_DELETE`        | optional  | `true` → allow `DELETE` through `gitlab_api`. Blocked by default.      |

Priority when both PAT and a cached OAuth token are present (and matching
`GITLAB_URL`): OAuth wins. PAT is the fallback. A sample `.env.example` is
provided.

### Subcommands

The same binary runs the MCP server **or** the OAuth helper, depending on the
first argument:

```bash
gitlab-mr-mcp           # default — run the MCP server on stdio
gitlab-mr-mcp login     # browser-based OAuth login, caches tokens
gitlab-mr-mcp logout    # delete cached tokens
gitlab-mr-mcp status    # print current auth config + cached-token state
gitlab-mr-mcp help      # usage
```

Cached OAuth tokens live at `~/.config/gitlab-mr-mcp/tokens.json` (mode `0600`).

## OAuth login

1. In your GitLab profile (or admin area for a group-wide app), open
   `<GITLAB_URL>/-/user_settings/applications` and create a new application:
   - **Name:** anything (e.g. `gitlab-mr-mcp`)
   - **Redirect URI:** `http://127.0.0.1:7898/callback` (must match
     `GITLAB_OAUTH_REDIRECT_PORT`; pick another port if 7898 is in use)
   - **Confidential:** unchecked is fine — the MCP uses PKCE. Leave it
     checked if you want a `client_secret` and set
     `GITLAB_OAUTH_CLIENT_SECRET` accordingly.
   - **Scopes:** `api`
2. Copy the issued **Application ID** into `GITLAB_OAUTH_CLIENT_ID`.
3. Run the login flow once from your terminal:

   ```bash
   GITLAB_URL=https://gitlab.example.com \
   GITLAB_OAUTH_CLIENT_ID=xxxxxxxxxxxx \
   node /Users/kha/Documents/hu/mcp/dist/index.js login
   ```

   Your browser opens to the GitLab consent page; after approval the
   callback page confirms success and the tokens are saved.
4. From then on, the MCP server (run with the same `GITLAB_URL` +
   `GITLAB_OAUTH_CLIENT_ID`) reads the cached token and **refreshes it
   automatically** when it expires. No further interaction needed.

Run `gitlab-mr-mcp status` any time to inspect the cache and expiry, or
`gitlab-mr-mcp logout` to revoke the local copy (you can also revoke the
issued token in GitLab's UI under *Authorized applications*).

## Use with Claude Code

Important: `-e` env flags must appear **before** the `--` separator. Anything
after `--` is treated as the server command + its args, so loose `-e` tokens
there will be passed to your shell as separate commands.

**PAT path (recommended for first install):**

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.example.com \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -- npx -y @bdkha/gitlab-mr-mcp@latest
```

**OAuth path** (after running `npx -y @bdkha/gitlab-mr-mcp@latest login` once):

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.example.com \
  -e GITLAB_OAUTH_CLIENT_ID=xxxxxxxxxxxx \
  -- npx -y @bdkha/gitlab-mr-mcp@latest
```

**Local dev build** (if you cloned the repo and ran `npm run build`):

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.example.com \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -- node /absolute/path/to/dist/index.js
```

Verify it was registered correctly:

```bash
claude mcp list
claude mcp get gitlab-mr
```

Then in any session you can ask things like:

- "List open MRs assigned to me on project `infra/api`."
- "Show me the diff for MR !142 in `infra/api`."
- "Leave an inline comment on line 27 of `src/auth.ts` in MR !142."
- "Approve MR !142 in `infra/api`."

## Use with Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`. The
recommended config uses `npx` so updates flow without rebuilding:

```json
{
  "mcpServers": {
    "gitlab-mr": {
      "command": "npx",
      "args": ["-y", "@bdkha/gitlab-mr-mcp@latest"],
      "env": {
        "GITLAB_URL": "https://gitlab.example.com",
        "GITLAB_TOKEN": "glpat-xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

For the OAuth path, replace `GITLAB_TOKEN` with `GITLAB_OAUTH_CLIENT_ID` (and
optionally `GITLAB_OAUTH_CLIENT_SECRET`). Tokens are picked up from
`~/.config/gitlab-mr-mcp/tokens.json` after a one-time
`npx -y @bdkha/gitlab-mr-mcp@latest login`.

Restart Claude Desktop. The `gitlab-mr` server should appear in the tools list.

## Tools

All tools accept `project` as either a numeric project ID or a URL-encoded
project path (`group/subgroup/project`). `iid` is the merge request's (or
issue's) internal ID as shown in the URL. List tools accept `per_page` / `page`.

All toolsets are enabled by default (49 tools). To save context, enable only
what you need, e.g. `GITLAB_TOOLSETS=merge_requests,pipelines`. Tools marked
✎ are write tools and are not registered when `GITLAB_READ_ONLY=true`.

### merge_requests

- `list_merge_requests` — filter by `state`, `author_username`,
  `assignee_username`, `reviewer_username`, `labels`, `target_branch`,
  `source_branch`, `search`, plus pagination. If `project` is omitted, lists
  across all accessible projects (combine with `scope`).
- `get_merge_request` — full MR object including `diff_refs` needed for
  inline comments.
- `get_merge_request_diff` — per-file diff hunks.
- `list_merge_request_discussions` — threaded discussions with diff position
  and resolved status.
- `list_merge_request_notes` — flat (non-threaded) notes list.
- `list_merge_request_commits`, `list_merge_request_pipelines`.
- ✎ `create_merge_request_note` — post a general comment.
- ✎ `create_merge_request_discussion` — post an inline diff comment. Requires
  a `position` built from `get_merge_request`'s `diff_refs` plus the file
  path and line number from `get_merge_request_diff`.
- ✎ `reply_to_discussion` — reply to an existing thread by `discussion_id`.
- ✎ `resolve_discussion` — mark a thread resolved (or unresolved with
  `resolved: false`).
- ✎ `approve_merge_request` — optional `sha` to guard against approving an
  outdated commit.
- ✎ `unapprove_merge_request`.
- ✎ `create_merge_request`, `update_merge_request` (incl. `state_event`
  close/reopen).
- ✎ `merge_merge_request` — irreversible; pass `sha` (head SHA) so GitLab
  rejects the merge if the branch moved.
- ✎ `rebase_merge_request` — asynchronous; check `rebase_in_progress` with
  `get_merge_request`.

### issues

- `list_issues` — omit `project` to list across projects (with `scope`).
- `get_issue`, `list_issue_notes`.
- ✎ `create_issue`, `update_issue` (incl. `state_event` close/reopen),
  `create_issue_note`.

### repository

- `get_repository_tree` — `path`, `ref`, `recursive`.
- `get_file` — raw content; `ref` defaults to `HEAD`; optional
  `start_line` / `end_line`; truncated at `max_chars` (default 100000).
- `list_branches`, `get_branch`.
- `list_commits`, `get_commit` (`include_diff` adds the first page of the
  diff), `compare` (`from`, `to`). Diff output is truncated at `max_chars`.
- ✎ `create_branch`.

### pipelines

- `list_pipelines`, `get_pipeline`, `list_pipeline_jobs`, `get_job`.
- `get_job_log` — last `tail_lines` lines of the job trace (default 200,
  max 5000).
- ✎ `create_pipeline` (`ref`, `variables`), `retry_pipeline`,
  `cancel_pipeline`, `retry_job`, `cancel_job`.

### projects

- `list_projects`, `get_project`, `get_current_user`, `list_users`.
- `list_labels`, `list_milestones`.
- `search` — `scope` = projects/issues/merge_requests/milestones/blobs/
  commits/users; global `blobs` search may require Advanced Search on
  self-hosted GitLab.

### api

- `gitlab_api` — `method`, `path` (relative, without `/api/v4`, e.g.
  `/projects/1/wikis`), optional `query` and `body`. Use it for endpoints the
  other tools don't cover. Always registered; see [Safety](#safety).

## Safety

- `GITLAB_READ_ONLY=true` registers no write tools, and `gitlab_api` rejects
  every method except `GET`.
- `DELETE` through `gitlab_api` is rejected unless `GITLAB_ALLOW_DELETE=true`.
  Read-only mode always wins. There are no dedicated delete tools.
- `gitlab_api` only accepts paths relative to `/api/v4` on `GITLAB_URL`;
  absolute URLs are rejected so the token is never sent to another host.
- These checks run before any request is sent. Your token's own permissions
  still apply on top.

## Posting an inline comment — example

1. `get_merge_request` → copy `diff_refs.base_sha`, `start_sha`, `head_sha`.
2. `get_merge_request_diff` → pick a file (`new_path`) and a `new_line`
   (line in the post-change file you want to comment on).
3. `create_merge_request_discussion`:

   ```json
   {
     "project": "group/project",
     "iid": 142,
     "body": "Consider extracting this into a helper.",
     "position": {
       "base_sha": "abc123…",
       "start_sha": "def456…",
       "head_sha": "789abc…",
       "new_path": "src/auth.ts",
       "new_line": 27
     }
   }
   ```

For comments on **deleted** lines, set `old_path` + `old_line` instead.
For **unchanged context** lines, set both `new_line` and `old_line`.

## Notes & limitations

- v0.1 has no automatic pagination — `per_page` and `page` are exposed on
  list/diff tools and the response footer reports `nextPage` from
  GitLab's `x-next-page` header.
- Wiki, releases/tags, file commits and snippets have no dedicated tools yet;
  use `gitlab_api` for them.
- Errors from GitLab are surfaced verbatim (status + body), so 401/403 typically
  indicate token scope or permissions.
- On 401 with an OAuth token, the client refreshes once and retries
  transparently. If refresh fails (refresh token expired/revoked), run
  `gitlab-mr-mcp logout && gitlab-mr-mcp login` to re-authorize.
