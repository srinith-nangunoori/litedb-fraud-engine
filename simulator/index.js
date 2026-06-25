const crypto = require('crypto');

const API_URL = 'http://localhost:5001/api/swipe';

// 1. GLOBAL DISTRIBUTION (All over the world)
const GLOBAL_CITIES = [
    { name: 'NEW_YORK', lat: 40.7128, lon: -74.0060 },
    { name: 'LONDON', lat: 51.5074, lon: -0.1278 },
    { name: 'TOKYO', lat: 35.6762, lon: 139.6503 },
    { name: 'SYDNEY', lat: -33.8688, lon: 151.2093 },
    { name: 'CAPE_TOWN', lat: -33.9249, lon: 18.4241 },
    { name: 'RIO', lat: -22.9068, lon: -43.1729 },
    { name: 'MOSCOW', lat: 55.7558, lon: 37.6173 },
    { name: 'MUMBAI', lat: 19.0760, lon: 72.8777 },
    { name: 'DUBAI', lat: 25.2048, lon: 55.2708 },
    { name: 'PARIS', lat: 48.8566, lon: 2.3522 },
    { name: 'LOS_ANGELES', lat: 34.0522, lon: -118.2437 },
    { name: 'SINGAPORE', lat: 1.3521, lon: 103.8198 }
];

// Helper: Haversine distance to calculate realistic flight times
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 2. THE USER POOL (They track their own personal timelines!)
let activeUsers = [];

function spawnUser() {
    const startCity = GLOBAL_CITIES[Math.floor(Math.random() * GLOBAL_CITIES.length)];
    return {
        id: `tok_${crypto.randomUUID()}`,
        currentCity: startCity,
        // Start their timeline a few weeks ago
        currentTimestamp: Math.floor(Date.now() / 1000) - 1000000 
    };
}

// Initialize 25 global travelers
for (let i = 0; i < 25; i++) {
    activeUsers.push(spawnUser());
}

// 3. INFINITE MERCHANTS
function getRandomMerchant() {
    return `merch_${Math.random().toString(36).substring(2, 8)}`; // e.g., merch_a7x9f
}

// 4. THE SIMULATION LOOP
async function runSimulationTick() {
    // Pick a random user
    let userIndex = Math.floor(Math.random() * activeUsers.length);
    let user = activeUsers[userIndex];

    // Pick a brand new destination city (Ensuring it's different to force a line to draw!)
    let nextCity;
    do {
        nextCity = GLOBAL_CITIES[Math.floor(Math.random() * GLOBAL_CITIES.length)];
    } while (nextCity.name === user.currentCity.name);

    // Calculate distance between their old city and new city
    const distanceKm = getDistance(user.currentCity.lat, user.currentCity.lon, nextCity.lat, nextCity.lon);

    let isFraud = Math.random() < 0.10; // 10% chance to inject a Hacker

    if (isFraud) {
        // HACKER STRIKES: Add only 5 minutes (300 seconds) to the clock. 
        // Traveling 5,000km in 5 minutes is impossible! C++ will flag it.
        user.currentTimestamp += 300; 
        console.log(`\n[⚠️ SIMULATOR] >>> VELOCITY HACK INJECTED IN ${nextCity.name} <<<`);
    } else {
        // NORMAL TRAVEL: They fly on a plane. Assume an airplane flies at 800 km/h.
        const flightTimeHours = distanceKm / 800;
        const flightTimeSeconds = Math.floor(flightTimeHours * 3600);
        
        // Fast-forward their timeline so the C++ engine mathematically approves the flight!
        user.currentTimestamp += flightTimeSeconds + 3600; // Add an extra hour for layovers
    }

    // Add slight GPS jitter so dots don't stack perfectly on top of each other
    const jitterLat = nextCity.lat + (Math.random() - 0.5) * 1.5;
    const jitterLon = nextCity.lon + (Math.random() - 0.5) * 1.5;

    const merchant = getRandomMerchant();

    // Send the swipe
    await postTransaction(user.id, merchant, jitterLat, jitterLon, user.currentTimestamp, userIndex);

    // If it was a valid flight, update their current city!
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
            
            // If frozen by the hacker, shred the card and spawn a new global traveler
            if (result.reason.includes('Frozen')) {
                activeUsers[userIndex] = spawnUser();
            }
        }
    } catch (err) {
        console.error('[SIMULATOR ERROR] NodeJS Backend not responding.');
    }
}

console.log('[INFO] Global Time-Traveling Simulator Started. Press Ctrl+C to stop.');
// Run the loop every 300ms to keep the map heavily populated
setInterval(runSimulationTick, 300);


