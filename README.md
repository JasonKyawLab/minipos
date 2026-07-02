# MiniPOS

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen?logo=node.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker)
![License](https://img.shields.io/badge/License-MIT-yellow)

MiniPOS is a multi-tenant web-based Point of Sale system supporting **retail**, **restaurant**, and **online shop** operations.

Built as a learning project and small-scale real-world usage.

## Features

- Multi-shop platform — one account can own multiple shops
- POS terminal mode — PIN-based staff login, order management, payments
- Kitchen Display System (KDS) — real-time ticket queue for kitchen staff
- QR table ordering — customers scan a QR code and order from their phone
- Dashboard — sales summary, top products, peak hours, sales by channel
- Reports — inventory, refunds, shift logs
- Device management — approve/revoke physical terminals
- Role-based access — Owner, Manager, Cashier, Chef, Staff

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | Node.js 20, Express 5, TypeScript |
| Database | PostgreSQL 16 |
| Real-time | Socket.IO |
| Cache / Rate limit | Redis |
| Auth | JWT (access token) + HttpOnly cookies |
| DevOps | Docker, Docker Compose |

## Prerequisites

- **Docker** and **Docker Compose** (recommended)
- Or **Node.js 20+** for running locally without Docker

```bash
docker --version
docker compose version
node -v
```

## Running with Docker (Recommended)

### 1. Clone the repository

```bash
git clone https://github.com/JasonKyawLab/minipos.git
cd minipos
```

### 2. Create the environment file

Create a `.env` file in the project root:

```env
# PostgreSQL
POSTGRES_USER=minipos_user
POSTGRES_PASSWORD=your_strong_password
POSTGRES_DB=minipos
DATABASE_URL=postgresql://minipos_user:your_strong_password@postgres:5432/minipos

# Auth
JWT_SECRET=minimum_32_character_secret_here
JWT_EXPIRES_IN=1d
REFRESH_TOKEN_EXPIRES_IN=7d

# Backend
PORT=3001
NODE_ENV=development

# Redis
REDIS_URL=redis://redis:6379

# Frontend (baked into the Next.js bundle at build time)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Next.js internal proxy target (server-side only)
API_URL=http://minipos-backend:3001
```

### 3. Start development environment

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001 |
| PostgreSQL | localhost:5432 (internal) |

### 4. Start production build

```bash
docker compose up -d --build
```

## Running Locally (Without Docker)

Requires PostgreSQL and Redis running locally.

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

## Project Structure

```
minipos/
├── backend/          # Express API
│   └── src/
│       ├── modules/  # Feature modules (auth, orders, products, ...)
│       ├── middlewares/
│       ├── db/
│       └── utils/
├── frontend/         # Next.js app
│   └── app/
│       ├── (shop)/   # Shop dashboard routes
│       ├── (pos)/    # POS terminal routes
│       ├── (kitchen)/# Kitchen display routes
│       └── (qr)/     # QR ordering routes
├── database/
│   └── init/
│       └── 001_schema.sql  # Full database schema
└── docker/           # Dockerfiles
```

## License

MIT
