const crypto = require('crypto');

// Cloud-ready API URL
const API_URL = process.env.API_URL || 'http://localhost:5001/api/swipe';

// ============================================================================
// 1. GEOGRAPHY — 40+ Cities for Global Routing
// ============================================================================
const LOCATIONS = {
    NEW_YORK: { lat: 40.7128, lon: -74.0060 }, LOS_ANGELES: { lat: 34.0522, lon: -118.2437 },
    TORONTO: { lat: 43.6532, lon: -79.3832 }, MEXICO_CITY: { lat: 19.4326, lon: -99.1332 },
    RIO: { lat: -22.9068, lon: -43.1729 }, BOGOTA: { lat: 4.7110, lon: -74.0721 },
    LONDON: { lat: 51.5074, lon: -0.1278 }, PARIS: { lat: 48.8566, lon: 2.3522 },
    MOSCOW: { lat: 55.7558, lon: 37.6173 }, BERLIN: { lat: 52.5200, lon: 13.4050 },
    TOKYO: { lat: 35.6762, lon: 139.6503 }, DELHI: { lat: 28.7041, lon: 77.1025 },
    MUMBAI: { lat: 19.0760, lon: 72.8777 }, BANGALORE: { lat: 12.9716, lon: 77.5946 },
    SINGAPORE: { lat: 1.3521, lon: 103.8198 }, DUBAI: { lat: 25.2048, lon: 55.2708 },
    CAPE_TOWN: { lat: -33.9249, lon: 18.4241 }, LAGOS: { lat: 6.5244, lon: 3.3792 },
    SYDNEY: { lat: -33.8688, lon: 151.2093 }, AUCKLAND: { lat: -36.8485, lon: 174.7633 },
    HELSINKI: { lat: 60.1699, lon: 24.9384 }, ATHENS: { lat: 37.9838, lon: 23.7275 }
};

const GLOBAL_CITIES = Object.keys(LOCATIONS).map(key => ({ name: key, ...LOCATIONS[key] }));

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function randomCity(excludeName = "") {
    let city;
    do { city = GLOBAL_CITIES[Math.floor(Math.random() * GLOBAL_CITIES.length)]; } 
    while (city.name === excludeName);
    return city;
}

// ============================================================================
// 2. ACTOR MODEL (50 Active Users)
// ============================================================================
const USER_POOL_SIZE = 50;
let activeUsers = [];

function spawnUser() {
    return {
        id: `tok_${crypto.randomUUID()}`,
        currentCity: randomCity(),
        currentTimestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000000)
    };
}

for (let i = 0; i < USER_POOL_SIZE; i++) activeUsers.push(spawnUser());

function getRandomMerchant() {
    return `merch_${crypto.randomUUID().substring(0, 8)}`;
}

// ============================================================================
// 3. TRANSACTION ENGINE
// ============================================================================
async function postTransaction(userId, merchantId, lat, lon, timestamp, userIndex) {
    const payload = { userId, merchantId, lat, lon, timestamp };
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        const shortId = userId.substring(0, 13) + '...';
        
        if (result.status === 'APPROVED') {
            console.log(`[✅ APPROVED] User: ${shortId} -> ${merchantId}`);
        } else {
            console.warn(`[❌ DECLINED] User: ${shortId} -> ${merchantId} | ${result.reason}`);
            // Shred frozen cards and spawn a new one to keep the traffic alive
            if (result.reason && (result.reason.includes('Frozen') || result.reason.includes('Velocity'))) {
                activeUsers[userIndex] = spawnUser();
            }
        }
    } catch (err) {
        // Silently ignore connection drops so the simulator doesn't crash
    }
}

// ============================================================================
// 4. THE CONTINUOUS FLOW LOGIC
// ============================================================================
let isSyndicateActive = false;

async function fireContinuousTraffic() {
    const roll = Math.random();
    const userIndex = Math.floor(Math.random() * activeUsers.length);
    const user = activeUsers[userIndex];

    if (roll < 0.90) {
        // --- 90% ORGANIC TRAVEL ---
        const nextCity = randomCity(user.currentCity.name);
        const distanceKm = getDistance(user.currentCity.lat, user.currentCity.lon, nextCity.lat, nextCity.lon);
        
        const flightSeconds = Math.ceil((distanceKm / 800) * 3600);
        user.currentTimestamp += flightSeconds + 3600; // Add flight time + 1 hour layover
        user.currentCity = nextCity;

        const jitterLat = nextCity.lat + (Math.random() - 0.5) * 0.5;
        const jitterLon = nextCity.lon + (Math.random() - 0.5) * 0.5;

        // Fire async (don't await!) to create overlapping TCP packets
        postTransaction(user.id, getRandomMerchant(), jitterLat, jitterLon, user.currentTimestamp, userIndex);

    } 
    else if (roll < 0.98) {
        // --- 8% VELOCITY HACK ---
        const hackCity = randomCity(user.currentCity.name);
        user.currentTimestamp += 5; // Swipe 5 seconds later
        
        const jitterLat = hackCity.lat + (Math.random() - 0.5) * 0.5;
        const jitterLon = hackCity.lon + (Math.random() - 0.5) * 0.5;

        postTransaction(user.id, getRandomMerchant(), jitterLat, jitterLon, user.currentTimestamp, userIndex);
    } 
    else if (!isSyndicateActive) {
        // --- 2% SYNDICATE ORCHESTRATION ---
        isSyndicateActive = true;
        
        // 1. Generate a unique Data Harvester
        const shadyMerchant = `scam_front_${crypto.randomUUID().substring(0, 6)}`;
        
        // 2. Generate a unique Cash-Out Front for the hackers to use!
        const cashOutMerchant = `cashout_front_${crypto.randomUUID().substring(0, 6)}`;
        
        console.log(`\n[🚨] ORCHESTRATING SYNDICATE ATTACK ON: ${shadyMerchant}`);

        // Pick 4 random victims
        const victims = [0, 1, 2, 3].map(() => Math.floor(Math.random() * activeUsers.length));
        const baseTime = Math.floor(Date.now() / 1000);

        // Phase 1: Innocent users buy from the scam merchant (Builds the Graph Edges)
        victims.forEach((vIdx, i) => {
            const v = activeUsers[vIdx];
            postTransaction(v.id, shadyMerchant, v.currentCity.lat, v.currentCity.lon, baseTime + i, vIdx);
        });

        // Phase 2: 3 Seconds later, hackers cash out those cloned cards globally!
        setTimeout(() => {
            console.log(`[🚨] HACKERS CASHING OUT AT ${cashOutMerchant}!`);
            victims.slice(0, 3).forEach((vIdx) => {
                const v = activeUsers[vIdx];
                
                // Ensure the hacker is in a completely random global city
                const cloneCity = randomCity(v.currentCity.name);
                const jitterLat = cloneCity.lat + (Math.random() - 0.5) * 0.5;
                const jitterLon = cloneCity.lon + (Math.random() - 0.5) * 0.5;

                // Fire the hack at the unique Cash-Out merchant!
                postTransaction(v.id, cashOutMerchant, jitterLat, jitterLon, baseTime + 5, vIdx);
            });
            isSyndicateActive = false; // Reset lock
        }, 3000);
    }

    // Recursively call the next transaction with a random delay (250ms to 600ms)
    // This creates a calm, readable, continuous river of traffic for the React UI.
    const randomDelay = Math.floor(Math.random() * 350) + 250;
    setTimeout(fireContinuousTraffic, randomDelay);
}

// Start the continuous river of data
console.log('🎬 Global Continuous Fraud Simulator Started');
console.log('🛑 Press Ctrl+C to stop.\n');

fireContinuousTraffic();