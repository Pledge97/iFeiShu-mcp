import { describe, it, expect, beforeEach } from 'vitest';
import { createDb } from '../src/db/index.js';

describe('db', () => {
  let db: Awaited<ReturnType<typeof createDb>>;

  beforeEach(async () => {
    db = await createDb(':memory:');
  });

  it('upserts and retrieves a session', () => {
    db.upsertSession({
      open_id: 'ou_abc',
      user_name: 'Alice',
      access_token: 'at_123',
      refresh_token: 'rt_456',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });
    const session = db.getSession('ou_abc');
    expect(session?.open_id).toBe('ou_abc');
    expect(session?.user_name).toBe('Alice');
  });

  it('returns undefined for unknown session', () => {
    expect(db.getSession('not-exist')).toBeUndefined();
  });

  it('deletes a session', () => {
    db.upsertSession({
      open_id: 'ou_xyz',
      user_name: 'Bob',
      access_token: 'at_789',
      refresh_token: 'rt_000',
      expires_at: 9999999999,
      updated_at: Math.floor(Date.now() / 1000),
    });
    db.deleteSession('ou_xyz');
    expect(db.getSession('ou_xyz')).toBeUndefined();
  });

  it('updates existing session on upsert', () => {
    const base = {
      open_id: 'ou_upd',
      user_name: 'Carol',
      access_token: 'at_old',
      refresh_token: 'rt_old',
      expires_at: 1000,
      updated_at: 1000,
    };
    db.upsertSession(base);
    db.upsertSession({ ...base, access_token: 'at_new', expires_at: 9999999999 });
    expect(db.getSession('ou_upd')?.access_token).toBe('at_new');
  });
});
