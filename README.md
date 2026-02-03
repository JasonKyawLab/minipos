# MiniPOS

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


##  Environment Setup

1. Clone the repository
```bash
git clone https://github.com/JasonKyawLab/minipos.git
cd minipos
```


2. Create environment files

Backend → backend/.env
```.env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@db:5432/minipos
JWT_SECRET=dev_secret
```