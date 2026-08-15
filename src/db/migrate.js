import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const pool = getPool();
  let sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  sql = sql.replace(/^\uFEFF/, "");
  try {
    await pool.query(sql);
    console.log("Schema applied to CockroachDB successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}
migrate();
