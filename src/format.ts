export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
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
