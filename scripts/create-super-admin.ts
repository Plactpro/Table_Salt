import { db } from "../server/db";
import { users, tenants } from "../shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../server/auth";
import { createInterface } from "readline/promises";

const PLATFORM_SLUG = "platform";

async function main() {
  const existing = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.role as any, "super_admin"))
    .limit(1);

  if (existing.length > 0) {
    console.log("A super admin already exists. Use the /api/admin/setup endpoint or log in.");
    process.exit(0);
  }

  const [pt] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, PLATFORM_SLUG));
  if (!pt) {
    console.error("Platform tenant not found. Ensure the database is seeded correctly.");
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const username = await rl.question("Super admin username: ");
  const name = await rl.question("Super admin full name: ");
  const password = await rl.question("Super admin password (min 8 chars): ");
  rl.close();

  if (!username || !name || !password) {
    console.error("All fields are required.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existingUser.length > 0) {
    console.error("Username already taken.");
    process.exit(1);
  }

  const hashedPw = await hashPassword(password);
  const [newAdmin] = await db.insert(users).values({
    tenantId: pt.id,
    username,
    password: hashedPw,
    name,
    role: "super_admin" as any,
    active: true,
  }).returning({ id: users.id, username: users.username, name: users.name });

  console.log(`\nSuper admin created successfully!`);
  console.log(`  Username: ${newAdmin.username}`);
  console.log(`  Name:     ${newAdmin.name}`);
  console.log(`\nLogin at /login — you will be redirected to /admin automatically.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
