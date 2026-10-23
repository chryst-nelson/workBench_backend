import bcrypt from "bcrypt";
import { env } from "../config/env.js";

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

let dummyHash: string | undefined;
/** Burns the same time as a real check so login timing doesn't reveal unknown emails. */
export async function dummyVerify(plain: string): Promise<void> {
  dummyHash ??= await bcrypt.hash("dummy-password-for-timing", env.BCRYPT_ROUNDS);
  await bcrypt.compare(plain, dummyHash);
}
