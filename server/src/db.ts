import pg from 'pg';
import { config } from './config.js';
import { SCHEMA_SQL } from './schema.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, values as never[]);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  const statements = SCHEMA_SQL.split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      const preview = statement.split('\n').slice(0, 3).join(' ').slice(0, 160);
      console.error(`[db] migration failed on: ${preview}`);
      throw error;
    }
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export type Db = typeof pool;
