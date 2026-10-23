import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { getValidated } from "../../middleware/validate.js";
import { toModule, toTaskSummary } from "../content/content.serializer.js";
import * as service from "./module.service.js";
import type { CreateModuleInput, UpdateModuleInput } from "./module.schemas.js";

const admin = (req: Request) => ({ adminId: req.user!.id, ip: req.ip });

export async function syllabus(req: Request, res: Response) {
  const { params } = getValidated<{ params: { trackId: string } }>(res);
  const items = await service.getSyllabus(req.user!, params.trackId);
  sendSuccess(res, items.map((i) => ({ ...toModule(i.module), tasks: i.tasks.map(toTaskSummary) })));
}

export async function create(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { trackId: string }; body: CreateModuleInput }>(res);
  const mod = await service.createModule(admin(req), params.trackId, body);
  sendSuccess(res, { module: toModule(mod) }, { status: 201 });
}

export async function reorder(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { trackId: string }; body: { ids: string[] } }>(res);
  const mods = await service.reorderModules(admin(req), params.trackId, body.ids);
  sendSuccess(res, mods.map(toModule));
}

export async function get(req: Request, res: Response) {
  const { params } = getValidated<{ params: { moduleId: string } }>(res);
  sendSuccess(res, { module: toModule(await service.getModule(req.user!, params.moduleId)) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { moduleId: string }; body: UpdateModuleInput }>(res);
  sendSuccess(res, { module: toModule(await service.updateModule(admin(req), params.moduleId, body)) });
}

export async function remove(req: Request, res: Response) {
  const { params } = getValidated<{ params: { moduleId: string } }>(res);
  await service.deleteModule(admin(req), params.moduleId);
  res.status(204).send();
}
