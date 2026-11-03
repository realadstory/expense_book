const { Pool } = require('pg');

let pool;
let schemaReady;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  }
  if (!pool) {
    // SSL은 아래 ssl 옵션으로 직접 지정하므로 URL의 sslmode 등은 제거
    const url = new URL(process.env.DATABASE_URL);
    for (const key of ['sslmode', 'channel_binding', 'uselibpqcompat']) url.searchParams.delete(key);
    pool = new Pool({
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true },
      // 서버리스 환경에서는 연결 수를 작게 유지
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }
  return pool;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS expenses (
    id       BIGSERIAL PRIMARY KEY,
    "date"   DATE    NOT NULL,
    item     TEXT    NOT NULL,
    category TEXT    NOT NULL,
    amount   INTEGER NOT NULL CHECK (amount >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses ("date");
`;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA_SQL)
      .catch((err) => {
        schemaReady = undefined; // 다음 요청에서 다시 시도
        throw err;
      });
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

module.exports = { query, ensureSchema, getPool };
