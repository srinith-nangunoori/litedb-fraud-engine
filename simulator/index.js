const crypto = require('crypto');

const API_URL = 'http://localhost:5001/api/swipe';

// Real-world coordinates
const LOCATIONS = {
    DELHI: { lat: 28.7041, lon: 77.1025 },
    MUMBAI: { lat: 19.0760, lon: 72.8777 },
    BANGALORE: { lat: 12.9716, lon: 77.5946 },
    NEW_YORK: { lat: 40.7128, lon: -74.0060 }, // Hacker City
    LONDON: { lat: 51.5074, lon: -0.1278 }     // Hacker City
};

const SAFE_MERCHANTS = ['merch_starbucks', 'merch_zara', 'merch_mcdonalds', 'merch_amazon', 'merch_uber'];
const SHADY_MERCHANTS = ['merch_cheap_laptops', 'merch_crypto_xyz', 'merch_fake_rolex'];
const INDIAN_CITIES = ['DELHI', 'MUMBAI', 'BANGALORE'];

// The Dynamic User Pool
let activeUsers = [];

// Helper: Spawn a highly complex, realistic user token
function spawnUser() {
    return {
        id: `tok_${crypto.randomUUID()}`, // e.g., tok_123e4567-e89b-12d3...
        homeCity: INDIAN_CITIES[Math.floor(Math.random() * INDIAN_CITIES.length)]
    };
}

// Initialize our pool with 20 active users
for (let i = 0; i < 20; i++) {
    activeUsers.push(spawnUser());
}

let tickCount = 0;

async function runSimulationTick() {
    tickCount++;
    const timestamp = Math.floor(Date.now() / 1000);

    // ====================================================================
    // SCENARIO 1: THE GRAPH SYNDICATE ATTACK (Every 20 ticks)
    // ====================================================================
    if (tickCount % 20 === 0) {
        console.log('\n[🚨 SIMULATOR] >>> ORCHESTRATING FRAUD RING ATTACK ON SHADY MERCHANT <<<');
        let shadyMerchant = SHADY_MERCHANTS[Math.floor(Math.random() * SHADY_MERCHANTS.length)];
        
        let victim1 = activeUsers[0];
        let victim2 = activeUsers[1];

        // Phase 1: Innocent purchase at a scam store
        await postTransaction(victim1.id, shadyMerchant, LOCATIONS[victim1.homeCity].lat, LOCATIONS[victim1.homeCity].lon, timestamp);
        await postTransaction(victim2.id, shadyMerchant, LOCATIONS[victim2.homeCity].lat, LOCATIONS[victim2.homeCity].lon, timestamp);

        // Phase 2: Hackers instantly use those cloned cards in London!
        console.log(`[🚨 SIMULATOR] >>> HACKERS CLONED CARDS! SWIPING IN LONDON! <<<`);
        await postTransaction(victim1.id, 'merch_luxury_watches', LOCATIONS.LONDON.lat, LOCATIONS.LONDON.lon, timestamp + 1);
        await postTransaction(victim2.id, 'merch_luxury_watches', LOCATIONS.LONDON.lat, LOCATIONS.LONDON.lon, timestamp + 1);

        console.log('[🚨 SIMULATOR] ---------------------------------------------------------\n');
        return;
    }

    // ====================================================================
    // SCENARIO 2: THE VELOCITY HACK (Every 8 ticks)
    // ====================================================================
    if (tickCount % 8 === 0) {
        console.log('\n[⚠️ SIMULATOR] >>> INJECTING VELOCITY HACK IN NEW YORK <<<');
        let victimIndex = Math.floor(Math.random() * activeUsers.length);
        let victim = activeUsers[victimIndex];

        await postTransaction(victim.id, 'merch_apple_store', LOCATIONS.NEW_YORK.lat, LOCATIONS.NEW_YORK.lon, timestamp);
        console.log('[⚠️ SIMULATOR] ------------------------------------------------\n');
        return;
    }

    // ====================================================================
    // SCENARIO 3: NORMAL TRAFFIC
    // ====================================================================
    let userIndex = Math.floor(Math.random() * activeUsers.length);
    let user = activeUsers[userIndex];
    let merchant = SAFE_MERCHANTS[Math.floor(Math.random() * SAFE_MERCHANTS.length)];
    
    // Add minor randomness to coordinates so they move around their home city
    let lat = LOCATIONS[user.homeCity].lat + (Math.random() - 0.5) * 0.05;
    let lon = LOCATIONS[user.homeCity].lon + (Math.random() - 0.5) * 0.05;

    await postTransaction(user.id, merchant, lat, lon, timestamp, userIndex);
}

// Function to HTTP POST data to NodeJS
async function postTransaction(userId, merchantId, lat, lon, timestamp, userIndex = -1) {
    const payload = { userId, merchantId, lat, lon, timestamp };
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === 'APPROVED') {
            // Using substring to shorten the UUID just for the console display, so it looks clean
            let shortId = userId.substring(0, 13) + '...';
            console.log(`[✅ APPROVED] User: ${shortId} -> ${merchantId}`);
        } else {
            console.warn(`[❌ DECLINED] User: ${userId.substring(0, 13)}... | Reason: ${result.reason}`);
            
            // IF THE CARD IS FROZEN, THROW IT AWAY AND SPAWN A NEW ONE!
            if (result.reason.includes('Frozen') && userIndex !== -1) {
                console.log(`[🔄 SYSTEM] Shredding frozen card and issuing new UUID to user pool...`);
                activeUsers[userIndex] = spawnUser();
            }
        }
    } catch (err) {
        console.error('[SIMULATOR ERROR] NodeJS Backend not responding.');
    }
}

// Run the loop every 500 milliseconds
console.log('[INFO] Enterprise Fraud Simulator Started. Press Ctrl+C to stop.');
setInterval(runSimulationTick, 500);