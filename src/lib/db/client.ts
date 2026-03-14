// ============================================================
// EGAC Platform — D1 Database Client
// src/lib/db/client.ts
//
// Thin, typed wrappers around the D1Database binding.
// Every helper enforces environment isolation automatically.
//
// Design principles:
// - Never expose raw D1Database outside this module
// - All queries that touch env-scoped tables go through
//   envQuery() so the AND environment = ? is never forgotten
// - Typed generics mean callers get proper TypeScript inference
// ============================================================

import type { Env, Environment } from './schema.js';

// ------------------------------------------------------------
// Core accessor
// Returns the D1 binding. Throws clearly if binding is missing
// (catches misconfigured wrangler.toml early in development).
// ------------------------------------------------------------
export function getDB(env: Env): D1Database {
  if (!env.DB) {
    throw new Error('D1 binding "DB" not found. Check wrangler.toml [[d1_databases]] config.');
  }
  return env.DB;
}

export function getEnv(env: Env): Environment {
  return env.APP_ENV ?? 'production';
}

// ------------------------------------------------------------
// Result helpers
// Typed wrappers so callers don't repeat .first() / .all() casts.
// ------------------------------------------------------------

/**
 * Returns a single row or null.
 * Throws if the statement errors.
 */
export async function one<T>(stmt: D1PreparedStatement): Promise<T | null> {
  const result = await stmt.first<T>();
  return result ?? null;
}

/**
 * Returns all matching rows (never null — empty array if none).
 */
export async function many<T>(stmt: D1PreparedStatement): Promise<T[]> {
  const { results } = await stmt.all<T>();
  return results ?? [];
}

/**
 * Executes a write statement (INSERT, UPDATE, DELETE).
 * Returns the D1Result for callers that need meta (changes, last_row_id).
 */
export async function run(stmt: D1PreparedStatement): Promise<D1Result> {
  return stmt.run();
}

// ------------------------------------------------------------
// Environment-aware query builder
// Provides a small fluent API for building env-scoped queries
// without repeating AND environment = ? everywhere.
// ------------------------------------------------------------

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string; // e.g. 'created_at DESC'
}

/**
 * Builds a SELECT with automatic environment scoping.
 *
 * Usage:
 *   const rows = await envQuery(env)
 *     .from('enquiries')
 *     .where('email = ?', email)
 *     .many<Enquiry>();
 */
export function envQuery(env: Env) {
  const db = getDB(env);
  const environment = getEnv(env);

  return {
    from(table: string) {
      return new QueryBuilder(db, table, environment);
    },
  };
}

class QueryBuilder {
  private _table: string;
  private _db: D1Database;
  private _conditions: string[] = [];
  private _params: unknown[] = [];
  private _orderBy: string | null = null;
  private _limit: number | null = null;
  private _offset: number | null = null;
  private _select = '*';

  constructor(db: D1Database, table: string, env: Environment) {
    this._db = db;
    this._table = table;
    // Always scope to environment
    this._conditions.push('environment = ?');
    this._params.push(env);
  }

  select(cols: string): this {
    this._select = cols;
    return this;
  }

  where(condition: string, ...params: unknown[]): this {
    this._conditions.push(condition);
    this._params.push(...params);
    return this;
  }

  orderBy(clause: string): this {
    this._orderBy = clause;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  private build(): D1PreparedStatement {
    let sql = `SELECT ${this._select} FROM ${this._table}`;
    const params = [...this._params];

    if (this._conditions.length > 0) {
      sql += ` WHERE ${this._conditions.join(' AND ')}`;
    }

    if (this._orderBy) sql += ` ORDER BY ${this._orderBy}`;
    if (this._limit !== null) {
      sql += ` LIMIT ?`;
      params.push(this._limit);
    }
    if (this._offset !== null) {
      sql += ` OFFSET ?`;
      params.push(this._offset);
    }

    return this._db.prepare(sql).bind(...params);
  }

  async one<T>(): Promise<T | null> {
    return one<T>(this.build());
  }

  async many<T>(): Promise<T[]> {
    return many<T>(this.build());
  }

  async count(): Promise<number> {
    const original = this._select;
    this._select = 'COUNT(*) as count';
    const result = await one<{ count: number }>(this.build());
    this._select = original;
    return result?.count ?? 0;
  }
}

// ------------------------------------------------------------
// Batch helper
// D1 batch limit is 100 statements. This helper chunks arrays
// safely and runs each batch atomically.
// ------------------------------------------------------------

export async function batchInsert(
  db: D1Database,
  statements: D1PreparedStatement[]
): Promise<void> {
  const BATCH_SIZE = 80; // Stay under D1's 100-statement limit
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    await db.batch(chunk);
  }
}

// ------------------------------------------------------------
// ID generation
// Uses crypto.randomUUID (available in both Workers and Node).
// Keeps IDs short and unambiguous without an external library.
// ------------------------------------------------------------

export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  // Take first 20 chars of the UUID hex for a compact ID
  return `${prefix}_${uuid.slice(0, 20)}`;
}

export function generateToken(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function now(): string {
  return new Date().toISOString();
}
