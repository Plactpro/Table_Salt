import { runAdminMigrations } from "../server/admin-migrations";

runAdminMigrations()
  .then(() => {
    console.log("[Migrations] All migrations completed successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Migrations] Migration failed:", err);
    process.exit(1);
  });
