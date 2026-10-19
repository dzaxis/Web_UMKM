# Development Guide

## Prasyarat
- Node.js 24+, npm
- Python 3.x + pip
- MySQL (Laragon) port 3306
- Git

## Struktur
```
apps/frontend   Next.js 16 (App Router)
apps/backend    NestJS 12 + Prisma 7 + vitest
services/ml     FastAPI + training/inference
storage/        uploads & reports (di luar public)
docs/           dokumentasi
```

## Environment
Buat `.env` di `apps/backend` (lihat `.env.example`): `DATABASE_URL`, `JWT_SECRET`, `PORT`, `ML_SERVICE_URL`, `CORS_ORIGINS`.
Untuk test, `apps/backend/test/utils/test-env.ts` menimpa env ke `bisnis_insight_test`.

## Menjalankan
```bash
# backend
cd apps/backend
npm install
npx prisma migrate dev
npm run start:dev        # http://localhost:3000/api/v1

# frontend
cd apps/frontend
npm install
npm run dev              # http://localhost:3001

# ML service (venv disarankan; butuh pyarrow untuk artefak joblib)
cd services/ml
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Training ulang model
```bash
python services/ml/training/train_all.py
# atau
curl -X POST http://localhost:8000/train
```
Artefak ada di `services/ml/artifacts/` dan di-gitignore.

## MCP server (stdio)
```bash
cd apps/backend
npm run build
npm run mcp
```
Konfigurasi MCP client mengarah ke command tersebut. Setiap tool butuh `accessToken` (JWT) + `storeId`; akses divalidasi ke `store_members`.

## Testing
```bash
cd apps/backend
npm run test          # unit  (vitest)
npm run test:e2e      # e2e   (butuh MySQL test + migration + ML service jalan)
npm run build         # tsc

cd apps/frontend
npm run build
npm run test
```

Pytest ML:
```bash
cd services/ml
pytest
```

## Migrasi test DB
```bash
cd apps/backend
# PowerShell
$env:DATABASE_URL="mysql://root@127.0.0.1:3306/bisnis_insight_test"; npx prisma migrate deploy
```

## Catatan
- Jangan commit `.env`, artefak model besar, atau data sensitif.
- Tanpa Docker/Redis. Cache in-memory sebagai fallback.
- Data tenant selalu lewat NestJS; frontend tidak akses MySQL dan ML tidak menulis tabel operasional.
