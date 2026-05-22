import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHE_DIR = path.join(os.homedir(), ".config", "gitlab-mr-mcp");
const TOKEN_FILE = path.join(CACHE_DIR, "tokens.json");

export interface CachedToken {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope?: string;
  // ms epoch; undefined means "no expiry advertised by the server"
  expires_at?: number;
  // base URL the token was issued for; used to avoid reusing tokens across instances
  gitlab_url: string;
}

export function tokenFilePath(): string {
  return TOKEN_FILE;
}

export async function readTokens(): Promise<CachedToken | null> {
  try {
    const buf = await fs.readFile(TOKEN_FILE, "utf8");
    const json = JSON.parse(buf) as CachedToken;
    if (!json.access_token || !json.gitlab_url) return null;
    return json;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeTokens(t: CachedToken): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${TOKEN_FILE}.tmp.${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(t, null, 2), { mode: 0o600 });
  await fs.rename(tmp, TOKEN_FILE);
}

export async function deleteTokens(): Promise<boolean> {
  try {
    await fs.unlink(TOKEN_FILE);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
