import type { Request, Response } from "express";
import { sendSuccess } from "../../utils/response.js";
import { getValidated } from "../../middleware/validate.js";
import { toTask, toTaskSummary } from "../content/content.serializer.js";
import * as service from "./task.service.js";
import type { CreateTaskInput, UpdateTaskInput } from "./task.schemas.js";

const admin = (req: Request) => ({ adminId: req.user!.id, ip: req.ip });

export async function list(req: Request, res: Response) {
  const { params } = getValidated<{ params: { moduleId: string } }>(res);
  sendSuccess(res, (await service.listTasks(req.user!, params.moduleId)).map(toTaskSummary));
}

export async function create(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { moduleId: string }; body: CreateTaskInput }>(res);
  sendSuccess(res, { task: toTask(await service.createTask(admin(req), params.moduleId, body)) }, { status: 201 });
}

export async function reorder(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { moduleId: string }; body: { ids: string[] } }>(res);
  sendSuccess(res, (await service.reorderTasks(admin(req), params.moduleId, body.ids)).map(toTaskSummary));
}

export async function get(req: Request, res: Response) {
  const { params } = getValidated<{ params: { taskId: string } }>(res);
  sendSuccess(res, { task: toTask(await service.getTask(req.user!, params.taskId)) });
}

export async function update(req: Request, res: Response) {
  const { params, body } = getValidated<{ params: { taskId: string }; body: UpdateTaskInput }>(res);
  sendSuccess(res, { task: toTask(await service.updateTask(admin(req), params.taskId, body)) });
}

export async function remove(req: Request, res: Response) {
  const { params } = getValidated<{ params: { taskId: string } }>(res);
  await service.deleteTask(admin(req), params.taskId);
  res.status(204).send();
}
