// 로컬 개발 서버: .env 파일을 읽어 환경변수를 설정한 뒤 실행
require('dotenv').config({ quiet: true });

const app = require('./lib/app');

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.DATABASE_URL) console.warn('⚠ DATABASE_URL이 설정되지 않았습니다. .env 파일을 확인하세요.');
if (!process.env.APP_PASSWORD) console.warn('⚠ APP_PASSWORD가 설정되지 않았습니다. .env 파일을 확인하세요.');

app.listen(PORT, () => {
  console.log(`가계부 서버 실행 중: http://localhost:${PORT}`);
});
