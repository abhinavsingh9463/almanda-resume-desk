// Thin Postgres client wrapper. Works with Vercel Postgres (Neon) — set
// POSTGRES_URL in your Vercel project's Environment Variables (Vercel adds
// this automatically when you attach a Postgres store from the Storage tab).
//
// Uses the `pg` package directly rather than `@vercel/postgres` so this
// also works against any plain Postgres connection string if you switch
// providers later.

import { Pool } from "pg";

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "POSTGRES_URL is not set. Add a Postgres store to this project in the Vercel dashboard (Storage tab), or set POSTGRES_URL in Environment Variables."
      );
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = getPool();
  return client.query(text, params);
}
