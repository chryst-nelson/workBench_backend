import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { paginationMeta } from "../../utils/pagination.js";
import { getValidated } from "../../middleware/validate.js";
import { toTrack } from "../content/content.serializer.js";
import * as service from "./track.service.js";
import type { CreateTrackInput, ListTracksQuery, UpdateTrackInput } from "./track.schemas.js";

const admin = (req: Request) => ({ adminId: req.user!.id, ip: req.ip });

export async function list(req: Request, res: Response) {
  const { query } = getValidated<{ query: ListTracksQuery }>(res);
  const { items, total } = await service.listTracks(req.user!, query);
  sendSuccess(res, items.map(toTrack), { meta: paginationMeta(query.page, query.limit, total) });
}

export async function get(req: Request, res: Response) {
  const { params } = getValidated<{ params: { trackId: string } }>(res);
  sendSuccess(res, { track: toTrack(await service.getTrack(req.user!, params.trackId)) });
}

export async function create(req: Request, res: Response) {
  const { body } = getValidated<{ body: CreateTrackInput }>(res);
  sendSuccess(res, { track: toTrack(await service.createTrack(admin(req), body)) }, { status: 201 });
}

export async function update(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { trackId: string }; body: UpdateTrackInput }>(res);
  sendSuccess(res, { track: toTrack(await service.updateTrack(admin(req), params.trackId, body)) });
}

export async function remove(req: Request, res: Response) {
  const { params } = getValidated<{ params: { trackId: string } }>(res);
  await service.deleteTrack(admin(req), params.trackId);
  res.status(204).send();
}
