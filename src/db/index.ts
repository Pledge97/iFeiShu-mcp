import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Session } from '../feishu/types.js';

/** sql.js 初始化单例，避免重复加载 WASM 模块。 */
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

/**
 * 创建（或加载）SQLite 数据库，返回会话操作接口。
 * - 传入 ':memory:' 时使用内存数据库（测试用）
 * - 传入文件路径时从磁盘加载，每次写操作后自动持久化
 */
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
      open_id       TEXT PRIMARY KEY,
      user_name     TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    )
  `);

  /** 将内存中的数据库序列化写入磁盘（内存模式下跳过）。 */
  function persist() {
    if (dbPath === ':memory:') return;
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
    const data = db.export();
    writeFileSync(dbPath, Buffer.from(data));
  }

  return {
    getSession(openId: string): Session | undefined {
      const stmt = db.prepare('SELECT * FROM sessions WHERE open_id = ?');
      stmt.bind([openId]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as unknown as Session;
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },

    upsertSession(session: Session): void {
      // 单用户模式：清空旧记录，确保 DB 中永远只有一条
      db.run('DELETE FROM sessions WHERE open_id != ?', [session.open_id]);
      db.run(
        `INSERT INTO sessions (open_id, user_name, access_token, refresh_token, expires_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(open_id) DO UPDATE SET
           user_name     = excluded.user_name,
           access_token  = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at    = excluded.expires_at,
           updated_at    = excluded.updated_at`,
        [
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

    listSessions(): Session[] {
      const stmt = db.prepare('SELECT * FROM sessions');
      const rows: Session[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as unknown as Session);
      }
      stmt.free();
      return rows;
    },

    deleteSession(openId: string): void {
      db.run('DELETE FROM sessions WHERE open_id = ?', [openId]);
      persist();
    },

    close(): void {
      db.close();
    },
  };
}

export type Db = Awaited<ReturnType<typeof createDb>>;
