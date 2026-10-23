import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./review.controller.js";
import { queueQuery } from "./review.schemas.js";

export const reviewRouter = Router();

reviewRouter.use(authenticate);
// Mentors see their assigned learners' submissions; admins see everything.
reviewRouter.get("/queue", authorize("mentor", "admin"), validate({ query: queueQuery }), c.queue);
