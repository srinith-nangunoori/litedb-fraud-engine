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

// --- THE CORE FRAUD LOGIC (With Granular Micro-Profiling) ---
std::string Database::processSwipe(const std::string& user_id, const std::string& merchant_id, double lat, double lon, uint64_t timestamp, bool is_replay) {
    // Start absolute timer
    auto start_time = std::chrono::high_resolution_clock::now();

    // 1. MEASURE LOCK TIME
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    auto after_lock = std::chrono::high_resolution_clock::now();
    uint64_t t_lock = std::chrono::duration_cast<std::chrono::microseconds>(after_lock - start_time).count();

    // --- THE SECURITY FREEZE ---
    if (compromised_cards[user_id] > 0) {
        auto end_time = std::chrono::high_resolution_clock::now();
        uint64_t t_total = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
        return "-DECLINED Card Frozen | T_TOTAL:" + std::to_string(t_total) + "us | T_LOCK:" + std::to_string(t_lock) + "us\r\n";
    }

    // 2. MEASURE BLOOM FILTER TIME
    auto before_bloom = std::chrono::high_resolution_clock::now();
    if (allowlist.find(merchant_id) == allowlist.end()) {
        if (blacklist.mightContain(merchant_id)) {
            auto end_time = std::chrono::high_resolution_clock::now();
            uint64_t t_bloom = std::chrono::duration_cast<std::chrono::microseconds>(end_time - before_bloom).count();
            uint64_t t_total = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
            return "-DECLINED Scam Merchant Detected | T_TOTAL:" + std::to_string(t_total) + "us | T_LOCK:" + std::to_string(t_lock) + "us | T_BLOOM:" + std::to_string(t_bloom) + "us\r\n";
        }
    }
    auto after_bloom = std::chrono::high_resolution_clock::now();
    uint64_t t_bloom = std::chrono::duration_cast<std::chrono::microseconds>(after_bloom - before_bloom).count();

    // 3. MEASURE VELOCITY MATH TIME
    auto before_velocity = std::chrono::high_resolution_clock::now();
    uint64_t t_velocity = 0;
    auto it = user_history.find(user_id);
    if (it != user_history.end()) {
        auto list_iterator = it->second;
        const auto& history_queue = list_iterator->second;

        const Transaction& last_txn = history_queue.back();
        double distance_km = calculateDistance(last_txn.lat, last_txn.lon, lat, lon);
        double time_diff_hours = (timestamp - last_txn.timestamp) / 3600.0;

        if (time_diff_hours > 0) { 
            double speed_kmh = distance_km / time_diff_hours;
            if (speed_kmh > 1000.0) {
                compromised_cards[user_id]++; 
                
                auto end_time = std::chrono::high_resolution_clock::now();
                t_velocity = std::chrono::duration_cast<std::chrono::microseconds>(end_time - before_velocity).count();
                uint64_t t_total = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
                return "-DECLINED Impossible Velocity (" + std::to_string(speed_kmh) + " km/h) | T_TOTAL:" + std::to_string(t_total) + "us | T_LOCK:" + std::to_string(t_lock) + "us | T_BLOOM:" + std::to_string(t_bloom) + "us | T_VELOCITY:" + std::to_string(t_velocity) + "us\r\n";
            }
        }

        lru_list.splice(lru_list.begin(), lru_list, list_iterator);
    } else {
        if (user_history.size() >= MAX_CAPACITY) {
            std::string oldest_user = lru_list.back().first;
            user_history.erase(oldest_user);
            lru_list.pop_back();
        }
        lru_list.push_front({user_id, std::deque<Transaction>()});
        user_history[user_id] = lru_list.begin();
    }

    // 4. UPDATE HISTORY & GRAPH
    auto list_iterator = user_history[user_id];
    list_iterator->second.push_back({merchant_id, lat, lon, timestamp});
    if (list_iterator->second.size() > 5) {
        list_iterator->second.pop_front();
    }   
    merchant_to_users[merchant_id].insert(user_id);
    auto after_velocity = std::chrono::high_resolution_clock::now();
    t_velocity = std::chrono::duration_cast<std::chrono::microseconds>(after_velocity - before_velocity).count();

    // 5. MEASURE DISK PERSISTENCE TIME (AOF write)
    auto before_disk = std::chrono::high_resolution_clock::now();
    uint64_t t_disk = 0;
    if (!is_replay) {
        appendToLog("SWIPE " + user_id + " " + merchant_id + " " + std::to_string(lat) + " " + std::to_string(lon) + " " + std::to_string(timestamp));
        auto after_disk = std::chrono::high_resolution_clock::now();
        t_disk = std::chrono::duration_cast<std::chrono::microseconds>(after_disk - before_disk).count();
    }

    // Final total calculation
    auto end_time = std::chrono::high_resolution_clock::now();
    uint64_t t_total = std::chrono::duration_cast<std::chrono::microseconds>(end_time - start_time).count();
    
    return "+APPROVED | T_TOTAL:" + std::to_string(t_total) + "us" +
           " | T_LOCK:" + std::to_string(t_lock) + "us" +
           " | T_BLOOM:" + std::to_string(t_bloom) + "us" +
           " | T_VELOCITY:" + std::to_string(t_velocity) + "us" +
           " | T_DISK:" + std::to_string(t_disk) + "us\r\n";
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
// --- DATA RETRIEVAL APIs (FOR THE FRONTEND) ---

std::string Database::getHistory(const std::string& user_id) {
    std::shared_lock<std::shared_mutex> lock(db_mutex); // Read-only lock!
    
    auto it = user_history.find(user_id);
    if (it == user_history.end()) {
        return "(nil)\r\n";
    }

    // Format: "lat,lon,timestamp;lat,lon,timestamp;"
    std::string result = "+HISTORY ";
    for (const auto& txn : it->second->second) {
        result += std::to_string(txn.lat) + "," + std::to_string(txn.lon) + "," + std::to_string(txn.timestamp) + ";";
    }
    return result + "\r\n";
}

std::string Database::getSyndicate(const std::string& merchant_id) {
    std::shared_lock<std::shared_mutex> lock(db_mutex); // Read-only lock!
    
    auto it = merchant_to_users.find(merchant_id);
    if (it == merchant_to_users.end()) {
        return "(nil)\r\n";
    }

    int total_users = it->second.size();
    std::string compromised_list = "";
    int compromised_count = 0;

    for (const std::string& user_id : it->second) {
        if (compromised_cards.find(user_id) != compromised_cards.end() && compromised_cards.at(user_id) > 0) {
            compromised_list += user_id + ",";
            compromised_count++;
        }
    }

    // Format: "+SYNDICATE TOTAL:5 COMPROMISED:2 LIST:tok_1,tok_2,"
    return "+SYNDICATE TOTAL:" + std::to_string(total_users) + 
           " COMPROMISED:" + std::to_string(compromised_count) + 
           " LIST:" + compromised_list + "\r\n";
}