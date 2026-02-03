# MiniPOS

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen?logo=node.js)
![Docker](https://img.shields.io/badge/Docker-Supported-2496ED?logo=docker)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?logo=postgresql)
![License](https://img.shields.io/badge/License-MIT-yellow)

MiniPOS is a web-based Point of Sale (POS) system for **retail and restaurant** use.  
This project is built mainly for **learning and small-scale usage**.

## 🧰 Tech Stack / Languages Used

### Frontend
- JavaScript / TypeScript
- React
- Next.js

### Backend
- JavaScript / TypeScript
- Node.js
- Express
- Socket.IO (real-time updates)

### Database
- PostgreSQL

### DevOps / Tools
- Docker
- Docker Compose
- Git

## 📦 Prerequisites (Before Running)

Make sure you have these installed:

- **Node.js** (v18+ recommended)
- **Docker**
- **Docker Compose**
- **Git**

Check versions:
```bash
node -v
docker -v
docker compose version
```

## ⚙️ Environment Setup

### 1. Clone the repository
```bash
git clone https://github.com/JasonKyawLab/minipos.git
cd minipos
```

### 2. Create environment files

Backend → backend/.env
```.env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@db:5432/minipos
JWT_SECRET=dev_secret
```

Frontend → frontend/.env.local
```.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Do not commit .env files to Git.

## ▶️ Running the Project (Recommended)

### Using Docker
```bash
docker-compose up --build
```
This will start:
- **Frontend** → http://localhost:3000
- **Backend** → http://localhost:4000
- **PostgreSQL** → port 5432

