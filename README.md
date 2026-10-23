# p-learning API

Backend for a mentor-reviewed programming learning platform. Node.js, Express 5, TypeScript, MongoDB (Mongoose), Zod, Vitest.

> Status: Stage 4 (enrollment, progression, submissions). Payments/subscriptions are intentionally out of scope.

## Setup

```bash
npm install
cp .env.example .env   # set MONGODB_URI and JWT_ACCESS_SECRET
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='Str0ngPass' npm run seed:admin   # first admin
npm run dev            # http://localhost:3000
npm test
npm run build && npm start
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| NODE_ENV | development | development / test / production |
| PORT | 3000 | |
| MONGODB_URI | – | required outside test |
| CORS_ORIGINS | http://localhost:5173 | comma-separated |
| TRUST_PROXY | 0 | number of proxies in front (set 1 behind ingress/nginx) |
| RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX | 900000 / 100 | global limiter |
| AUTH_RATE_LIMIT_WINDOW_MS / AUTH_RATE_LIMIT_MAX | 900000 / 20 | login, register, password flows (per IP) |
| JWT_ACCESS_SECRET | – | required, ≥32 chars |
| ACCESS_TOKEN_TTL_MINUTES / REFRESH_TOKEN_TTL_DAYS | 15 / 7 | |
| BCRYPT_ROUNDS | 12 | |
| PASSWORD_RESET_TTL_MINUTES | 30 | |
| FRONTEND_URL | http://localhost:5173 | reset-link base |
| COOKIE_SAMESITE | lax | `none` needs HTTPS |

## Endpoints

- `GET /api/v1/health` – liveness (also `/health` for probes)
- `GET /api/v1/health/ready` – readiness (503 if DB down)
- `GET /api/v1/docs` – Swagger UI, `/api/v1/docs.json` – spec

## Auth model

- Access token: JWT (HS256, 15 min) in `Authorization: Bearer`. Role/status are read from the DB on every request, so suspensions and role changes apply immediately.
- Refresh token: opaque random value in an httpOnly cookie (`path=/api/v1/auth`), stored hashed, rotated on every use. Replaying a rotated token revokes the whole token family.
- Password change/reset revokes all sessions. Self-registration always creates a `learner`; admins promote users via `PATCH /api/v1/users/:id/role`.
- Password reset emails go through the `EmailProvider` interface (`src/services/email`); the default only logs in development.

## Learner journey (Stage 4)

- `POST /enrollments` (learner, published track, once per track) · `GET /enrollments/me` · `GET /enrollments/:id/progress` (owner/admin).
- **Progression is derived, not stored.** The track's published tasks in order (module order, then task order) form the sequence; the first task without an approved submission is `current`, later ones are `locked`, approved ones are `completed` and stay readable. A learner can't skip ahead: opening (`GET /tasks/:id`) or submitting to a locked task returns `403 TASK_LOCKED`; not being enrolled returns `403 NOT_ENROLLED`.
- `POST /submissions` `{taskId, type, url|explanation, notes?}` for the *current* task only. Types: `github` (https://github.com/owner/repo), `deployed_url` (http/https), `written` (≥50 chars); the task's `allowedSubmissionTypes` decides which apply. Starts as `pending_review`.
- One document per attempt. `POST /submissions/:id/resubmit` creates attempt n+1 and is only allowed when the latest attempt is `revision_requested`. Unique `(learner, task, attempt)` makes concurrent submits/resubmits safe. `GET /submissions/:id` returns the full attempt history.
- **Content protection:** tracks with enrollments can't be deleted, unpublished or reordered; modules/tasks with submissions can't be deleted, unpublished or reordered (`409 CONTENT_IN_USE`). Editing text and adding content stay allowed.
- Approving/rejecting submissions (which moves progression forward) is the mentor review workflow in Stage 5.

## Learning content (Stage 3)

Hierarchy: Track → Module → Task, each `draft` or `published`, each with a unique position (`order`) among its siblings.

- Admins write; everyone else reads. Learners/mentors only ever see published items beneath published parents (anything else is a 404).
- Everything is created as a draft. Publishing is bottom-up: a task, then a module (needs ≥1 published task), then a track (needs ≥1 published module). A published parent can't lose its last published child (`PARENT_WOULD_BE_EMPTY`).
- Learners get a syllabus (`GET /tracks/:id/modules`: modules with task *summaries*). Full task content (`GET /tasks/:id`) is for admins, mentors (published), and learners who are enrolled and have unlocked the task.
- `order` is optional on create (appends). Rearranging uses `PUT /tracks/:id/modules/order` and `PUT /modules/:id/tasks/order` with the complete id list.
- Destructive changes (delete, unpublish, reorder) call `ensureNoLearnerActivity` (`src/modules/content/content-guard.ts`), which protects content that learners are using.
- `preferredTrack` on a profile must reference a published track.

`GET|POST /tracks`, `GET|PATCH|DELETE /tracks/:trackId`, `GET|POST /tracks/:trackId/modules`, `PUT /tracks/:trackId/modules/order`,
`GET|PATCH|DELETE /modules/:moduleId`, `GET|POST /modules/:moduleId/tasks`, `PUT /modules/:moduleId/tasks/order`, `GET|PATCH|DELETE /tasks/:taskId`.

Task fields: title, problemDescription, learningObjectives[], requirements[], instructions, expectedDeliverables[], submissionGuidelines, allowedSubmissionTypes[] (`github`, `deployed_url`, `written`), estimatedDifficulty (`easy|medium|hard`), order, status. Text may contain Markdown; the API stores it as-is, so the React app must render it safely (no raw HTML).

## Endpoints (Stage 2)

`POST /auth/register|login|refresh|logout|forgot-password|reset-password`, `GET /auth/me`,
`GET|PATCH /users/me`, `PATCH /users/me/password`, admin: `GET /users`, `PATCH /users/:id/status|role`.

## Testing

`npm test` starts an in-memory MongoDB (downloads a mongod binary on first run). To use your own local mongod instead:
`TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test`. Each test file uses its own throwaway database; remote/Atlas URIs are refused.

## Response format

```json
{ "success": true, "data": {}, "meta": {} }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [] } }
```

Tests never read `.env`.
