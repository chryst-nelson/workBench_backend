import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./enrollment.controller.js";
import { adminListEnrollmentsQuery, assignMentorBody, enrollBody, enrollmentIdParams, listEnrollmentsQuery } from "./enrollment.schemas.js";

export const enrollmentRouter = Router();

enrollmentRouter.use(authenticate);
enrollmentRouter.post("/", authorize("learner"), validate({ body: enrollBody }), c.enroll);
enrollmentRouter.get("/me", authorize("learner"), validate({ query: listEnrollmentsQuery }), c.listMine);
// Admin: every enrollment, filterable (e.g. ?unassigned=true to find learners without a mentor)
enrollmentRouter.get("/", authorize("admin"), validate({ query: adminListEnrollmentsQuery }), c.adminList);
// Mentor: the learners assigned to me
enrollmentRouter.get("/assigned", authorize("mentor"), validate({ query: listEnrollmentsQuery }), c.assigned);
enrollmentRouter.patch(
  "/:enrollmentId/mentor",
  authorize("admin"),
  validate({ params: enrollmentIdParams, body: assignMentorBody }),
  c.assignMentor
);
// Owner or admin (checked in the service)
enrollmentRouter.get(
  "/:enrollmentId/progress",
  authorize("learner", "admin"),
  validate({ params: enrollmentIdParams }),
  c.progress
);
