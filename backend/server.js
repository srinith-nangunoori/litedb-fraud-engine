const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
const CPP_HOST = process.env.CPP_HOST || '127.0.0.1';
const CPP_PORT = 6379;

// ─────────────────────────────────────────────────────────────
// 1. THE PERSISTENT SOCKET (For UI Queries & Background Alerts)
// ─────────────────────────────────────────────────────────────
const querySocket = net.createConnection({ port: CPP_PORT, host: CPP_HOST }, () => {
    console.log('[INFO] Persistent Query Socket connected to C++');
});

const queryQueue = new Map();
let queryCounter = 0;
let queryBuffer = "";

querySocket.on('data', (data) => {
    queryBuffer += data.toString();
    let newlineIndex;
    while ((newlineIndex = queryBuffer.indexOf('\n')) !== -1) {
        const responseLine = queryBuffer.substring(0, newlineIndex).trim();
        queryBuffer = queryBuffer.substring(newlineIndex + 1);

        if (!responseLine) continue;

        // Broadcast background alerts to the UI immediately
        if (responseLine.startsWith('[ALERT]')) {
            broadcastToUI({ type: 'ALERT', data: responseLine });
            continue;
        }

        const oldestKey = queryQueue.keys().next().value;
        if (oldestKey !== undefined) {
            const resolver = queryQueue.get(oldestKey);
            queryQueue.delete(oldestKey);
            resolver(responseLine);
        }
    }
});

function sendQueryCommand(command) {
    return new Promise((resolve) => {
        const reqId = queryCounter++;
        queryQueue.set(reqId, resolve);
        
        setTimeout(() => {
            if (queryQueue.has(reqId)) {
                queryQueue.delete(reqId);
                resolve('(nil)');
            }
        }, 3000);
        querySocket.write(command + '\n');
    });
}

// ─────────────────────────────────────────────────────────────
// 2. THE EPHEMERAL SOCKET (Fixes the Multi-Thread Deadlock!)
// ─────────────────────────────────────────────────────────────
// Every swipe gets its own dedicated, short-lived socket. 
// It is impossible for C++ threads to mix up their responses now!
function sendSwipeCommand(command) {
    return new Promise((resolve) => {
        const client = net.createConnection({ port: CPP_PORT, host: CPP_HOST }, () => {
            client.write(command + '\n');
        });

        let resolved = false;

        client.on('data', (data) => {
            if (!resolved) {
                resolved = true;
                resolve(data.toString().trim());
                client.destroy(); // Close the socket immediately after getting the answer
            }
        });

        client.on('error', () => {
            if (!resolved) {
                resolved = true;
                resolve('-DECLINED API Socket Error');
            }
        });

        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve('-DECLINED Backend Timeout');
                client.destroy();
            }
        }, 3000);
    });
}

// ─────────────────────────────────────────────────────────────
// 3. WEBSOCKET & REST APIs
// ─────────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcastToUI(payload) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
    });
}

function parseMetrics(dbResponse) {
    const parts = dbResponse.split('|');
    const statusPart = parts[0].trim();
    
    const result = {
        status: statusPart.startsWith('+APPROVED') ? 'APPROVED' : 'DECLINED',
        reason: statusPart.startsWith('-DECLINED') ? statusPart.substring(1).trim() : null,
        t_total: 0, t_lock: 0, t_bloom: 0, t_velocity: 0, t_disk: 0
    };

    for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].trim().split(':');
        if (key && value) result[key.trim().toLowerCase()] = parseInt(value.replace('us', '').trim());
    }
    return result;
}

app.post('/api/swipe', async (req, res) => {
    const { userId, merchantId, lat, lon, timestamp } = req.body;
    const command = `SWIPE ${userId} ${merchantId} ${lat} ${lon} ${timestamp}`;
    
    // Uses the isolated, thread-safe socket!
    const dbResponse = await sendSwipeCommand(command);
    const parsedResult = parseMetrics(dbResponse);

    broadcastToUI({ type: 'TXN', data: { userId, merchantId, lat, lon, timestamp, ...parsedResult } });
    return res.json(parsedResult);
});

app.get('/api/history/:userId', async (req, res) => {
    const dbResponse = await sendQueryCommand(`GET_HISTORY ${req.params.userId}`);
    if (dbResponse === '(nil)') return res.json([]);

    const cleanData = dbResponse.replace('+HISTORY', '').trim();
    const history = cleanData.split(';').filter(x => x.length > 0).map(rec => {
        const [lat, lon, ts] = rec.split(',');
        return { lat: parseFloat(lat), lon: parseFloat(lon), timestamp: parseInt(ts) };
    });
    return res.json(history);
});

app.get('/api/syndicate/:merchantId', async (req, res) => {
    const dbResponse = await sendQueryCommand(`GET_SYNDICATE ${req.params.merchantId}`);
    if (dbResponse === '(nil)') return res.json({ merchantId: req.params.merchantId, totalUsers: 0, compromisedCount: 0, compromisedUsers: [] });

    const cleanData = dbResponse.replace('+SYNDICATE', '').trim();
    const parts = cleanData.split(' ');
    
    const listPart = parts[2] ? parts[2].split(':') : [];
    const listString = listPart.length > 1 ? listPart[1] : '';
    
    return res.json({ 
        merchantId: req.params.merchantId, 
        totalUsers: parseInt(parts[0].split(':')[1] || '0'), 
        compromisedCount: parseInt(parts[1].split(':')[1] || '0'), 
        compromisedUsers: listString ? listString.split(',').filter(x => x.length > 0) : [] 
    });
});

app.get('/api/syndicates/all', async (req, res) => {
    const dbResponse = await sendQueryCommand(`GET_ALL_SYNDICATES`);
    if (dbResponse === '(nil)') return res.json([]);
    const cleanData = dbResponse.replace('+SYNDICATES', '').trim();
    return res.json(cleanData.split(',').filter(x => x.length > 0));
});

app.get('/api/crimescenes/:merchantId', async (req, res) => {
    const dbResponse = await sendQueryCommand(`GET_CRIME_SCENES ${req.params.merchantId}`);
    if (dbResponse === '(nil)') return res.json([]);

    const cleanData = dbResponse.replace('+CRIME_SCENES', '').trim();
    const scenes = cleanData.split(';').filter(x => x.length > 0).map(rec => {
        const [lat, lon, ts] = rec.split(',');
        return { lat: parseFloat(lat), lon: parseFloat(lon), timestamp: parseInt(ts) };
    });
    return res.json(scenes);
});

server.listen(PORT, () => {
    console.log(`[INFO] NodeJS Orchestrator running on http://localhost:${PORT}`);
});