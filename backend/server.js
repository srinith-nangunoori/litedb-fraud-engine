const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');

const app = express();
const cors = require('cors');
app.use(cors()); // This tells Node to accept HTTP requests from any port!
app.use(express.json());

const PORT = 5001;
const CPP_PORT = 6379;
const CPP_HOST = '127.0.0.1';

// --- CONNECT TO C++ DATABASE OVER TCP ---
const dbSocket = net.createConnection({ port: CPP_PORT, host: CPP_HOST }, () => {
    console.log('[INFO] Connected to C++ Database Engine over TCP.');
});

// Queue to safely handle overlapping TCP requests
const requestQueue = [];

dbSocket.on('data', (data) => {
    // A single TCP packet might contain multiple lines of responses (if C++ replies fast)
    const responses = data.toString().trim().split('\n');
    
    for (const res of responses) {
        const cleanRes = res.trim();
        if (!cleanRes) continue;

        if (cleanRes.startsWith('[ALERT]')) {
            broadcastToUI({ type: 'ALERT', data: cleanRes });
        } 
        else if (requestQueue.length > 0) {
            // Resolve the oldest pending request in the queue
            const resolver = requestQueue.shift();
            resolver(cleanRes);
        }
    }
});

dbSocket.on('error', (err) => {
    console.error('[ERROR] C++ Database connection error:', err.message);
});

// Safely queue commands so they never overwrite each other
function sendDbCommand(command) {
    return new Promise((resolve) => {
        requestQueue.push(resolve);
        dbSocket.write(command + '\n');
    });
}

// --- HELPER: PARSE C++ MICRO-METRICS PROTOCOL ---
// Parses "+APPROVED | T_TOTAL:385us | T_LOCK:0us | T_BLOOM:2us | T_VELOCITY:9us | T_DISK:369us"
function parseMetrics(dbResponse) {
    const parts = dbResponse.split('|');
    const statusPart = parts[0].trim();
    
    const result = {
        status: statusPart.startsWith('+APPROVED') ? 'APPROVED' : 'DECLINED',
        reason: statusPart.startsWith('-DECLINED') ? statusPart.substring(1).trim() : null,
        t_total: 0,
        t_lock: 0,
        t_bloom: 0,
        t_velocity: 0,
        t_disk: 0
    };

    // Extract individual timings
    for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].trim().split(':');
        if (key && value) {
            const cleanKey = key.trim().toLowerCase(); // e.g., t_total
            const numericValue = parseInt(value.replace('us', '').trim());
            result[cleanKey] = numericValue;
        }
    }
    return result;
}

// --- WEBSOCKET SERVER FOR REAL-TIME BROADCASTS ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcastToUI(payload) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('[WS] Frontend browser connected to WebSocket.');
    ws.send(JSON.stringify({ type: 'INFO', data: 'Connected to Fraud Engine WebSocket Orchestrator.' }));
});

// --- REST API ENDPOINTS ---

// 1. Submit a Live Swipe
app.post('/api/swipe', async (req, res) => {
    const { userId, merchantId, lat, lon, timestamp } = req.body;

    if (!userId || !merchantId || lat === undefined || lon === undefined || !timestamp) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    const command = `SWIPE ${userId} ${merchantId} ${lat} ${lon} ${timestamp}`;
    const dbResponse = await sendDbCommand(command);

    // Parse the micro-metrics from C++
    const parsedResult = parseMetrics(dbResponse);

    // Prepare payload to broadcast to the React Map UI
    const broadcastPayload = {
        type: 'TXN',
        data: {
            userId,
            merchantId,
            lat,
            lon,
            timestamp,
            ...parsedResult // Spreads status, reason, t_total, t_lock, t_bloom, t_velocity, t_disk
        }
    };

    // Broadcast live transaction to the UI
    broadcastToUI(broadcastPayload);

    // Return response to the Simulator
    return res.json(parsedResult);
});

// 2. GET USER HISTORY (Queries C++ GET_HISTORY)
app.get('/api/history/:userId', async (req, res) => {
    const { userId } = req.params;
    const dbResponse = await sendDbCommand(`GET_HISTORY ${userId}`);

    if (dbResponse === '(nil)') {
        return res.status(404).json({ error: 'User history not found' });
    }

    // Parse: "+HISTORY 28.7,77.1,1600;40.7,-74.0,1601;"
    const cleanData = dbResponse.replace('+HISTORY', '').trim();
    const records = cleanData.split(';').filter(x => x.length > 0);

    const history = records.map(rec => {
        const [lat, lon, ts] = rec.split(',');
        return { lat: parseFloat(lat), lon: parseFloat(lon), timestamp: parseInt(ts) };
    });

    return res.json(history);
});

// 3. GET SYNDICATE INTEL (Queries C++ GET_SYNDICATE)
app.get('/api/syndicate/:merchantId', async (req, res) => {
    const { merchantId } = req.params;
    const dbResponse = await sendDbCommand(`GET_SYNDICATE ${merchantId}`);

    if (dbResponse === '(nil)') {
        // Return a safe empty graph instead of crashing React!
        return res.json({ merchantId, totalUsers: 0, compromisedCount: 0, compromisedUsers: [] });
    }

    try {
        // Parse: "+SYNDICATE TOTAL:5 COMPROMISED:2 LIST:tok_1,tok_2,"
        const cleanData = dbResponse.replace('+SYNDICATE', '').trim();
        const parts = cleanData.split(' ');
        
        const total = parseInt(parts[0].split(':')[1] || '0');
        const compromised = parseInt(parts[1].split(':')[1] || '0');
        
        // Safely extract the list string, even if it's empty
        const listPart = parts[2] ? parts[2].split(':') : [];
        const listString = listPart.length > 1 ? listPart[1] : '';
        
        const list = listString ? listString.split(',').filter(x => x.length > 0) : [];

        return res.json({ 
            merchantId, 
            totalUsers: total, 
            compromisedCount: compromised, 
            compromisedUsers: list 
        });
    } catch (err) {
        console.error(`[API ERROR] Failed to parse Syndicate Data: ${err.message}`);
        return res.status(500).json({ error: 'Failed to parse C++ response' });
    }
});

// --- START SERVER ---
server.listen(PORT, () => {
    console.log(`[INFO] NodeJS Orchestrator running on http://localhost:${PORT}`);
});

// 4. GET ALL CAUGHT SYNDICATES (For UI Persistence on Refresh)
app.get('/api/syndicates/all', async (req, res) => {
    const dbResponse = await sendDbCommand(`GET_ALL_SYNDICATES`);

    if (dbResponse === '(nil)') {
        return res.json([]);
    }

    // Parse: "+SYNDICATES merch_1,merch_2,"
    const cleanData = dbResponse.replace('+SYNDICATES', '').trim();
    const list = cleanData.split(',').filter(x => x.length > 0);

    return res.json(list);
});

// 5. GET CRIME SCENE LOCATIONS (Queries C++ GET_CRIME_SCENES)
app.get('/api/crimescenes/:merchantId', async (req, res) => {
    const { merchantId } = req.params;
    const dbResponse = await sendDbCommand(`GET_CRIME_SCENES ${merchantId}`);

    if (dbResponse === '(nil)') {
        return res.json([]);
    }

    // Parse: "+CRIME_SCENES 40.7,-74.0,1600;51.5,-0.1,1601;"
    const cleanData = dbResponse.replace('+CRIME_SCENES', '').trim();
    const records = cleanData.split(';').filter(x => x.length > 0);

    const scenes = records.map(rec => {
        const [lat, lon, ts] = rec.split(',');
        return { lat: parseFloat(lat), lon: parseFloat(lon), timestamp: parseInt(ts) };
    });

    return res.json(scenes);
});