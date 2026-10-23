/**
 * Creates (or promotes) the first admin account.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' [ADMIN_NAME='...'] npm run seed:admin
 */
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { User } from "../modules/users/user.model.js";
import { emailField, fullNameField, passwordField } from "../modules/users/user.schemas.js";
import { hashPassword } from "../utils/password.js";

async function main() {
  const email = emailField.parse(process.env.ADMIN_EMAIL);
  const password = passwordField.parse(process.env.ADMIN_PASSWORD);
  const fullName = fullNameField.parse(process.env.ADMIN_NAME ?? "Platform Admin");

  await connectDatabase();
  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = "admin";
    existing.status = "active";
    await existing.save();
    console.log(`Promoted existing user ${email} to admin (password unchanged).`);
  } else {
    await User.create({ fullName, email, passwordHash: await hashPassword(password), role: "admin" });
    console.log(`Created admin ${email}.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
