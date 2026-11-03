# 나의 가계부

Express와 Neon PostgreSQL로 만든 개인 가계부 웹앱입니다. Vercel에 배포할 수 있습니다.

## 기능
- 지출 내역 추가 / 조회 / 수정 / 삭제 (날짜, 항목, 카테고리, 금액)
- 날짜별 검색 (특정 날짜 또는 기간)
- 월별 지출 합계 (연도 선택)
- 카테고리별 지출 합계와 막대그래프 (월 선택)
- 비밀번호 로그인 (`APP_PASSWORD`)

## 폴더 구조
```
api/index.js        Vercel 서버리스 함수 진입점
lib/app.js          Express 앱 (API 라우트)
lib/db.js           Neon(PostgreSQL) 연결, 테이블 자동 생성
lib/auth.js         비밀번호 확인, 서명된 세션 쿠키
public/             프런트엔드 (HTML, CSS, JS)
local-server.js     로컬 실행용 서버
scripts/init-db.js  테이블 생성 스크립트
vercel.json         /api/* 요청을 Express로 연결
```

## 로컬 실행
1. [Neon](https://neon.tech)에서 프로젝트를 만들고 **Connection string**을 복사합니다.
2. `.env.example`을 `.env`로 복사한 뒤 값을 채웁니다.
   ```
   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
   APP_PASSWORD=원하는-비밀번호
   ```
3. 실행합니다.
   ```bash
   npm install
   npm run db:init   # 테이블 생성 (생략해도 첫 요청 때 자동 생성)
   npm start         # http://localhost:3000
   ```
   코드 변경 시 자동 재시작을 원하면 `npm run dev`를 사용하세요.

## Vercel 배포
1. GitHub에 저장소를 만들고 푸시합니다. (`.env`는 `.gitignore`에 들어 있어 올라가지 않습니다.)
   ```bash
   git init
   git add .
   git commit -m "가계부 웹앱"
   git branch -M main
   git remote add origin https://github.com/<계정>/expense-book.git
   git push -u origin main
   ```
2. Vercel에서 **Add New → Project**로 저장소를 가져옵니다. Framework Preset은 **Other**를 그대로 둡니다.
3. **Settings → Environment Variables**에 다음을 추가합니다.
   - `DATABASE_URL`: Neon 연결 문자열
   - `APP_PASSWORD`: 로그인 비밀번호
   - `SESSION_SECRET` (선택): 길고 무작위인 문자열
4. 배포(또는 환경변수 추가 후 Redeploy)하면 됩니다.

## 보안
- DB 접속 정보는 서버 환경변수로만 사용하며, 브라우저로 전달되지 않습니다.
- 서버 오류는 일반 메시지로만 응답하고, 자세한 내용은 서버 로그에만 남깁니다.
- 모든 SQL은 파라미터 바인딩을 사용합니다 (SQL 인젝션 방지).
- 로그인하면 HMAC으로 서명된 `HttpOnly`, `SameSite=Strict` 쿠키(HTTPS에서는 `Secure`)를 발급하며 7일간 유효합니다.
- `APP_PASSWORD`(또는 `SESSION_SECRET`)를 바꾸면 기존 세션은 모두 만료됩니다.

## API
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/login` | `{ password }` 로그인 |
| POST | `/api/logout` | 로그아웃 |
| GET | `/api/expenses?date=&from=&to=&month=` | 목록 및 검색 |
| POST | `/api/expenses` | 추가 `{ date, item, category, amount }` |
| PUT | `/api/expenses/:id` | 수정 |
| DELETE | `/api/expenses/:id` | 삭제 |
| GET | `/api/summary/monthly?year=2026` | 월별 합계 |
| GET | `/api/summary/category?month=2026-11` | 카테고리별 합계 |
