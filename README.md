# MiniPOS

> A full-stack, multi-tenant Point of Sale system for restaurants, retail shops, and online stores.

🔗 **Live demo:** [minipos.site](https://minipos.site)

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen?logo=node.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)

---

## What is MiniPOS?

MiniPOS is a web-based POS platform where one account can manage multiple shops. Each shop gets a POS terminal, kitchen display, QR table ordering, reports, and staff management — all from the browser, no app install needed.

---

## Features

| Feature | Description |
|---|---|
| **POS Terminal** | PIN-based staff login, fast checkout, multiple payment methods |
| **Kitchen Display (KDS)** | Real-time order tickets pushed to kitchen screens via WebSocket |
| **QR Table Ordering** | Customers scan a table QR code and order from their phone |
| **Multi-shop Dashboard** | Sales summary, top products, peak hours, revenue by channel |
| **Reports & Shifts** | Shift logs, refunds, inventory, daily summaries |
| **Device Management** | Approve or revoke physical POS terminals |
| **Role-based Access** | Owner · Manager · Cashier · Chef |

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | Node.js 20, Express 5, TypeScript |
| Database | PostgreSQL 16 |
| Real-time | Socket.IO |
| Auth | JWT + HttpOnly cookies |
| Email | Resend |
| Infrastructure | Docker, Docker Compose, Nginx, Cloudflare |
| CI/CD | GitHub Actions → Oracle Cloud (auto-deploy on push) |

---

## Screenshots

> Coming soon

---

## Running Locally

### With Docker (recommended)

```bash
git clone https://github.com/JasonKyawLab/minipos.git
cd minipos
cp .env.example .env   # fill in your values
docker compose up -d --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |

### Without Docker

```bash
# Backend
cd backend && npm install && npm run dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

Requires PostgreSQL running locally and a `.env` file configured.

---

## Project Structure

```
minipos/
├── backend/            # Express API
│   └── src/
│       ├── modules/    # auth, orders, products, shifts, reports ...
│       ├── middlewares/
│       └── db/
├── frontend/           # Next.js App Router
│   └── app/
│       ├── (landing)/  # Public landing page
│       ├── (platform)/ # Owner/manager dashboard
│       ├── (shop)/     # Per-shop management
│       ├── (pos)/      # POS terminal
│       ├── (kitchen)/  # Kitchen display
│       └── (qr)/       # QR table ordering
└── database/
    └── init/           # SQL schema
```

---

## License

**© 2026 Kyaw Zaw Linn. All rights reserved.**

This source code is made available for viewing and portfolio purposes only. No part of this code may be used, copied, modified, or deployed without explicit written permission from the author.

Contact: kyawzawlinn.dev@gmail.com
