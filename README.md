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

<img width="1728" height="1117" alt="kitchen_mode" src="https://github.com/user-attachments/assets/45e06179-a311-4c90-821a-eaed71f422fa" />
<img width="1728" height="1117" alt="pos_mode" src="https://github.com/user-attachments/assets/3530f71c-138e-4d19-b29e-534f93b41e5d" />
<img width="1728" height="1117" alt="dashboard" src="https://github.com/user-attachments/assets/4c1e5d6b-1fd1-487d-99d3-eee85ae6d65b" />
<img width="694" height="1064" alt="order" src="https://github.com/user-attachments/assets/4d425697-dfc1-4423-b5b3-aa8f87887d30" />


---

## License

**© 2026 Kyaw Zaw Linn. All rights reserved.**

This source code is made available for viewing and portfolio purposes only. No part of this code may be used, copied, modified, or deployed without explicit written permission from the author.

Contact: kyawzawlinn.dev@gmail.com
