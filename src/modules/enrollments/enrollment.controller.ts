import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { paginationMeta } from "../../utils/pagination.js";
import { getValidated } from "../../middleware/validate.js";
import { toTrack } from "../content/content.serializer.js";
import type { AdminListEnrollmentsQuery } from "./enrollment.schemas.js";
import * as service from "./enrollment.service.js";
import { toEnrollment, toEnrollmentWithTrack, toEnrollmentListItem, toProgressTask } from "./enrollment.serializer.js";

export async function enroll(req: Request, res: Response) {
  const { body } = getValidated<{ body: { trackId: string } }>(res);
  const enrollment = await service.enroll(req.user!, body.trackId);
  sendSuccess(res, { enrollment: toEnrollment(enrollment) }, { status: 201 });
}

export async function listMine(req: Request, res: Response) {
  const { query } = getValidated<{ query: { page: number; limit: number } }>(res);
  const { items, total } = await service.listMine(req.user!.id, query.page, query.limit);
  sendSuccess(
    res,
    items.map((i) => toEnrollmentWithTrack(i.enrollment, i.track)),
    { meta: paginationMeta(query.page, query.limit, total) }
  );
}

export async function progress(req: Request, res: Response) {
  const { params } = getValidated<{ params: { enrollmentId: string } }>(res);
  const p = await service.getProgress(req.user!, params.enrollmentId);
  sendSuccess(res, {
    enrollment: toEnrollment(p.enrollment),
    track: toTrack(p.track),
    summary: p.summary,
    tasks: p.tasks.map(toProgressTask),
  });
}

export async function adminList(_req: Request, res: Response) {
  const { query } = getValidated<{ query: AdminListEnrollmentsQuery }>(res);
  const { items, total } = await service.listEnrollments(
    { trackId: query.trackId, mentorId: query.mentorId, status: query.status, unassigned: query.unassigned === "true" },
    query.page,
    query.limit
  );
  sendSuccess(res, items.map(toEnrollmentListItem), { meta: paginationMeta(query.page, query.limit, total) });
}

export async function assigned(req: Request, res: Response) {
  const { query } = getValidated<{ query: { page: number; limit: number } }>(res);
  const { items, total } = await service.listEnrollments({ mentorId: req.user!.id }, query.page, query.limit);
  sendSuccess(res, items.map(toEnrollmentListItem), { meta: paginationMeta(query.page, query.limit, total) });
}

export async function assignMentor(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { enrollmentId: string }; body: { mentorId: string | null } }>(res);
  const enrollment = await service.assignMentor({ adminId: req.user!.id, ip: req.ip }, params.enrollmentId, body.mentorId);
  sendSuccess(res, { enrollment: toEnrollment(enrollment) });
}
