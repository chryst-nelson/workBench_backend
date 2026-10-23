import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./submission.controller.js";
import { reviewBody } from "../reviews/review.schemas.js";
import {
  createSubmissionBody,
  listSubmissionsQuery,
  resubmitBody,
  submissionIdParams,
} from "./submission.schemas.js";

export const submissionRouter = Router();

submissionRouter.use(authenticate);
submissionRouter.post("/", authorize("learner"), validate({ body: createSubmissionBody }), c.create);
submissionRouter.get("/me", authorize("learner"), validate({ query: listSubmissionsQuery }), c.listMine);
// Owner, admin, or the learner's assigned mentor (checked in the service).
submissionRouter.get("/:submissionId", authorize("learner", "mentor", "admin"), validate({ params: submissionIdParams }), c.get);
submissionRouter.post(
  "/:submissionId/resubmit",
  authorize("learner"),
  validate({ params: submissionIdParams, body: resubmitBody }),
  c.resubmit
);
submissionRouter.post(
  "/:submissionId/review",
  authorize("mentor", "admin"),
  validate({ params: submissionIdParams, body: reviewBody }),
  c.review
);
