const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ "application/json": { schema } });
const err = (description: string) => ({ description, content: json(ref("ErrorResponse")) });
const ok = (description: string, data: object, status = "200") => ({
  [status]: {
    description,
    content: json({
      type: "object",
      properties: { success: { type: "boolean", example: true }, data },
    }),
  },
});
const body = (schema: object) => ({ required: true, content: json(schema) });
const secured = [{ bearerAuth: [] }];
const idParam = {
  name: "userId",
  in: "path",
  required: true,
  schema: { type: "string", pattern: "^[a-f0-9]{24}$" },
};

const session = {
  type: "object",
  properties: { user: ref("User"), accessToken: { type: "string" }, expiresIn: { type: "integer", example: 900 } },
};
const message = { type: "object", properties: { message: { type: "string" } } };

export const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "p-learning API",
    version: "0.5.0",
    description:
      "Backend API for a mentor-reviewed programming learning platform.\n\n" +
      "Auth: short-lived Bearer access token + rotating refresh token in an httpOnly cookie (`refreshToken`, path `/api/v1/auth`).",
  },
  servers: [{ url: "/api/v1" }],
  tags: [{ name: "Health" }, { name: "Auth" }, { name: "Users" }, { name: "Admin" }, { name: "Content" }, { name: "Learning" }, { name: "Reviews" }],
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: { code: { type: "string", example: "VALIDATION_ERROR" }, message: { type: "string" }, details: {} },
          },
        },
      },
      Profile: {
        type: "object",
        properties: {
          programmingLanguage: { type: "string", nullable: true },
          skillLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"], nullable: true },
          learningGoals: { type: "string", nullable: true },
          weeklyAvailabilityHours: { type: "number", nullable: true },
          preferredTrack: { type: "string", nullable: true },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          fullName: { type: "string" },
          email: { type: "string", format: "email" },
          role: { type: "string", enum: ["learner", "mentor", "admin"] },
          status: { type: "string", enum: ["active", "suspended", "disabled"] },
          profile: ref("Profile"),
          onboardingCompleted: { type: "boolean" },
          lastLoginAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Track: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          programmingLanguage: { type: "string" },
          skillLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          estimatedDurationWeeks: { type: "integer" },
          status: { type: "string", enum: ["draft", "published"] },
        },
      },
      TrackInput: {
        type: "object",
        required: ["title", "description", "programmingLanguage", "skillLevel", "estimatedDurationWeeks"],
        properties: {
          title: { type: "string", example: "JavaScript Foundations" },
          description: { type: "string" },
          programmingLanguage: { type: "string", example: "JavaScript" },
          skillLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          estimatedDurationWeeks: { type: "integer", minimum: 1, maximum: 260 },
          status: { type: "string", enum: ["draft", "published"], description: "PATCH only. Publishing is subject to publish rules." },
        },
      },
      Module: {
        type: "object",
        properties: {
          id: { type: "string" },
          track: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          order: { type: "integer" },
          status: { type: "string", enum: ["draft", "published"] },
        },
      },
      TaskSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          module: { type: "string" },
          title: { type: "string" },
          order: { type: "integer" },
          estimatedDifficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          status: { type: "string", enum: ["draft", "published"] },
        },
      },
      Task: {
        allOf: [
          ref("TaskSummary"),
          {
            type: "object",
            properties: {
              track: { type: "string" },
              problemDescription: { type: "string" },
              learningObjectives: { type: "array", items: { type: "string" } },
              requirements: { type: "array", items: { type: "string" } },
              instructions: { type: "string" },
              expectedDeliverables: { type: "array", items: { type: "string" } },
              submissionGuidelines: { type: "string" },
              allowedSubmissionTypes: { type: "array", items: { type: "string", enum: ["github", "deployed_url", "written"] } },
            },
          },
        ],
      },
      TaskInput: {
        type: "object",
        required: ["title", "problemDescription", "learningObjectives", "requirements", "instructions", "expectedDeliverables", "submissionGuidelines", "estimatedDifficulty"],
        properties: {
          title: { type: "string" },
          problemDescription: { type: "string" },
          learningObjectives: { type: "array", items: { type: "string" } },
          requirements: { type: "array", items: { type: "string" } },
          instructions: { type: "string" },
          expectedDeliverables: { type: "array", items: { type: "string" } },
          submissionGuidelines: { type: "string" },
          allowedSubmissionTypes: { type: "array", items: { type: "string", enum: ["github", "deployed_url", "written"] }, default: ["github"] },
          estimatedDifficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          order: { type: "integer", description: "POST only. Omit to append." },
          status: { type: "string", enum: ["draft", "published"], description: "PATCH only." },
        },
      },
      Enrollment: {
        type: "object",
        properties: {
          id: { type: "string" },
          learner: { type: "string" },
          track: { type: "string" },
          mentor: { type: "string", nullable: true },
          status: { type: "string", enum: ["active", "completed"] },
          enrolledAt: { type: "string", format: "date-time" },
        },
      },
      Submission: {
        type: "object",
        properties: {
          id: { type: "string" },
          task: { type: "string" },
          enrollment: { type: "string" },
          attempt: { type: "integer" },
          previousSubmission: { type: "string", nullable: true },
          type: { type: "string", enum: ["github", "deployed_url", "written"] },
          url: { type: "string", nullable: true },
          explanation: { type: "string", nullable: true },
          notes: { type: "string", nullable: true },
          status: { type: "string", enum: ["pending_review", "approved", "revision_requested"] },
          review: { ...ref("Review"), nullable: true },
          submittedAt: { type: "string", format: "date-time" },
        },
      },
      Review: {
        type: "object",
        properties: {
          id: { type: "string" },
          decision: { type: "string", enum: ["approved", "revision_requested"] },
          feedback: { type: "string", nullable: true },
          reviewer: { type: "string" },
          reviewedAt: { type: "string", format: "date-time" },
        },
      },
      ReviewInput: {
        type: "object",
        required: ["decision"],
        description: "`feedback` is optional when approving and required (min 10 characters) when requesting revisions.",
        properties: {
          decision: { type: "string", enum: ["approved", "revision_requested"] },
          feedback: { type: "string", maxLength: 5000 },
        },
      },
      SubmissionInput: {
        type: "object",
        required: ["type"],
        description:
          "`github`: url = https://github.com/owner/repo. `deployed_url`: url = http(s) URL. `written`: explanation (min 50 chars). `notes` optional. `taskId` required on create, not on resubmit.",
        properties: {
          taskId: { type: "string" },
          type: { type: "string", enum: ["github", "deployed_url", "written"] },
          url: { type: "string" },
          explanation: { type: "string", minLength: 50 },
          notes: { type: "string", maxLength: 2000 },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["fullName", "email", "password"],
        properties: {
          fullName: { type: "string", example: "Ada Obi" },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, maxLength: 72, description: "Letter + number required" },
          programmingLanguage: { type: "string" },
          skillLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          learningGoals: { type: "string" },
          weeklyAvailabilityHours: { type: "number", minimum: 1, maximum: 168 },
          preferredTrack: { type: "string" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: { tags: ["Health"], summary: "Liveness check", responses: { "200": { description: "Service is up" } } },
    },
    "/health/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness check (database connectivity)",
        responses: { "200": { description: "Ready" }, "503": err("Database not connected") },
      },
    },
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Create a learner account and start a session",
        requestBody: body(ref("RegisterRequest")),
        responses: { ...ok("Account created", session, "201"), "400": err("Validation error"), "409": err("Email already registered"), "429": err("Rate limited") },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        requestBody: body({
          type: "object",
          required: ["email", "password"],
          properties: { email: { type: "string" }, password: { type: "string" } },
        }),
        responses: { ...ok("Logged in; sets refresh cookie", session), "401": err("INVALID_CREDENTIALS"), "403": err("ACCOUNT_SUSPENDED / ACCOUNT_DISABLED"), "429": err("Rate limited") },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate refresh cookie and get a new access token",
        responses: { ...ok("New access token", { type: "object", properties: { accessToken: { type: "string" }, expiresIn: { type: "integer" } } }), "401": err("Missing, invalid, expired or reused refresh token") },
      },
    },
    "/auth/logout": {
      post: { tags: ["Auth"], summary: "Revoke the refresh token and clear the cookie", responses: { "204": { description: "Logged out" } } },
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current user",
        security: secured,
        responses: { ...ok("Current user", { type: "object", properties: { user: ref("User") } }), "401": err("Unauthenticated"), "403": err("Account suspended or disabled") },
      },
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email (always 202)",
        requestBody: body({ type: "object", required: ["email"], properties: { email: { type: "string" } } }),
        responses: { ...ok("Accepted", message, "202"), "429": err("Rate limited") },
      },
    },
    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Set a new password using an emailed token",
        requestBody: body({
          type: "object",
          required: ["token", "newPassword"],
          properties: { token: { type: "string" }, newPassword: { type: "string" } },
        }),
        responses: { ...ok("Password updated; all sessions revoked", message), "400": err("Invalid/expired token or weak password") },
      },
    },

    "/tracks": {
      get: {
        tags: ["Content"],
        summary: "List learning tracks (learners/mentors: published only; admins: all, filter with status)",
        security: secured,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "language", in: "query", schema: { type: "string" } },
          { name: "skillLevel", in: "query", schema: { type: "string", enum: ["beginner", "intermediate", "advanced"] } },
          { name: "status", in: "query", description: "Admin only", schema: { type: "string", enum: ["draft", "published"] } },
          { name: "q", in: "query", description: "Title search", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated tracks (`data` array + `meta`)" } },
      },
      post: {
        tags: ["Content"],
        summary: "Create a track (admin). Always created as a draft.",
        security: secured,
        requestBody: body(ref("TrackInput")),
        responses: { ...ok("Created", { type: "object", properties: { track: ref("Track") } }, "201"), "400": err("Validation error"), "403": err("Not an admin") },
      },
    },
    "/tracks/{trackId}": {
      get: {
        tags: ["Content"],
        summary: "Get a track (404 for drafts unless admin)",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        responses: { ...ok("Track", { type: "object", properties: { track: ref("Track") } }), "404": err("Not found or not visible") },
      },
      patch: {
        tags: ["Content"],
        summary: "Update / publish / unpublish a track (admin)",
        description: "Publishing requires at least one published module. Unpublishing is blocked while learners are using the track (Stage 4).",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        requestBody: body(ref("TrackInput")),
        responses: { ...ok("Updated", { type: "object", properties: { track: ref("Track") } }), "409": err("PUBLISH_REQUIREMENTS_NOT_MET / CONTENT_IN_USE") },
      },
      delete: {
        tags: ["Content"],
        summary: "Delete a track with its modules and tasks (admin)",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        responses: { "204": { description: "Deleted" }, "404": err("Not found"), "409": err("CONTENT_IN_USE") },
      },
    },
    "/tracks/{trackId}/modules": {
      get: {
        tags: ["Content"],
        summary: "Syllabus: modules in order, each with task summaries (no task content)",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        responses: { "200": { description: "Modules, each with a `tasks` array of TaskSummary" }, "404": err("Not found or not visible") },
      },
      post: {
        tags: ["Content"],
        summary: "Create a module (admin). Created as a draft; `order` optional (append by default).",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        requestBody: body({ type: "object", required: ["title"], properties: { title: { type: "string" }, description: { type: "string" }, order: { type: "integer" } } }),
        responses: { ...ok("Created", { type: "object", properties: { module: ref("Module") } }, "201"), "409": err("ORDER_CONFLICT") },
      },
    },
    "/tracks/{trackId}/modules/order": {
      put: {
        tags: ["Content"],
        summary: "Reorder all modules of a track (admin). `ids` must list every module exactly once.",
        security: secured,
        parameters: [{ ...idParam, name: "trackId" }],
        requestBody: body({ type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } }),
        responses: { "200": { description: "Modules in new order" }, "400": err("ORDER_MISMATCH") },
      },
    },
    "/modules/{moduleId}": {
      get: {
        tags: ["Content"],
        summary: "Get a module",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        responses: { ...ok("Module", { type: "object", properties: { module: ref("Module") } }), "404": err("Not found or not visible") },
      },
      patch: {
        tags: ["Content"],
        summary: "Update / publish / unpublish a module (admin)",
        description: "Publishing requires at least one published task. A published track must keep one published module (PARENT_WOULD_BE_EMPTY).",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        requestBody: body({ type: "object", properties: { title: { type: "string" }, description: { type: "string" }, status: { type: "string", enum: ["draft", "published"] } } }),
        responses: { ...ok("Updated", { type: "object", properties: { module: ref("Module") } }), "409": err("PUBLISH_REQUIREMENTS_NOT_MET / PARENT_WOULD_BE_EMPTY / CONTENT_IN_USE") },
      },
      delete: {
        tags: ["Content"],
        summary: "Delete a module and its tasks (admin)",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        responses: { "204": { description: "Deleted" }, "409": err("PARENT_WOULD_BE_EMPTY / CONTENT_IN_USE") },
      },
    },
    "/modules/{moduleId}/tasks": {
      get: {
        tags: ["Content"],
        summary: "List task summaries of a module (in order)",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        responses: { "200": { description: "Array of TaskSummary" }, "404": err("Not found or not visible") },
      },
      post: {
        tags: ["Content"],
        summary: "Create a task (admin). Created as a draft; `order` optional (append by default).",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        requestBody: body(ref("TaskInput")),
        responses: { ...ok("Created", { type: "object", properties: { task: ref("Task") } }, "201"), "409": err("ORDER_CONFLICT") },
      },
    },
    "/modules/{moduleId}/tasks/order": {
      put: {
        tags: ["Content"],
        summary: "Reorder all tasks of a module (admin)",
        security: secured,
        parameters: [{ ...idParam, name: "moduleId" }],
        requestBody: body({ type: "object", required: ["ids"], properties: { ids: { type: "array", items: { type: "string" } } } }),
        responses: { "200": { description: "Task summaries in new order" }, "400": err("ORDER_MISMATCH") },
      },
    },
    "/tasks/{taskId}": {
      get: {
        tags: ["Content"],
        summary: "Full task content (admins: any; mentors: published only; learners: only if enrolled and the task is unlocked)",
        security: secured,
        parameters: [{ ...idParam, name: "taskId" }],
        responses: { ...ok("Task", { type: "object", properties: { task: ref("Task") } }), "403": err("NOT_ENROLLED / TASK_LOCKED (learners)"), "404": err("Not found or not visible") },
      },
      patch: {
        tags: ["Content"],
        summary: "Update / publish / unpublish a task (admin)",
        security: secured,
        parameters: [{ ...idParam, name: "taskId" }],
        requestBody: body(ref("TaskInput")),
        responses: { ...ok("Updated", { type: "object", properties: { task: ref("Task") } }), "409": err("PARENT_WOULD_BE_EMPTY / CONTENT_IN_USE") },
      },
      delete: {
        tags: ["Content"],
        summary: "Delete a task (admin)",
        security: secured,
        parameters: [{ ...idParam, name: "taskId" }],
        responses: { "204": { description: "Deleted" }, "409": err("PARENT_WOULD_BE_EMPTY / CONTENT_IN_USE") },
      },
    },

    "/enrollments": {
      get: {
        tags: ["Reviews"],
        summary: "All enrollments (admin). Use `unassigned=true` to find learners without a mentor.",
        security: secured,
        parameters: [
          { name: "trackId", in: "query", schema: { type: "string" } },
          { name: "mentorId", in: "query", schema: { type: "string" } },
          { name: "unassigned", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "completed"] } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated enrollments with `learnerDetails`, `mentorDetails`, `trackDetails`, `pendingReviews`" } },
      },
      post: {
        tags: ["Learning"],
        summary: "Enroll in a published track (learner). Only the first task is unlocked.",
        security: secured,
        requestBody: body({ type: "object", required: ["trackId"], properties: { trackId: { type: "string" } } }),
        responses: { ...ok("Enrolled", { type: "object", properties: { enrollment: ref("Enrollment") } }, "201"), "404": err("Track not found / unpublished"), "409": err("ALREADY_ENROLLED") },
      },
    },
    "/enrollments/assigned": {
      get: {
        tags: ["Reviews"],
        summary: "Learners assigned to me (mentor), with `pendingReviews` per enrollment",
        security: secured,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { "200": { description: "Paginated enrollments with `learnerDetails`, `trackDetails`, `pendingReviews`" } },
      },
    },
    "/enrollments/{enrollmentId}/mentor": {
      patch: {
        tags: ["Reviews"],
        summary: "Assign or clear the mentor for an enrollment (admin). `mentorId: null` clears it.",
        security: secured,
        parameters: [{ ...idParam, name: "enrollmentId" }],
        requestBody: body({ type: "object", required: ["mentorId"], properties: { mentorId: { type: "string", nullable: true } } }),
        responses: { ...ok("Updated", { type: "object", properties: { enrollment: ref("Enrollment") } }), "400": err("INVALID_MENTOR (not an active mentor)"), "404": err("Enrollment not found") },
      },
    },
    "/enrollments/me": {
      get: {
        tags: ["Learning"],
        summary: "My enrollments (learner)",
        security: secured,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
        ],
        responses: { "200": { description: "Paginated enrollments with `trackDetails`" } },
      },
    },
    "/enrollments/{enrollmentId}/progress": {
      get: {
        tags: ["Learning"],
        summary: "Progress through a track (owner or admin). Each task is completed, current or locked.",
        security: secured,
        parameters: [{ ...idParam, name: "enrollmentId" }],
        responses: { "200": { description: "`summary` (totals, percentComplete, currentTaskId) and `tasks` with `state` and `latestSubmission`" }, "404": err("Not found / not yours") },
      },
    },
    "/submissions": {
      post: {
        tags: ["Learning"],
        summary: "Submit work for the learner's current task (starts as pending_review)",
        security: secured,
        requestBody: body(ref("SubmissionInput")),
        responses: {
          ...ok("Submitted", { type: "object", properties: { submission: ref("Submission") } }, "201"),
          "400": err("Validation error / SUBMISSION_TYPE_NOT_ALLOWED"),
          "403": err("NOT_ENROLLED / TASK_LOCKED"),
          "409": err("SUBMISSION_EXISTS / TASK_ALREADY_COMPLETED"),
        },
      },
    },
    "/submissions/me": {
      get: {
        tags: ["Learning"],
        summary: "My submissions (learner), newest first",
        security: secured,
        parameters: [
          { name: "taskId", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["pending_review", "approved", "revision_requested"] } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated submissions" } },
      },
    },
    "/submissions/{submissionId}": {
      get: {
        tags: ["Learning"],
        summary: "A submission with every attempt for the same task, each with its review (owner, admin, or the assigned mentor; mentors and admins also get `learner` with profile)",
        security: secured,
        parameters: [{ ...idParam, name: "submissionId" }],
        responses: { "200": { description: "`submission` and `history` (attempt 1..n)" }, "404": err("Not found / not yours") },
      },
    },
    "/submissions/{submissionId}/review": {
      post: {
        tags: ["Reviews"],
        summary: "Approve or request changes (assigned mentor or admin). Approval unlocks the learner's next task.",
        security: secured,
        parameters: [{ ...idParam, name: "submissionId" }],
        requestBody: body(ref("ReviewInput")),
        responses: {
          ...ok("Reviewed", { type: "object", properties: { submission: ref("Submission") } }, "201"),
          "400": err("Validation error (feedback required for revision_requested)"),
          "404": err("Not found / not assigned to you"),
          "409": err("ALREADY_REVIEWED"),
        },
      },
    },
    "/reviews/queue": {
      get: {
        tags: ["Reviews"],
        summary: "Submissions to review (mentor: assigned learners only; admin: all). Oldest first when pending.",
        security: secured,
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["pending_review", "approved", "revision_requested"], default: "pending_review" } },
          { name: "trackId", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated items: `submission` (with `review`), `learner`, `task`, `track`" } },
      },
    },
    "/submissions/{submissionId}/resubmit": {
      post: {
        tags: ["Learning"],
        summary: "Submit a new attempt after a revision was requested",
        security: secured,
        parameters: [{ ...idParam, name: "submissionId" }],
        requestBody: body(ref("SubmissionInput")),
        responses: { ...ok("New attempt (attempt + 1)", { type: "object", properties: { submission: ref("Submission") } }, "201"), "404": err("Not found / not yours"), "409": err("NOT_RESUBMITTABLE") },
      },
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        summary: "Get my profile",
        security: secured,
        responses: { ...ok("Profile", { type: "object", properties: { user: ref("User") } }), "401": err("Unauthenticated") },
      },
      patch: {
        tags: ["Users"],
        summary: "Update my profile / onboarding data (unknown fields such as role are rejected)",
        security: secured,
        requestBody: body({
          type: "object",
          properties: {
            fullName: { type: "string" },
            programmingLanguage: { type: "string" },
            skillLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
            learningGoals: { type: "string" },
            weeklyAvailabilityHours: { type: "number" },
            preferredTrack: { type: "string" },
          },
        }),
        responses: { ...ok("Updated profile", { type: "object", properties: { user: ref("User") } }), "400": err("Validation error") },
      },
    },
    "/users/me/password": {
      patch: {
        tags: ["Users"],
        summary: "Change my password (revokes all other sessions)",
        security: secured,
        requestBody: body({
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: { currentPassword: { type: "string" }, newPassword: { type: "string" } },
        }),
        responses: { ...ok("Password changed; new session issued", session), "400": err("INVALID_CURRENT_PASSWORD or weak password") },
      },
    },
    "/users": {
      get: {
        tags: ["Admin"],
        summary: "List users (admin)",
        security: secured,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
          { name: "role", in: "query", schema: { type: "string", enum: ["learner", "mentor", "admin"] } },
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "suspended", "disabled"] } },
          { name: "q", in: "query", description: "Search name or email", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated users (`data` array + `meta`)" }, "403": err("Not an admin") },
      },
    },
    "/users/{userId}/status": {
      patch: {
        tags: ["Admin"],
        summary: "Set account status (admin; audited; revokes sessions when not active)",
        security: secured,
        parameters: [idParam],
        requestBody: body({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["active", "suspended", "disabled"] } } }),
        responses: { ...ok("Updated user", { type: "object", properties: { user: ref("User") } }), "403": err("Not an admin, or targeting yourself"), "404": err("User not found") },
      },
    },
    "/users/{userId}/role": {
      patch: {
        tags: ["Admin"],
        summary: "Set user role (admin; audited)",
        security: secured,
        parameters: [idParam],
        requestBody: body({ type: "object", required: ["role"], properties: { role: { type: "string", enum: ["learner", "mentor", "admin"] } } }),
        responses: { ...ok("Updated user", { type: "object", properties: { user: ref("User") } }), "403": err("Not an admin, or targeting yourself"), "404": err("User not found") },
      },
    },
  },
};

export const swaggerUiOptions = { customSiteTitle: "p-learning API Docs" };
