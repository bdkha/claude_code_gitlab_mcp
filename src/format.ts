export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    `\n\n[truncated: showing ${maxChars} of ${text.length} chars]`
  );
}

export function tailLines(text: string, n: number): string {
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length <= n) return text;
  return (
    `[showing last ${n} of ${lines.length} lines]\n\n` +
    lines.slice(-n).join("\n")
  );
}

export function paginationFooter(headers: Record<string, string>): string {
  const parts: string[] = [];
  const page = headers["x-page"];
  const totalPages = headers["x-total-pages"];
  const total = headers["x-total"];
  const nextPage = headers["x-next-page"];
  const perPage = headers["x-per-page"];
  if (page) parts.push(`page=${page}`);
  if (perPage) parts.push(`perPage=${perPage}`);
  if (totalPages) parts.push(`totalPages=${totalPages}`);
  if (total) parts.push(`total=${total}`);
  if (nextPage) parts.push(`nextPage=${nextPage}`);
  return parts.length ? `\n\n[${parts.join(" ")}]` : "";
}
