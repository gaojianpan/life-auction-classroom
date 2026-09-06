
const { Pool } = require("pg");

const isProd = process.env.NODE_ENV === "production";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Missing DATABASE_URL. Use docker compose for local development or configure PostgreSQL in deployment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: isProd ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(6) UNIQUE NOT NULL,
      title VARCHAR(80) NOT NULL,
      teacher_pin_hash TEXT NOT NULL,
      state JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_classrooms_created_at ON classrooms(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms(code);
  `);
}

module.exports = { pool, initDb };