# gitlab-mr-mcp

An MCP (Model Context Protocol) server that lets Claude **read and review
Merge Requests on a self-hosted GitLab instance**.

It exposes tools for listing/inspecting MRs, fetching diffs and discussions,
posting general and inline review comments, replying to and resolving threads,
and approving/unapproving merge requests — all through the GitLab REST API.

Authentication can use either a Personal Access Token **or** a browser-based
OAuth 2.0 login (authorization-code + PKCE) with automatic refresh.

## Requirements

- Node.js **≥ 18.17**
- A self-hosted GitLab instance reachable from where the MCP server runs
- **One** of the following credentials (see [Configuration](#configuration)):
  - A **Personal Access Token** with `api` scope, **or**
  - A registered **OAuth Application** in your GitLab

## Install & build

```bash
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

**PAT path:**

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.example.com \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -- node /Users/kha/Documents/hu/mcp/dist/index.js
```

**OAuth path** (after running `gitlab-mr-mcp login` once):

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.example.com \
  -e GITLAB_OAUTH_CLIENT_ID=xxxxxxxxxxxx \
  -- node /Users/kha/Documents/hu/mcp/dist/index.js
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

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`. Use the
`env` block to set whichever credentials you prefer (PAT or OAuth client id):

```json
{
  "mcpServers": {
    "gitlab-mr": {
      "command": "node",
      "args": ["/Users/kha/Documents/hu/mcp/dist/index.js"],
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
`~/.config/gitlab-mr-mcp/tokens.json` after a one-time `gitlab-mr-mcp login`.

Restart Claude Desktop. The `gitlab-mr` server should appear in the tools list.

## Tools

All tools accept `project` as either a numeric project ID or a URL-encoded
project path (`group/subgroup/project`). `iid` is the merge request's internal
ID as shown in the URL.

### Read

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

### Write

- `create_merge_request_note` — post a general comment.
- `create_merge_request_discussion` — post an inline diff comment. Requires
  a `position` built from `get_merge_request`'s `diff_refs` plus the file
  path and line number from `get_merge_request_diff`.
- `reply_to_discussion` — reply to an existing thread by `discussion_id`.
- `resolve_discussion` — mark a thread resolved (or unresolved with
  `resolved: false`).
- `approve_merge_request` — optional `sha` to guard against approving an
  outdated commit.
- `unapprove_merge_request`.

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
- Issues, pipelines, releases, and MR creation/merging are intentionally
  out of scope; this server is focused on MR review.
- Errors from GitLab are surfaced verbatim (status + body), so 401/403 typically
  indicate token scope or permissions.
- On 401 with an OAuth token, the client refreshes once and retries
  transparently. If refresh fails (refresh token expired/revoked), run
  `gitlab-mr-mcp logout && gitlab-mr-mcp login` to re-authorize.
