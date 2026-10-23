import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { userRouter } from "./modules/users/user.routes.js";
import { trackRouter } from "./modules/tracks/track.routes.js";
import { moduleRouter, trackModulesRouter } from "./modules/modules/module.routes.js";
import { moduleTasksRouter, taskRouter } from "./modules/tasks/task.routes.js";
import { enrollmentRouter } from "./modules/enrollments/enrollment.routes.js";
import { reviewRouter } from "./modules/reviews/review.routes.js";
import { submissionRouter } from "./modules/submissions/submission.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { globalLimiter } from "./middleware/rate-limit.js";
import { logger } from "./lib/logger.js";
import { env } from "./config/env.js";
import { swaggerSpec, swaggerUiOptions } from "./lib/swagger.js";
import { AppError } from "./lib/errors.js";

const app = express();

app.set("trust proxy", env.TRUST_PROXY);
app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (no Origin) and whitelisted browser origins only.
      if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
      cb(new AppError("Origin not allowed by CORS", 403, "CORS_FORBIDDEN"));
    },
    credentials: true,
  })
);
app.use(globalLimiter);
if (env.NODE_ENV !== "test") app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// Unversioned probe path for k8s/Docker healthchecks
app.use("/health", healthRouter);

const api = express.Router();
api.use("/health", healthRouter);
api.use("/auth", authRouter);
api.use("/users", userRouter);
api.use("/tracks/:trackId/modules", trackModulesRouter);
api.use("/tracks", trackRouter);
api.use("/modules/:moduleId/tasks", moduleTasksRouter);
api.use("/modules", moduleRouter);
api.use("/tasks", taskRouter);
api.use("/enrollments", enrollmentRouter);
api.use("/submissions", submissionRouter);
api.use("/reviews", reviewRouter);
app.use("/api/v1", api);

app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get("/api/v1/docs.json", (_req, res) => {
  res.json(swaggerSpec);
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
