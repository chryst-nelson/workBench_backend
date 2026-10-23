import type { UserDocument } from "../modules/users/user.model.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
    }
  }
}

export {};
