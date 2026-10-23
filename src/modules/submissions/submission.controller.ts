import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { paginationMeta } from "../../utils/pagination.js";
import { getValidated } from "../../middleware/validate.js";
import * as service from "./submission.service.js";
import { toSubmission } from "./submission.serializer.js";
import { toReview } from "../reviews/review.serializer.js";
import { reviewSubmission } from "../reviews/review.service.js";
import type { ReviewInput } from "../reviews/review.schemas.js";
import type { CreateSubmissionInput, ListSubmissionsQuery, ResubmitInput } from "./submission.schemas.js";

export async function create(req: Request, res: Response) {
  const { body } = getValidated<{ body: CreateSubmissionInput }>(res);
  const submission = await service.createSubmission(req.user!, body);
  sendSuccess(res, { submission: toSubmission(submission) }, { status: 201 });
}

export async function resubmit(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { submissionId: string }; body: ResubmitInput }>(res);
  const submission = await service.resubmit(req.user!, params.submissionId, body);
  sendSuccess(res, { submission: toSubmission(submission) }, { status: 201 });
}

export async function listMine(req: Request, res: Response) {
  const { query } = getValidated<{ query: ListSubmissionsQuery }>(res);
  const { items, total, reviews } = await service.listMine(req.user!.id, query);
  sendSuccess(
    res,
    items.map((s) => {
      const r = reviews.get(s.id);
      return toSubmission(s, r ? toReview(r) : null);
    }),
    { meta: paginationMeta(query.page, query.limit, total) }
  );
}

export async function get(req: Request, res: Response) {
  const { params } = getValidated<{ params: { submissionId: string } }>(res);
  const { submission, history, reviews, learner } = await service.getSubmission(req.user!, params.submissionId);
  const view = (s: typeof submission) => {
    const r = reviews.get(s.id);
    return toSubmission(s, r ? toReview(r) : null);
  };
  const p = learner?.profile;
  sendSuccess(res, {
    submission: view(submission),
    history: history.map(view),
    learner: learner
      ? {
          id: learner.id as string,
          fullName: learner.fullName,
          profile: {
            programmingLanguage: p?.programmingLanguage ?? null,
            skillLevel: p?.skillLevel ?? null,
            learningGoals: p?.learningGoals ?? null,
          },
        }
      : null,
  });
}

export async function review(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { submissionId: string }; body: ReviewInput }>(res);
  const result = await reviewSubmission({ ...req.user!, ip: req.ip }, params.submissionId, body);
  sendSuccess(res, { submission: toSubmission(result.submission, toReview(result.review)) }, { status: 201 });
}
