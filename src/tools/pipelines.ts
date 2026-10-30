import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GitLabClient } from "../gitlab.js";
import { tailLines } from "../format.js";
import {
  paginationSchema,
  projectSchema,
  textResult,
  type ToolContext,
} from "./common.js";

const pipelineIdSchema = z.number().int().positive().describe("Pipeline ID");
const jobIdSchema = z.number().int().positive().describe("Job ID");

const jobStatus = z.enum([
  "created",
  "pending",
  "running",
  "failed",
  "success",
  "canceled",
  "skipped",
  "waiting_for_resource",
  "manual",
]);

export function register(
  server: McpServer,
  gl: GitLabClient,
  ctx: ToolContext,
): void {
  server.registerTool(
    "list_pipelines",
    {
      title: "List pipelines",
      description: "List pipelines of a project, newest first by default.",
      inputSchema: {
        project: projectSchema,
        ref: z.string().optional(),
        sha: z.string().optional(),
        status: z
          .enum([
            "created",
            "waiting_for_resource",
            "preparing",
            "pending",
            "running",
            "success",
            "failed",
            "canceled",
            "skipped",
            "manual",
            "scheduled",
          ])
          .optional(),
        source: z
          .string()
          .optional()
          .describe("e.g. push, web, schedule, merge_request_event"),
        username: z.string().optional(),
        order_by: z.enum(["id", "status", "ref", "updated_at", "user_id"]).optional(),
        sort: z.enum(["asc", "desc"]).optional(),
        ...paginationSchema,
      },
    },
    async ({ project, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/pipelines`,
        rest,
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_pipeline",
    {
      title: "Get pipeline",
      description: "Fetch a single pipeline.",
      inputSchema: {
        project: projectSchema,
        pipeline_id: pipelineIdSchema,
      },
    },
    async ({ project, pipeline_id }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/pipelines/${pipeline_id}`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "list_pipeline_jobs",
    {
      title: "List pipeline jobs",
      description: "List jobs of a pipeline, optionally filtered by status.",
      inputSchema: {
        project: projectSchema,
        pipeline_id: pipelineIdSchema,
        scope: jobStatus.optional().describe("Only jobs with this status"),
        include_retried: z.boolean().optional(),
        ...paginationSchema,
      },
    },
    async ({ project, pipeline_id, scope, ...rest }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/pipelines/${pipeline_id}/jobs`,
        // GitLab expects an array param; the client only sends scalars.
        { ...rest, "scope[]": scope },
      );
      return textResult(res.data, res.headers);
    },
  );

  server.registerTool(
    "get_job",
    {
      title: "Get job",
      description: "Fetch a single CI job.",
      inputSchema: {
        project: projectSchema,
        job_id: jobIdSchema,
      },
    },
    async ({ project, job_id }) => {
      const res = await gl.get(
        `/projects/${gl.encodeProject(project)}/jobs/${job_id}`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "get_job_log",
    {
      title: "Get job log",
      description: "Tail of a job's log (trace).",
      inputSchema: {
        project: projectSchema,
        job_id: jobIdSchema,
        tail_lines: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .optional()
          .describe("Lines from the end (default 200)"),
      },
    },
    async ({ project, job_id, tail_lines }) => {
      const res = await gl.getRaw(
        `/projects/${gl.encodeProject(project)}/jobs/${job_id}/trace`,
      );
      return textResult(tailLines(res.data, tail_lines ?? 200));
    },
  );

  if (ctx.readOnly) return;

  server.registerTool(
    "create_pipeline",
    {
      title: "Create pipeline",
      description: "Run a new pipeline for a branch or tag.",
      inputSchema: {
        project: projectSchema,
        ref: z.string().describe("Branch or tag name"),
        variables: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              variable_type: z.enum(["env_var", "file"]).optional(),
            }),
          )
          .optional(),
      },
    },
    async ({ project, ref, variables }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/pipeline`,
        { ref, variables },
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "retry_pipeline",
    {
      title: "Retry pipeline",
      description: "Retry failed or canceled jobs of a pipeline.",
      inputSchema: {
        project: projectSchema,
        pipeline_id: pipelineIdSchema,
      },
    },
    async ({ project, pipeline_id }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/pipelines/${pipeline_id}/retry`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "cancel_pipeline",
    {
      title: "Cancel pipeline",
      description: "Cancel running jobs of a pipeline.",
      inputSchema: {
        project: projectSchema,
        pipeline_id: pipelineIdSchema,
      },
    },
    async ({ project, pipeline_id }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/pipelines/${pipeline_id}/cancel`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "retry_job",
    {
      title: "Retry job",
      description: "Retry a single job.",
      inputSchema: {
        project: projectSchema,
        job_id: jobIdSchema,
      },
    },
    async ({ project, job_id }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/jobs/${job_id}/retry`,
      );
      return textResult(res.data);
    },
  );

  server.registerTool(
    "cancel_job",
    {
      title: "Cancel job",
      description: "Cancel a single job.",
      inputSchema: {
        project: projectSchema,
        job_id: jobIdSchema,
      },
    },
    async ({ project, job_id }) => {
      const res = await gl.post(
        `/projects/${gl.encodeProject(project)}/jobs/${job_id}/cancel`,
      );
      return textResult(res.data);
    },
  );
}
