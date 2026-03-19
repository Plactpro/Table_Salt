import { db } from "../server/db";
import { users, tenants, roleEnum } from "../shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../server/auth";

type UserRoleValue = typeof roleEnum.enumValues[number];

const PLATFORM_SLUG = "platform";

async function main() {
  const username = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] ?? "Platform Super Admin";

  if (!username || !password) {
    console.error("Usage: npx tsx scripts/create-super-admin.ts <username> <password> [display name]");
    console.error("Example: npx tsx scripts/create-super-admin.ts superadmin MySecret123 'John Admin'");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    console.error("Username must be lowercase alphanumeric with underscores only.");
    process.exit(1);
  }

  const existing = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.role, "super_admin" as UserRoleValue))
    .limit(1);

  if (existing.length > 0) {
    console.log("A super admin already exists. Use the /api/platform/setup endpoint or log in.");
    process.exit(0);
  }

  const [pt] = await db.select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, PLATFORM_SLUG));
  if (!pt) {
    console.error("Platform tenant not found. Start the app once to run startup migrations.");
    process.exit(1);
  }

  const [existingUser] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existingUser) {
    console.error("Username already taken.");
    process.exit(1);
  }

  const hashedPw = await hashPassword(password);
  const [newAdmin] = await db.insert(users).values({
    tenantId: pt.id,
    username,
    password: hashedPw,
    name,
    role: "super_admin" as UserRoleValue,
    active: true,
  }).returning({ id: users.id, username: users.username, name: users.name });

  console.log("Super admin created successfully!");
  console.log(`  Username: ${newAdmin.username}`);
  console.log(`  Name:     ${newAdmin.name}`);
  console.log(`\nLogin at /login — you will be redirected to /admin automatically.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Error:", message);
  process.exit(1);
});
