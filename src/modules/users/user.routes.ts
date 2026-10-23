import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { authLimiter } from "../../middleware/rate-limit.js";
import { validate } from "../../middleware/validate.js";
import * as controllers from "./user.controller.js";
import {
  changePasswordBody,
  listUsersQuery,
  updateProfileBody,
  updateRoleBody,
  updateStatusBody,
  userIdParams,
} from "./user.schemas.js";

export const userRouter = Router();

userRouter.use(authenticate);

// Self-service (any authenticated role). Declared before /:userId routes.
userRouter.get("/me", controllers.getMe);
userRouter.patch(
  "/me",
  validate({ body: updateProfileBody }),
  controllers.updateMe
);
userRouter.patch(
  "/me/password",
  authLimiter,
  validate({ body: changePasswordBody }),
  controllers.changePassword
);

// Admin only
userRouter.get(
  "/",
  authorize("admin"),
  validate({ query: listUsersQuery }),
  controllers.list
);
userRouter.patch(
  "/:userId/status",
  authorize("admin"),
  validate({ params: userIdParams, body: updateStatusBody }),
  controllers.updateStatus
);
userRouter.patch(
  "/:userId/role",
  authorize("admin"),
  validate({ params: userIdParams, body: updateRoleBody }),
  controllers.updateRole
);
