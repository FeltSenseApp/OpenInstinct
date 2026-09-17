import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost")
    ? undefined
    : { rejectUnauthorized: false }
});

try {
  const sql = await readFile(
    new URL("../migrations/0001_headlong.sql", import.meta.url),
    "utf8"
  );
  await pool.query(sql);
} finally {
  await pool.end();
}
