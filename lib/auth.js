const crypto = require('crypto');

const COOKIE_NAME = 'eb_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

// 세션 서명 키: SESSION_SECRET이 있으면 사용하고, 없으면 APP_PASSWORD에서 파생
function signingKey() {
  const base = process.env.SESSION_SECRET || process.env.APP_PASSWORD || '';
  return crypto.createHash('sha256').update(`expense-book:${base}`).digest();
}

function sign(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createToken() {
  const expires = String(Date.now() + SESSION_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig) return false;
  if (!safeEqual(sig, sign(expires))) return false;
  return Number(expires) > Date.now();
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function cookieOptions(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; ');
}

function setSessionCookie(req, res) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createToken()}; Max-Age=${maxAge}; ${cookieOptions(req)}`);
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; ${cookieOptions(req)}`);
}

function isAuthenticated(req) {
  return verifyToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function checkPassword(input) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(input || '', expected);
}

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

module.exports = {
  checkPassword,
  isAuthenticated,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
};
