import 'server-only';

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });

  pool.on('error', () => {
    // Driver errors can contain connection details. Keep this log value-free.
    console.error('[DB] 유휴 연결에서 오류가 발생했습니다.');
  });

  return drizzle({ client: pool });
}

type Database = ReturnType<typeof createDatabase>;

const globalForDb = globalThis as typeof globalThis & {
  champspartyDb?: Database;
};

let database: Database | undefined;

export function getDb() {
  const cached =
    process.env.NODE_ENV === 'development'
      ? globalForDb.champspartyDb
      : database;

  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString?.trim()) {
    throw new Error('DATABASE_URL 환경변수가 필요합니다.');
  }

  const db = createDatabase(connectionString);
  if (process.env.NODE_ENV === 'development') {
    globalForDb.champspartyDb = db;
  } else {
    database = db;
  }

  return db;
}

// Used by standalone commands when their DB work has finished.
export async function closeDb() {
  const db =
    process.env.NODE_ENV === 'development'
      ? globalForDb.champspartyDb
      : database;

  if (!db) return;

  delete globalForDb.champspartyDb;
  database = undefined;
  await db.$client.end();
}
