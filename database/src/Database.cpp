#include "../include/Database.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <sys/socket.h>

// --- ADVANCED BLOOM FILTER IMPLEMENTATION ---
BloomFilter::BloomFilter(size_t expected_items, double false_positive_rate) {
    num_bits = -(expected_items * std::log(false_positive_rate)) / (std::pow(std::log(2), 2));
    num_hashes = (num_bits / expected_items) * std::log(2);
    bit_array.resize(num_bits, false);
    std::cout << "[INFO] Bloom Filter initialized: " << num_bits / 8192 << " KB allocated." << std::endl;
}

void BloomFilter::add(const std::string& item) {
    uint64_t hashA = fnv1a_hash(item);
    uint64_t hashB = djb2_hash(item);
    for (size_t i = 0; i < num_hashes; i++) {
        bit_array[(hashA + i * hashB) % num_bits] = true;
    }
}

bool BloomFilter::mightContain(const std::string& item) {
    uint64_t hashA = fnv1a_hash(item);
    uint64_t hashB = djb2_hash(item);
    for (size_t i = 0; i < num_hashes; i++) {
        if (!bit_array[(hashA + i * hashB) % num_bits]) return false;
    }
    return true; 
}
// --------------------------------------------

// Constructor
Database::Database() {
    std::cout << "[INFO] Initializing Fraud Engine Database..." << std::endl;
    loadFromLog();
}

// Logger
void Database::appendToLog(const std::string& command_str) {
    std::ofstream file("litedb.aof", std::ios::app);
    if (file.is_open()) {
        file << command_str << "\n";
        file.close();
    }
}

// Replay Engine
void Database::loadFromLog() {
    std::ifstream file("litedb.aof", std::ios::in);
    if (!file.is_open()) return;

    std::string line;
    while (std::getline(file, line)) {
        std::vector<std::string> tokens = parseInput(line);
        if (tokens.empty()) continue;

        if (tokens[0] == "BLACKLIST" && tokens.size() >= 2) {
            blacklist.add(tokens[1]);
        } else if (tokens[0] == "WHITELIST" && tokens.size() >= 2) {
            allowlist.insert(tokens[1]);
        } else if (tokens[0] == "SWIPE" && tokens.size() >= 6) {
            try {
                // Pass true for `is_replay` so it doesn't duplicate the log file!
                processSwipe(tokens[1], tokens[2], std::stod(tokens[3]), std::stod(tokens[4]), std::stoull(tokens[5]), true);
            } catch (...) {
                // Catch any bad string-to-double conversions if log is corrupted
                continue;
            }
        }
    }
    file.close();
}

// Admin Commands
std::string Database::blacklistMerchant(const std::string& merchant) {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    blacklist.add(merchant);
    appendToLog("BLACKLIST " + merchant);
    return "+OK Merchant Blacklisted\r\n";
}

std::string Database::whitelistMerchant(const std::string& merchant) {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    allowlist.insert(merchant);
    appendToLog("WHITELIST " + merchant);
    return "+OK Merchant Whitelisted\r\n";
}

// --- THE CORE FRAUD LOGIC ---
std::string Database::processSwipe(const std::string& user_id, const std::string& merchant_id, double lat, double lon, uint64_t timestamp, bool is_replay) {
    std::unique_lock<std::shared_mutex> lock(db_mutex);

    // --- THE SECURITY FREEZE ---
    // If this card is already flagged as compromised, block all future swipes immediately!
    if (compromised_cards[user_id] > 0) {
        return "-DECLINED Card Frozen\r\n";
    }

    // 1. SCAM MERCHANT CHECK (Fast Path)
    if (allowlist.find(merchant_id) == allowlist.end()) {
        if (blacklist.mightContain(merchant_id)) {
            return "-DECLINED Scam Merchant Detected\r\n";
        }
    }

    // 2. VELOCITY FRAUD CHECK
    auto it = user_history.find(user_id);
    if (it != user_history.end()) {
        auto list_iterator = it->second;
        const auto& history_queue = list_iterator->second;

        // Get absolute last VALID transaction
        const Transaction& last_txn = history_queue.back();
        double distance_km = calculateDistance(last_txn.lat, last_txn.lon, lat, lon);
        double time_diff_hours = (timestamp - last_txn.timestamp) / 3600.0;

        if (time_diff_hours > 0) { 
            double speed_kmh = distance_km / time_diff_hours;
            if (speed_kmh > 1000.0) {
                compromised_cards[user_id]++; 
                return "-DECLINED Impossible Velocity (" + std::to_string(speed_kmh) + " km/h)\r\n";
            }
        }

        // Safe: Move user to front of LRU
        lru_list.splice(lru_list.begin(), lru_list, list_iterator);
    } else {
        // New user eviction logic
        if (user_history.size() >= MAX_CAPACITY) {
            std::string oldest_user = lru_list.back().first;
            user_history.erase(oldest_user);
            lru_list.pop_back();
        }
        lru_list.push_front({user_id, std::deque<Transaction>()});
        user_history[user_id] = lru_list.begin();
    }

    // 3. UPDATE HISTORY
    auto list_iterator = user_history[user_id];
    list_iterator->second.push_back({merchant_id, lat, lon, timestamp});
    
    // Keep max 5 transactions
    if (list_iterator->second.size() > 5) {
        list_iterator->second.pop_front();
    }   

    // 4. UPDATE GRAPH EDGE
    merchant_to_users[merchant_id].insert(user_id);

    // 5. WRITE TO DISK (Skip if we are just replaying the log on startup)
    if (!is_replay) {
        appendToLog("SWIPE " + user_id + " " + merchant_id + " " + std::to_string(lat) + " " + std::to_string(lon) + " " + std::to_string(timestamp));
    }

    return "+APPROVED\r\n";
}

// Helper parsing function
std::vector<std::string> parseInput(const std::string& input) {
    std::vector<std::string> tokens;
    std::stringstream ss(input);
    std::string word;    
    while (ss >> word) {
        tokens.push_back(word);
    }
    return tokens;
}

// --- BACKGROUND GRAPH ANALYZER ---
void Database::runGraphAnalysis() {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    int new_fraud_rings_found = 0;

    for (const auto& pair : merchant_to_users) {
        const std::string& merchant_id = pair.first;
        const std::unordered_set<std::string>& users = pair.second;

        if (allowlist.find(merchant_id) != allowlist.end()) continue;
        if (blacklist.mightContain(merchant_id)) continue;

        int compromised_user_count = 0;
        for (const std::string& user_id : users) {
            if (compromised_cards[user_id] > 0) {
                compromised_user_count++;
            }
        }

        if (compromised_user_count >= 2) {
            blacklist.add(merchant_id);
            appendToLog("BLACKLIST " + merchant_id); 
            
            std::cout << "\n[ALERT] GRAPH ENGINE DETECTED FRAUD RING! Auto-Blacklisted: " << merchant_id << "\n> ";
            
            // --- THE BROADCAST LOOP ---
            std::string alert_msg = "[ALERT] Fraud Ring Detected: " + merchant_id + "\r\n";
            for (int fd : active_sockets) {
                send(fd, alert_msg.c_str(), alert_msg.length(), 0);
            }
            // ---------------------------

            new_fraud_rings_found++;
        }
    }

    if (new_fraud_rings_found > 0) {
        std::cout << "[INFO] Graph Analysis complete. " << new_fraud_rings_found << " new syndicates shut down.\n> ";
    }
}

void Database::registerSocket(int fd) {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    active_sockets.insert(fd);
}

void Database::deregisterSocket(int fd) {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    active_sockets.erase(fd);
}