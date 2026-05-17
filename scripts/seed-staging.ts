import { db } from "../server/db";
import {
  tenants,
  outlets,
  users,
  menuCategories,
  menuItems,
  tables,
  roleEnum,
} from "../shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "../server/auth";

type UserRoleValue = typeof roleEnum.enumValues[number];

const STAGING_SLUG = "staging-test";

async function main() {
  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, STAGING_SLUG))
    .limit(1);

  if (existing) {
    console.log(
      `Staging tenant "${STAGING_SLUG}" already exists (id=${existing.id}). Nothing to do.`,
    );
    process.exit(0);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Staging Test Restaurant",
      slug: STAGING_SLUG,
    })
    .returning({ id: tenants.id });

  const [outlet] = await db
    .insert(outlets)
    .values({
      tenantId: tenant.id,
      name: "Main Branch",
    })
    .returning({ id: outlets.id });

  const hashedPw = await hashPassword("StagingTest2026!");
  const [owner] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      username: "owner",
      name: "Staging Owner",
      role: "owner" as UserRoleValue,
      password: hashedPw,
    })
    .returning({ id: users.id, username: users.username });

  const [starters, mains] = await db
    .insert(menuCategories)
    .values([
      { tenantId: tenant.id, name: "Starters" },
      { tenantId: tenant.id, name: "Mains" },
    ])
    .returning({ id: menuCategories.id });

  const insertedItems = await db
    .insert(menuItems)
    .values([
      { tenantId: tenant.id, categoryId: starters.id, name: "Spring Rolls", price: "18.00" },
      { tenantId: tenant.id, categoryId: starters.id, name: "Hummus", price: "15.00" },
      { tenantId: tenant.id, categoryId: mains.id, name: "Grilled Chicken", price: "42.00" },
      { tenantId: tenant.id, categoryId: mains.id, name: "Beef Burger", price: "38.00" },
    ])
    .returning({ id: menuItems.id });

  const insertedTables = await db
    .insert(tables)
    .values([
      { tenantId: tenant.id, outletId: outlet.id, number: 1 },
      { tenantId: tenant.id, outletId: outlet.id, number: 2 },
      { tenantId: tenant.id, outletId: outlet.id, number: 3 },
      { tenantId: tenant.id, outletId: outlet.id, number: 4 },
      { tenantId: tenant.id, outletId: outlet.id, number: 5 },
      { tenantId: tenant.id, outletId: outlet.id, number: 6 },
    ])
    .returning({ id: tables.id });

  console.log("Staging seed inserted successfully:");
  console.log(`  Tenant ID:       ${tenant.id}`);
  console.log(`  Outlet ID:       ${outlet.id}`);
  console.log(`  Owner username:  ${owner.username}`);
  console.log(`  Menu categories: 2`);
  console.log(`  Menu items:      ${insertedItems.length}`);
  console.log(`  Tables:          ${insertedTables.length}`);

  process.exit(0);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("Error:", message);
  process.exit(1);
});
