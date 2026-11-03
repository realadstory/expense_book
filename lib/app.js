const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');

const CATEGORIES = ['식비', '교통', '주거', '통신', '쇼핑', '의료', '문화/여가', '교육', '경조사', '기타'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const YEAR_RE = /^\d{4}$/;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
  );
  next();
});

app.use(express.json({ limit: '10kb' }));

// 로컬 실행용 정적 파일 (Vercel에서는 public/ 폴더를 CDN이 직접 제공)
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ---------- 유틸 ---------- */

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validateExpense(body = {}) {
  const errors = [];
  const date = body.date;
  const item = typeof body.item === 'string' ? body.item.trim() : '';
  const category = body.category;
  const amount = Number(body.amount);

  if (!isValidDate(date)) errors.push('날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).');
  if (!item) errors.push('항목을 입력해 주세요.');
  if (item.length > 100) errors.push('항목은 100자 이하로 입력해 주세요.');
  if (!CATEGORIES.includes(category)) errors.push('카테고리를 선택해 주세요.');
  if (!Number.isInteger(amount) || amount < 0 || amount > 2_000_000_000) {
    errors.push('금액은 0 이상의 정수로 입력해 주세요.');
  }
  return { errors, value: { date, item, category, amount } };
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// 비동기 라우트 에러를 공통 핸들러로 전달
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const SELECT_COLUMNS = `id::int AS id, to_char("date", 'YYYY-MM-DD') AS date, item, category, amount`;

/* ---------- 인증 ---------- */

app.post('/api/login', wrap(async (req, res) => {
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: '서버에 APP_PASSWORD가 설정되지 않았습니다.' });
  }
  const password = req.body && req.body.password;
  if (!auth.checkPassword(password)) {
    // 무차별 대입을 늦추기 위한 지연
    await new Promise((r) => setTimeout(r, 800));
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  auth.setSessionCookie(req, res);
  res.json({ ok: true });
}));

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ authenticated: auth.isAuthenticated(req) });
});

/* ---------- 이하 인증 필요 ---------- */

app.use('/api', auth.requireAuth);

app.get('/api/categories', (req, res) => {
  res.json(CATEGORIES);
});

// 목록 조회 + 날짜 검색
//   ?date=YYYY-MM-DD           특정 날짜
//   ?from=YYYY-MM-DD&to=...    기간
//   ?month=YYYY-MM             특정 월
app.get('/api/expenses', wrap(async (req, res) => {
  const { date, from, to, month } = req.query;
  const where = [];
  const params = [];

  if (date) {
    if (!isValidDate(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
    params.push(date);
    where.push(`"date" = $${params.length}`);
  }
  if (from) {
    if (!isValidDate(from)) return res.status(400).json({ error: '시작일 형식이 올바르지 않습니다.' });
    params.push(from);
    where.push(`"date" >= $${params.length}`);
  }
  if (to) {
    if (!isValidDate(to)) return res.status(400).json({ error: '종료일 형식이 올바르지 않습니다.' });
    params.push(to);
    where.push(`"date" <= $${params.length}`);
  }
  if (month) {
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다.' });
    params.push(`${month}-01`);
    where.push(`"date" >= $${params.length}::date AND "date" < ($${params.length}::date + INTERVAL '1 month')`);
  }

  const sql = `SELECT ${SELECT_COLUMNS} FROM expenses
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY "date" DESC, id DESC
               LIMIT 1000`;
  const { rows } = await db.query(sql, params);
  res.json(rows);
}));

app.post('/api/expenses', wrap(async (req, res) => {
  const { errors, value } = validateExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const { rows } = await db.query(
    `INSERT INTO expenses ("date", item, category, amount)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SELECT_COLUMNS}`,
    [value.date, value.item, value.category, value.amount]
  );
  res.status(201).json(rows[0]);
}));

app.put('/api/expenses/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const { errors, value } = validateExpense(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const { rows } = await db.query(
    `UPDATE expenses
        SET "date" = $1, item = $2, category = $3, amount = $4
      WHERE id = $5
      RETURNING ${SELECT_COLUMNS}`,
    [value.date, value.item, value.category, value.amount, id]
  );
  if (!rows.length) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.json(rows[0]);
}));

app.delete('/api/expenses/:id', wrap(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: '잘못된 ID입니다.' });
  const { rowCount } = await db.query('DELETE FROM expenses WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ error: '내역을 찾을 수 없습니다.' });
  res.status(204).end();
}));

// 월별 합계: ?year=YYYY (생략 시 올해)
app.get('/api/summary/monthly', wrap(async (req, res) => {
  const year = req.query.year || String(new Date().getFullYear());
  if (!YEAR_RE.test(year)) return res.status(400).json({ error: '연도 형식이 올바르지 않습니다.' });

  const { rows } = await db.query(
    `SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
            SUM(amount)::bigint AS total,
            COUNT(*)::int AS count
       FROM expenses
      WHERE EXTRACT(YEAR FROM "date") = $1
      GROUP BY 1
      ORDER BY 1`,
    [Number(year)]
  );
  // 1~12월을 모두 채워서 반환
  const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const r = byMonth[key];
    return { month: key, total: r ? Number(r.total) : 0, count: r ? r.count : 0 };
  });
  res.json({ year: Number(year), total: months.reduce((s, m) => s + m.total, 0), months });
}));

// 카테고리별 합계: ?month=YYYY-MM (생략 시 전체 기간)
app.get('/api/summary/category', wrap(async (req, res) => {
  const { month } = req.query;
  const params = [];
  let where = '';
  if (month) {
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: '월 형식이 올바르지 않습니다.' });
    params.push(`${month}-01`);
    where = `WHERE "date" >= $1::date AND "date" < ($1::date + INTERVAL '1 month')`;
  }
  const { rows } = await db.query(
    `SELECT category, SUM(amount)::bigint AS total, COUNT(*)::int AS count
       FROM expenses ${where}
      GROUP BY category
      ORDER BY total DESC`,
    params
  );
  const categories = rows.map((r) => ({ category: r.category, total: Number(r.total), count: r.count }));
  res.json({ month: month || null, total: categories.reduce((s, c) => s + c.total, 0), categories });
}));

app.use('/api', (req, res) => {
  res.status(404).json({ error: '존재하지 않는 API입니다.' });
});

// 공통 에러 핸들러: DB 접속 정보 등 내부 정보는 응답에 포함하지 않음
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 형식이 올바르지 않습니다.' });
  }
  res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
});

module.exports = app;
