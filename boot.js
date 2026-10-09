// Menstars boot: ensure the men_db database exists (runtime network has
// internal Postgres DNS), apply Prisma migrations, then start the server.
// Never exits on DB failure: the server always starts so /api/boot-status
// can report what happened (temporary diagnostic, messages only, no secrets).
const { Client } = require("pg");
const { spawnSync } = require("child_process");

function redact(s) {
  return String(s || "").replace(/:\/\/[^:\s/]+:[^@\s/]+@/g, "://***@");
}

const bootState = { steps: [], dbOk: false };

async function step(name, fn) {
  const rec = { name, ok: false, error: null };
  try {
    await fn();
    rec.ok = true;
  } catch (e) {
    rec.error = redact(e.message).slice(0, 500);
  }
  bootState.steps.push(rec);
  return rec.ok;
}

(async () => {
  const adminUrl = process.env.DB_ADMIN_URL;
  if (adminUrl) {
    await step("ensure-db", async () => {
      const admin = new Client({
        connectionString: adminUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 20000,
        query_timeout: 30000,
      });
      const withTimeout = (p, ms, what) =>
        Promise.race([
          p,
          new Promise((_, rej) =>
            setTimeout(() => rej(new Error(what + " timed out")), ms)
          ),
        ]);
      await withTimeout(admin.connect(), 25000, "pg connect");
      try {
        const r = await withTimeout(
          admin.query("SELECT 1 FROM pg_database WHERE datname = 'men_db'"),
          30000,
          "db check"
        );
        if (r.rowCount === 0) {
          await withTimeout(admin.query("CREATE DATABASE men_db"), 60000, "create db");
        }
      } finally {
        await admin.end().catch(() => {});
      }
    });
  } else {
    bootState.steps.push({ name: "ensure-db", ok: false, error: "DB_ADMIN_URL not set, skipped" });
  }

  await step("migrate", async () => {
    const m = spawnSync("npx", ["prisma", "migrate", "deploy"], {
      encoding: "utf8",
      env: process.env,
      timeout: 120000,
    });
    if (m.error) throw new Error("spawn: " + m.error.message);
    if (m.status !== 0) {
      throw new Error(
        "exit " + m.status + ": " + (m.stderr || m.stdout || "").slice(-400)
      );
    }
  });

  bootState.dbOk = bootState.steps.every((s) => s.ok);
  global.__menBoot = bootState;
  console.log("boot state:", JSON.stringify(bootState.steps.map((s) => ({ name: s.name, ok: s.ok }))));
  require("./server.js");
})().catch((e) => {
  console.error("boot fatal:", redact(e.message));
  global.__menBoot = bootState;
  try {
    require("./server.js");
  } catch (e2) {
    console.error("server start failed:", redact(e2.message));
    process.exit(1);
  }
});
