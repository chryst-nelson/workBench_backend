import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { moduleIdParams, reorderBody } from "../modules/module.schemas.js";
import * as c from "./task.controller.js";
import { createTaskBody, taskIdParams, updateTaskBody } from "./task.schemas.js";

/** Mounted at /modules/:moduleId/tasks. The list returns summaries only. */
export const moduleTasksRouter = Router({ mergeParams: true });
moduleTasksRouter.use(authenticate);
moduleTasksRouter.get("/", validate({ params: moduleIdParams }), c.list);
moduleTasksRouter.post("/", authorize("admin"), validate({ params: moduleIdParams, body: createTaskBody }), c.create);
moduleTasksRouter.put("/order", authorize("admin"), validate({ params: moduleIdParams, body: reorderBody }), c.reorder);

/**
 * Mounted at /tasks. Full task content: admins and mentors (published), and learners only for
 * tasks they are enrolled for and have unlocked (enforced in the service).
 */
export const taskRouter = Router();
taskRouter.use(authenticate);
taskRouter.get("/:taskId", validate({ params: taskIdParams }), c.get);
taskRouter.patch("/:taskId", authorize("admin"), validate({ params: taskIdParams, body: updateTaskBody }), c.update);
taskRouter.delete("/:taskId", authorize("admin"), validate({ params: taskIdParams }), c.remove);
