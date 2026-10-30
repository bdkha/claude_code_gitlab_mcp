import { z } from "zod";
import { paginationFooter, toText } from "../format.js";

export interface ToolContext {
  readOnly: boolean;
  allowDelete: boolean;
}

export const projectSchema = z
  .union([z.string(), z.number()])
  .describe(
    "Project ID (number) or URL-encoded path (e.g. 'group/subgroup/project')",
  );

export const iidSchema = z
  .number()
  .int()
  .positive()
  .describe("Merge request internal ID (iid) as shown in the MR URL");

export const paginationSchema = {
  per_page: z.number().int().min(1).max(100).optional(),
  page: z.number().int().min(1).optional(),
};

export function textResult(data: unknown, headers?: Record<string, string>) {
  return {
    content: [
      {
        type: "text" as const,
        text: toText(data) + (headers ? paginationFooter(headers) : ""),
      },
    ],
  };
}
