import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { trackIdParams } from "../tracks/track.schemas.js";
import * as c from "./module.controller.js";
import { createModuleBody, moduleIdParams, reorderBody, updateModuleBody } from "./module.schemas.js";

/** Mounted at /tracks/:trackId/modules */
export const trackModulesRouter = Router({ mergeParams: true });
trackModulesRouter.use(authenticate);
trackModulesRouter.get("/", validate({ params: trackIdParams }), c.syllabus);
trackModulesRouter.post("/", authorize("admin"), validate({ params: trackIdParams, body: createModuleBody }), c.create);
trackModulesRouter.put("/order", authorize("admin"), validate({ params: trackIdParams, body: reorderBody }), c.reorder);

/** Mounted at /modules */
export const moduleRouter = Router();
moduleRouter.use(authenticate);
moduleRouter.get("/:moduleId", validate({ params: moduleIdParams }), c.get);
moduleRouter.patch(
  "/:moduleId",
  authorize("admin"),
  validate({ params: moduleIdParams, body: updateModuleBody }),
  c.update
);
moduleRouter.delete("/:moduleId", authorize("admin"), validate({ params: moduleIdParams }), c.remove);
