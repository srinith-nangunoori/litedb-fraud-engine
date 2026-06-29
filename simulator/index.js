const crypto = require('crypto');

const API_URL = 'http://localhost:5001/api/swipe';

// 1. GLOBAL DISTRIBUTION (All over the world)
const LOCATIONS = {
    DELHI: { lat: 28.7041, lon: 77.1025 },
    MUMBAI: { lat: 19.0760, lon: 72.8777 },
    BANGALORE: { lat: 12.9716, lon: 77.5946 },
    NEW_YORK: { lat: 40.7128, lon: -74.0060 },
    LONDON: { lat: 51.5074, lon: -0.1278 },
    TOKYO: { lat: 35.6762, lon: 139.6503 },
    SYDNEY: { lat: -33.8688, lon: 151.2093 },
    CAPE_TOWN: { lat: -33.9249, lon: 18.4241 },
    RIO: { lat: -22.9068, lon: -43.1729 },
    MOSCOW: { lat: 55.7558, lon: 37.6173 },
    DUBAI: { lat: 25.2048, lon: 55.2708 },
    PARIS: { lat: 48.8566, lon: 2.3522 },
    LOS_ANGELES: { lat: 34.0522, lon: -118.2437 },
    SINGAPORE: { lat: 1.3521, lon: 103.8198 }
};

const GLOBAL_CITIES = Object.keys(LOCATIONS).map(key => ({ name: key, ...LOCATIONS[key] }));

// Helper: Haversine distance
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 2. THE USER POOL
let activeUsers = [];

function spawnUser() {
    const startCity = GLOBAL_CITIES[Math.floor(Math.random() * GLOBAL_CITIES.length)];
    return {
        id: `tok_${crypto.randomUUID()}`,
        currentCity: startCity,
        currentTimestamp: Math.floor(Date.now() / 1000) - 1000000 
    };
}

for (let i = 0; i < 25; i++) {
    activeUsers.push(spawnUser());
}

// 3. INFINITE MERCHANTS
function getRandomMerchant() {
    return `merch_${Math.random().toString(36).substring(2, 8)}`;
}

let tickCount = 0;

// 4. THE SIMULATION LOOP
async function runSimulationTick() {
    tickCount++;

    // ====================================================================
    // SCENARIO 1: THE MASSIVE GRAPH SYNDICATE ATTACK (Every 40 ticks)
    // ====================================================================
    if (tickCount % 40 === 0) {
        console.log('\n[🚨 SIMULATOR] >>> ORCHESTRATING MASSIVE FRAUD RING ATTACK <<<');
        let shadyMerchant = `scam_syndicate_${Math.random().toString(36).substring(2, 6)}`;
        let timestamp = Math.floor(Date.now() / 1000);
        
        // Grab FOUR random users to act as victims
        let v1 = activeUsers[0];
        let v2 = activeUsers[1];
        let v3 = activeUsers[2];
        let v4 = activeUsers[3];

        // Phase 1: They all unknowingly buy from the scam store (Establishing the Graph Edges)
        await postTransaction(v1.id, shadyMerchant, v1.currentCity.lat, v1.currentCity.lon, timestamp, 0);
        await postTransaction(v2.id, shadyMerchant, v2.currentCity.lat, v2.currentCity.lon, timestamp, 1);
        await postTransaction(v3.id, shadyMerchant, v3.currentCity.lat, v3.currentCity.lon, timestamp, 2);
        await postTransaction(v4.id, shadyMerchant, v4.currentCity.lat, v4.currentCity.lon, timestamp, 3);

        // Phase 2: Hackers clone their cards and swipe them globally 1 second later!
        console.log(`[🚨 SIMULATOR] >>> HACKERS TRIGGERING VELOCITY DECLINES GLOBALLY! <<<`);
        await postTransaction(v1.id, 'merch_luxury_watches', LOCATIONS.LONDON.lat, LOCATIONS.LONDON.lon, timestamp + 1, 0);
        await postTransaction(v2.id, 'merch_luxury_watches', LOCATIONS.NEW_YORK.lat, LOCATIONS.NEW_YORK.lon, timestamp + 1, 1);
        await postTransaction(v3.id, 'merch_luxury_watches', LOCATIONS.TOKYO.lat, LOCATIONS.TOKYO.lon, timestamp + 1, 2);
        // We leave victim 4 alone, to prove our C++ ratio math works! (3 compromised out of 4 total = 75% > 30%)

        console.log('[🚨 SIMULATOR] ---------------------------------------------------------\n');
        return;
    }

    // ====================================================================
    // SCENARIO 2: NORMAL TRAVEL & RANDOM VELOCITY HACKS
    // ====================================================================
    let userIndex = Math.floor(Math.random() * activeUsers.length);
    let user = activeUsers[userIndex];

    let nextCity;
    do {
        nextCity = GLOBAL_CITIES[Math.floor(Math.random() * GLOBAL_CITIES.length)];
    } while (nextCity.name === user.currentCity.name);

    const distanceKm = getDistance(user.currentCity.lat, user.currentCity.lon, nextCity.lat, nextCity.lon);
    let isFraud = Math.random() < 0.10; 

    if (isFraud) {
        user.currentTimestamp += 300; 
        console.log(`\n[⚠️ SIMULATOR] >>> RANDOM VELOCITY HACK INJECTED IN ${nextCity.name} <<<`);
    } else {
        const flightTimeHours = distanceKm / 800;
        const flightTimeSeconds = Math.floor(flightTimeHours * 3600);
        user.currentTimestamp += flightTimeSeconds + 3600; 
    }

    const jitterLat = nextCity.lat + (Math.random() - 0.5) * 1.5;
    const jitterLon = nextCity.lon + (Math.random() - 0.5) * 1.5;
    const merchant = getRandomMerchant();

    await postTransaction(user.id, merchant, jitterLat, jitterLon, user.currentTimestamp, userIndex);

    if (!isFraud) {
        user.currentCity = nextCity;
    }
}

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
            console.log(`[✅ APPROVED] User: ${shortId} -> ${merchantId} (Valid Travel Time)`);
        } else {
            console.warn(`[❌ DECLINED] User: ${shortId} -> ${merchantId} | ${result.reason}`);
            
            if (result.reason.includes('Frozen') || result.reason.includes('Velocity')) {
                activeUsers[userIndex] = spawnUser(); // Shred frozen cards
            }
        }
    } catch (err) {
        console.error('[SIMULATOR ERROR] NodeJS Backend not responding.');
    }
}

console.log('[INFO] Global Time-Traveling Simulator Started. Press Ctrl+C to stop.');
setInterval(runSimulationTick, 300);