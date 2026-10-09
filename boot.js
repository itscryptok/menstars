// Menstars boot: ensure the men_db database exists (runtime network has
// internal Postgres DNS), apply Prisma migrations, then start the server.
// Build stays DB-free: `npm ci && npx prisma generate`.
const { Client } = require("pg");
const { spawnSync } = require("child_process");

(async () => {
  const adminUrl = process.env.DB_ADMIN_URL;
  if (adminUrl) {
    const admin = new Client({
      connectionString: adminUrl,
      ssl: { rejectUnauthorized: false },
    });
    await admin.connect();
    try {
      const r = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = 'men_db'"
      );
      if (r.rowCount === 0) {
        await admin.query("CREATE DATABASE men_db");
        console.log("boot: created database men_db");
      } else {
        console.log("boot: men_db exists");
      }
    } finally {
      await admin.end();
    }
  } else {
    console.log("boot: DB_ADMIN_URL not set, skipping ensure-db");
  }

  const m = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });
  if (m.status !== 0) {
    console.error("boot: prisma migrate deploy failed");
    process.exit(1);
  }
  console.log("boot: migrations applied, starting server");
  require("./server.js");
})().catch((e) => {
  console.error("boot failed:", e.message);
  process.exit(1);
});
