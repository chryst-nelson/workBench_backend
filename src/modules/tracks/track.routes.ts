import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import * as c from "./track.controller.js";
import { createTrackBody, listTracksQuery, trackIdParams, updateTrackBody } from "./track.schemas.js";

export const trackRouter = Router();

trackRouter.use(authenticate);

// Any authenticated user; the service only ever returns what that role may see.
trackRouter.get("/", validate({ query: listTracksQuery }), c.list);
trackRouter.get("/:trackId", validate({ params: trackIdParams }), c.get);

trackRouter.post("/", authorize("admin"), validate({ body: createTrackBody }), c.create);
trackRouter.patch(
  "/:trackId",
  authorize("admin"),
  validate({ params: trackIdParams, body: updateTrackBody }),
  c.update
);
trackRouter.delete("/:trackId", authorize("admin"), validate({ params: trackIdParams }), c.remove);
