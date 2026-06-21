const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const net = require('net');

const app = express();
app.use(express.json());

const PORT = 5001;
const CPP_PORT = 6379;
const CPP_HOST = '127.0.0.1';

// --- 1. CONNECT TO C++ DATABASE VIA RAW TCP ---
const dbSocket = net.createConnection({ port: CPP_PORT, host: CPP_HOST }, () => {
    console.log('[INFO] Connected to C++ Database Engine over TCP.');
});

// Queue to handle asynchronous TCP responses
let responseResolver = null;

dbSocket.on('data', (data) => {
    const response = data.toString().trim();
    
    // If this data is a graph alert, we broadcast it to the UI immediately!
    if (response.startsWith('[ALERT]')) {
        broadcastToUI(response);
    } 
    // Otherwise, resolve the pending API request
    else if (responseResolver) {
        responseResolver(response);
        responseResolver = null;
    }
});

dbSocket.on('error', (err) => {
    console.error('[ERROR] C++ Database connection error:', err.message);
});

// Helper to send raw commands to C++ and wait for the response
function sendDbCommand(command) {
    return new Promise((resolve) => {
        responseResolver = resolve;
        dbSocket.write(command + '\n');
    });
}

// --- 2. WEBSOCKET SERVER FOR REAL-TIME UI UPDATES ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcastToUI(message) {
    console.log(`[WS BROADCAST] Sending Alert to UI: ${message}`);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'ALERT', data: message }));
        }
    });
}

wss.on('connection', (ws) => {
    console.log('[WS] Frontend browser connected to WebSocket.');
    ws.send(JSON.stringify({ type: 'INFO', data: 'Connected to Fraud Engine WebSocket Orchestrator.' }));
});

// --- 3. REST API ENDPOINTS ---

// Endpoint to receive a swipe from the Frontend
app.post('/api/swipe', async (req, res) => {
    const { userId, merchantId, lat, lon, timestamp } = req.body;

    if (!userId || !merchantId || lat === undefined || lon === undefined || !timestamp) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Format the command exactly how our C++ parser expects it
    const command = `SWIPE ${userId} ${merchantId} ${lat} ${lon} ${timestamp}`;
    
    // Send to C++ and get the raw "+APPROVED" or "-DECLINED"
    const dbResponse = await sendDbCommand(command);

    console.log(`[API] Transaction: ${userId} -> ${merchantId} | Result: ${dbResponse}`);

    if (dbResponse.startsWith('+APPROVED')) {
        return res.json({ status: 'APPROVED' });
    } else {
        return res.json({ status: 'DECLINED', reason: dbResponse.substring(1) });
    }
});

// --- 4. START THE SERVER ---
server.listen(PORT, () => {
    console.log(`[INFO] NodeJS Orchestrator running on http://localhost:${PORT}`);
});