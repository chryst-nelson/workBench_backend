import type { Request, Response } from "express";
import { getValidated } from "../../middleware/validate.js";
import { paginationMeta } from "../../utils/pagination.js";
import { sendSuccess } from "../../utils/response.js";
import { toSubmission } from "../submissions/submission.serializer.js";
import { toReview } from "./review.serializer.js";
import type { QueueQuery } from "./review.schemas.js";
import * as service from "./review.service.js";

export async function queue(req: Request, res: Response) {
  const { query } = getValidated<{ query: QueueQuery }>(res);
  const { items, total } = await service.listQueue(req.user!, query);
  sendSuccess(
    res,
    items.map((i) => ({
      submission: toSubmission(i.submission, i.review ? toReview(i.review) : null),
      learner: i.learner ? { id: i.learner.id as string, fullName: i.learner.fullName } : null,
      task: i.task ? { id: i.task.id as string, title: i.task.title } : null,
      track: i.track ? { id: i.track.id as string, title: i.track.title } : null,
    })),
    { meta: paginationMeta(query.page, query.limit, total) }
  );
}
