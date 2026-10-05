# Flash Sale Concurrency & Overselling Prevention System

> Full-stack high-concurrency prototype built with **NestJS**, **PostgreSQL**, **Redis**, **Docker**, and **React + Vite** to demonstrate inventory reservation under **10,000 concurrent requests**, live TTL expiry countdowns, state machine transitions, idempotency deduplication, and zero-overselling guarantees.

---

## 📁 Repository Structure

```
├── ARCHITECTURE.md                 # System architecture, state machine & concurrency proof
├── docker-compose.yml              # Root Docker Compose for PostgreSQL 16 & Redis 7
│
├── backend/                        # NestJS High-Concurrency API
│   ├── src/
│   │   ├── redis/
│   │   │   └── lua/                # Atomic Lua scripts (reserve, confirm, sweep)
│   │   ├── database/               # PostgreSQL pool & auto-migrations
│   │   └── inventory/              # Reservation logic & background lease sweeper
│   ├── scripts/
│   │   └── load-test.ts            # 10,000 concurrent requests load-testing engine
│   └── package.json
│
└── frontend/                       # Interactive React + Vite Dashboard
    ├── src/
    │   ├── components/
    │   │   ├── Header.tsx          # Real-time health monitor & reset trigger
    │   │   ├── InventoryGauge.tsx  # Live stock counters & invariant proof
    │   │   ├── ReservationSandbox.tsx # Interactive purchase, TTL timer & payment
    │   │   ├── StressTestRunner.tsx   # 10k concurrent request runner & charts
    │   │   ├── StateFlowDiagram.tsx   # Visual 5-state lifecycle pipeline
    │   │   └── LiveLedger.tsx      # Real-time event audit stream
    │   └── api/client.ts           # API client connecting to backend (:3000)
    └── package.json
```

---

## 🚀 Quick Start Guide

### Step 1: Start Infrastructure (Postgres & Redis)
In the project root directory:
```bash
docker compose up -d
```

---

### Step 2: Start the Backend (NestJS)
```bash
cd backend
npm install
npm run start:dev
```
Backend API will be running at: `http://localhost:3000`

---

### Step 3: Start the Frontend Dashboard (React + Vite)
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at: `http://localhost:5173`

---

### Step 4: Run the 10,000 Request Concurrency Simulation
You can trigger the 10,000 request simulation in **two ways**:

1. **Directly from the Frontend UI**:
   - Navigate to the **"High-Concurrency Load Simulation Engine"** section on `http://localhost:5173`.
   - Select **10,000 Reqs (Full Spec)**.
   - Click **"Launch 10,000 Requests"** to observe real-time throughput, latency percentiles, duplicate deduplication, and invariant verification.

2. **From Terminal CLI**:
   ```bash
   cd backend
   npm run load-test
   ```

---

## 🛡️ Core Concurrency Highlights

1. **Atomic In-Memory Fast-Path**:
   - Redis Lua scripts execute atomically in single-threaded memory.
   - Filters 10,000 requests to 100 successful reservations in milliseconds; 9,900 rejections fail fast with 0 DB overhead.
2. **Reliable ZSET Lease Expiry Sweeper**:
   - Recovers unpaid reservations reliably using Redis Sorted Sets with zero-loss guarantee.
3. **Idempotency Protection**:
   - Duplicate requests with the same `X-Idempotency-Key` return cached states without decrementing inventory.
4. **Strict Invariant Verification**:
   $$\text{Initial Stock (100)} = \text{Available Stock} + \text{Active Reservations} + \text{Confirmed Sold}$$
