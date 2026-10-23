import { z } from "zod";
import { objectId } from "../users/user.schemas.js";
import { paginationSchema } from "../../utils/pagination.js";
import { SUBMISSION_STATUSES } from "./submission.model.js";

export const MIN_WRITTEN_LENGTH = 50;

function parseUrl(v: string): URL | null {
  try {
    return new URL(v);
  } catch {
    return null;
  }
}

const githubUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    const u = parseUrl(v);
    if (!u || u.protocol !== "https:" || u.username || u.password) return false;
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return false;
    return u.pathname.split("/").filter(Boolean).length >= 2; // owner/repo
  }, "Must be a GitHub repository URL like https://github.com/owner/repo");

const webUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    const u = parseUrl(v);
    return !!u && (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password && !!u.hostname;
  }, "Must be a valid http(s) URL");

const notes = z.string().trim().max(2000).optional();
const explanation = z.string().trim().min(MIN_WRITTEN_LENGTH, `Write at least ${MIN_WRITTEN_LENGTH} characters`).max(10_000);

/** `extra` adds fields shared by every variant (e.g. taskId on create). */
const variants = <T extends z.ZodRawShape>(extra: T) =>
  z.discriminatedUnion("type", [
    z.strictObject({ ...extra, type: z.literal("github"), url: githubUrl, notes }),
    z.strictObject({ ...extra, type: z.literal("deployed_url"), url: webUrl, notes }),
    z.strictObject({ ...extra, type: z.literal("written"), explanation, notes }),
  ]);

export const createSubmissionBody = variants({ taskId: objectId });
export type CreateSubmissionInput = z.infer<typeof createSubmissionBody>;

export const resubmitBody = variants({});
export type ResubmitInput = z.infer<typeof resubmitBody>;

export const submissionIdParams = z.object({ submissionId: objectId });

export const listSubmissionsQuery = paginationSchema.extend({
  taskId: objectId.optional(),
  status: z.enum(SUBMISSION_STATUSES).optional(),
});
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuery>;
