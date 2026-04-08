import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Session } from '../feishu/types.js';

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export async function createDb(dbPath: string) {
  const sql = await getSql();

  let db: Database;
  if (dbPath !== ':memory:' && existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath);
    db = new sql.Database(fileBuffer);
  } else {
    db = new sql.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id    TEXT PRIMARY KEY,
      open_id       TEXT NOT NULL,
      user_name     TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  function persist() {
    if (dbPath === ':memory:') return;
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
  }

  return {
    getSession(sessionId: string): Session | undefined {
      const stmt = db.prepare('SELECT * FROM sessions WHERE session_id = ?');
      stmt.bind([sessionId]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as unknown as Session;
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },

    upsertSession(session: Session): void {
      db.run(
        `INSERT INTO sessions (session_id, open_id, user_name, access_token, refresh_token, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           open_id       = excluded.open_id,
           user_name     = excluded.user_name,
           access_token  = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at    = excluded.expires_at,
           updated_at    = excluded.updated_at`,
        [
          session.session_id,
          session.open_id,
          session.user_name,
          session.access_token,
          session.refresh_token,
          session.expires_at,
          session.updated_at,
        ]
      );
      persist();
    },

    deleteSession(sessionId: string): void {
      db.run('DELETE FROM sessions WHERE session_id = ?', [sessionId]);
      persist();
    },

    close(): void {
      db.close();
    },
  };
}

export type Db = Awaited<ReturnType<typeof createDb>>;
