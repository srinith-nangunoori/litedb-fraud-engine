#  LiteDB: High-Performance Fraud Detection Engine

![C++17](https://img.shields.io/badge/C++-17-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![WebSockets](https://img.shields.io/badge/WebSockets-000000?style=for-the-badge&logo=socketdotio&logoColor=white)

LiteDB is a bespoke, multi-model in-memory database engine built entirely from scratch in C++17. Designed to replace traditional relational databases for high-throughput, low-latency financial systems, it evaluates global credit card transactions, calculates geospatial velocity, and clusters money-laundering syndicates in less than 50 microseconds.

This project was engineered to demonstrate absolute mastery over **System Architecture, Concurrent Programming, Advanced Data Structures, and Low-Level Networking**.

---

##  System Architecture

The ecosystem operates across three heavily decoupled tiers:

```text
[ Global Traffic Simulator ]  ==> Injects 50+ TPS of concurrent organic & malicious traffic
            │
            ▼ (HTTP REST)
[ Node.js WebSocket Bridge ]  ==> Parses C++ micro-metrics, routes TCP, streams WebSockets
            │
            ▼ (Raw TCP / POSIX Sockets)
[ C++ LiteDB Core Engine ]    ==> Executes O(1) Fraud Math, Graph Traversal, & Async Disk I/O
```

### 1. The C++ Core (The Brain)
Built without heavy third-party frameworks, utilizing raw POSIX sockets and `<shared_mutex>` read/write locks.
*   **The Velocity Engine (LRU Cache):** Uses a `std::unordered_map` and a `std::deque` to track user transaction histories. Implements **Haversine spherical trigonometry** to calculate the distance and speed between consecutive global swipes, instantly freezing cards that exceed commercial jet speeds (>1000 km/h) to prevent cloned-card attacks.
*   **The Data Harvester AI (Bipartite Graph):** A background `std::thread` runs an asynchronous clustering algorithm over a `merchant <-> user` graph. It calculates dynamic fraud ratios to catch "Shell Merchants" operating as card-cloning fronts without interrupting the live $O(1)$ transaction thread.
*   **The Cash-Out Shield (Bloom Filter):** Implements an ultra-low memory bit-array using **FNV-1a** and **DJB2** non-cryptographic hashing (utilizing the Kirsch-Mitzenmacher optimization). Blacklisted merchants are checked in $O(1)$ nanoseconds, bypassing all other database overhead.
*   **Dual-Persistence Storage (DBMS Durability):** To prevent SSD I/O bottlenecks, LiteDB uses a **Double-Buffered Pointer Swap**. A live RAM buffer accepts logs in 1µs, while a background thread swaps the memory pointers and flushes the Write-Ahead Log (AOF) to disk. A secondary RDB Snapshot engine compresses the RAM state every 30 seconds for instant crash recovery.

### 2. The Node.js Orchestrator (The Bridge)
*   **Map-Based TCP Queueing:** Solves TCP packet fragmentation and out-of-order execution by mapping concurrent C++ network responses to unique `Promise` resolvers.
*   **CORS & WebSocket Broadcaster:** Transforms raw C++ byte-strings into formatted JSON streams, pushing high-frequency updates to the React UI with zero polling overhead.

### 3. The React "War-Room" Dashboard (The UI)
A premium, hardware-accelerated observability console heavily inspired by Apple/Linear minimalism.
*   **Geospatial Vector Engine:** Uses `react-simple-maps` with `vectorEffect="non-scaling-stroke"` to offload global map zooming and panning to the GPU. Draws dynamic, geodesic laser arcs to visualize velocity fraud.
*   **Micro-Profiling Telemetry:** Uses `Recharts` to prove hardware efficiency, displaying real-time telemetry gauges isolating Mutex Lock times, Bloom Filter hashing times, and SSD Write times.
*   **Round-Robin Color Sequencing:** Ensures visual clarity in high-density streams by mathematically hashing user sequence IDs into a persistent, non-colliding color palette.

---

##  Quickstart Guide

To run the entire distributed system locally, you will need 4 terminal windows.

**1. Boot the C++ Database Engine**
```bash
cd database
# Compile the engine
g++ -std=c++17 src/main.cpp src/Database.cpp -I include -o litedb_server
# Run it
./litedb_server
```

**2. Boot the Node.js API & WebSocket Bridge**
```bash
cd backend
npm install
node server.js
```

**3. Boot the React Frontend Dashboard**
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173 in your browser
```

**4. Start the Global Traffic Simulator**
```bash
cd simulator
node index.js
```
*Note: The simulator will immediately begin pumping intelligent, stochastic global traffic. Open the React UI to watch the engine catch Cash-Out Fronts and Data Harvesters in real-time.*

---

## Engineering Highlights for Code Review
If you are reviewing this repository, pay special attention to:
*   `database/src/Database.cpp`: The `processSwipe` function demonstrates Guard Clauses, `std::shared_lock` vs `std::unique_lock` contention optimization, and microsecond `std::chrono` profiling.
*   `database/include/HashUtils.h`: The manual bit-shifting logic for the Bloom Filter hashes.
*   `backend/server.js`: The TCP packet-fragmentation buffer and the Promise-Map queue resolving out-of-order C++ network responses.
*   `frontend/src/components/NetworkMap.jsx`: The scale-invariant GPU SVG rendering and mathematical color-hashing.
```

***
