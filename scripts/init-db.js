// Neon 데이터베이스에 테이블을 생성합니다: npm run db:init
require('dotenv').config({ quiet: true });

const db = require('../lib/db');

db.ensureSchema()
  .then(() => {
    console.log('✔ expenses 테이블이 준비되었습니다.');
    return db.getPool().end();
  })
  .catch((err) => {
    console.error('✘ 테이블 생성 실패:', err.message);
    process.exit(1);
  });
