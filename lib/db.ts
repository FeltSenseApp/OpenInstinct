import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForPool = globalThis as typeof globalThis & {
  headlongPool?: Pool;
};

export function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required.");
  return value;
}

export function pool() {
  if (!globalForPool.headlongPool) {
    const connectionString = databaseUrl();
    globalForPool.headlongPool = new Pool({
      connectionString,
      max: 8,
      ssl: connectionString.includes("localhost")
        ? undefined
        : { rejectUnauthorized: false }
    });
  }
  return globalForPool.headlongPool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = []
) {
  return pool().query<T>(text, [...values]);
}

export async function transaction<T>(
  execute: (client: PoolClient) => Promise<T>
) {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const result = await execute(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
