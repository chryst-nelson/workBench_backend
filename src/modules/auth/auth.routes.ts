import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authLimiter } from "../../middleware/rate-limit.js";
import * as c from "./auth.controller.js";
import { forgotPasswordBody, loginBody, registerBody, resetPasswordBody } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", authLimiter, validate({ body: registerBody }), c.register);
authRouter.post("/login", authLimiter, validate({ body: loginBody }), c.login);
authRouter.post("/refresh", c.refresh);
authRouter.post("/logout", c.logout);
authRouter.get("/me", authenticate, c.me);
authRouter.post("/forgot-password", authLimiter, validate({ body: forgotPasswordBody }), c.forgotPassword);
authRouter.post("/reset-password", authLimiter, validate({ body: resetPasswordBody }), c.resetPassword);
