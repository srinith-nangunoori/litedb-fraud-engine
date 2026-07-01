#include "../include/Database.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <sys/socket.h>
#include <thread>

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
    loadSnapshotRDB();
    loadFromLog();
}

// --- ASYNCHRONOUS LOGGER (RAM Buffer) ---
void Database::appendToLog(const std::string& command_str) {
    // We lock a tiny, separate mutex just for the AOF buffer so we don't block the main DB!
    std::lock_guard<std::mutex> aof_lock(aof_mutex);
    active_aof_buffer.push_back(command_str);
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

// ─────────────────────────────────────────────────────────────
// RDB SNAPSHOT ENGINE (Serialization & Deserialization)
// ─────────────────────────────────────────────────────────────

std::string Database::serializeTransaction(const Transaction& txn) {
    // Convert to a flat string: "merchant_id,lat,lon,timestamp"
    return txn.merchant_id + "," + std::to_string(txn.lat) + "," + 
           std::to_string(txn.lon) + "," + std::to_string(txn.timestamp);
}

Transaction Database::deserializeTransaction(const std::string& data) {
    std::stringstream ss(data);
    std::string item;
    std::vector<std::string> parts;
    while (std::getline(ss, item, ',')) {
        parts.push_back(item);
    }
    return { parts[0], std::stod(parts[1]), std::stod(parts[2]), std::stoull(parts[3]) };
}

void Database::saveSnapshotRDB() {
    // We lock the database completely so memory doesn't change while we save it!
    std::unique_lock<std::shared_mutex> lock(db_mutex);

    std::ofstream file("litedb.rdb", std::ios::trunc); // trunc overwrites the file
    if (!file.is_open()) return;

    // 1. Save the Bloom Filter (Caught Syndicates)
    file << "[SYNDICATES]\n";
    for (const std::string& merch : caught_syndicates) {
        file << merch << "\n";
    }

    // 2. Save the User History (The LRU Cache & Velocity Data)
    file << "[HISTORY]\n";
    for (const auto& pair : user_history) {
        const std::string& user_id = pair.first;
        const auto& queue = pair.second->second;
        
        file << "USER:" << user_id << "\n";
        for (const Transaction& txn : queue) {
            file << serializeTransaction(txn) << "\n";
        }
    }

    file.close();

    // 3. WIPE THE AOF LOG! 
    // Since everything is safely in the RDB snapshot, the AOF log is redundant.
    std::ofstream aof_file("litedb.aof", std::ios::trunc);
    aof_file.close();

    std::cout << "\n[SYSTEM] RDB Snapshot Saved successfully. AOF log cleared.\n> ";
}

void Database::loadSnapshotRDB() {
    std::ifstream file("litedb.rdb", std::ios::in);
    if (!file.is_open()) return;

    std::cout << "[INFO] Loading RDB Snapshot into Memory..." << std::endl;

    std::string line;
    std::string current_section = "";
    std::string current_user = "";

    while (std::getline(file, line)) {
        if (line.empty()) continue;

        if (line == "[SYNDICATES]") { current_section = "SYNDICATES"; continue; }
        if (line == "[HISTORY]") { current_section = "HISTORY"; continue; }

        if (current_section == "SYNDICATES") {
            // Restore the Bloom Filter and UI list!
            blacklist.add(line);
            caught_syndicates.push_back(line);
        } 
        else if (current_section == "HISTORY") {
            if (line.substr(0, 5) == "USER:") {
                current_user = line.substr(5);
                // Create the user in the LRU list
                lru_list.push_front({current_user, std::deque<Transaction>()});
                user_history[current_user] = lru_list.begin();
            } else {
                // Restore the transaction to the user's queue
                Transaction txn = deserializeTransaction(line);
                user_history[current_user]->second.push_back(txn);
            }
        }
    }
    file.close();
}

// Background Thread Runner
void Database::runSnapshotThread() {
    while (true) {
        // Run a snapshot every 30 seconds
        std::this_thread::sleep_for(std::chrono::seconds(30));
        saveSnapshotRDB();
    }
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

    // 5. MEASURE ASYNC BUFFER PUSH TIME (Was T_DISK, now T_RAM_BUFFER)
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

// --- BACKGROUND GRAPH ANALYZER (V2: Ratio-Based Heuristics) ---
void Database::runGraphAnalysis() {
    std::unique_lock<std::shared_mutex> lock(db_mutex);
    int new_fraud_rings_found = 0;

    for (const auto& pair : merchant_to_users) {
        const std::string& merchant_id = pair.first;
        const std::unordered_set<std::string>& users = pair.second;

        if (allowlist.find(merchant_id) != allowlist.end()) continue;
        if (blacklist.mightContain(merchant_id)) continue;

        double total_users = users.size();
        double compromised_user_count = 0;

        for (const std::string& user_id : users) {
            if (compromised_cards.find(user_id) != compromised_cards.end() && compromised_cards.at(user_id) > 0) {
                compromised_user_count++;
            }
        }

        // --- THE V2 AI LOGIC: RATIO & THRESHOLD MATH ---
        // Rule 1: We need at least 3 distinct users to make a fair statistical judgment.
        // Rule 2: If more than 30% of the customers are compromised cards, it is a Fraud Ring.
        
        if (total_users >= 3) {
            double fraud_ratio = compromised_user_count / total_users;
            
            if (fraud_ratio > 0.30) {
                blacklist.add(merchant_id);
                caught_syndicates.push_back(merchant_id);
                appendToLog("BLACKLIST " + merchant_id); 
                
                std::cout << "\n[ALERT] GRAPH ENGINE DETECTED FRAUD RING! Auto-Blacklisted: " << merchant_id 
                          << " (Ratio: " << (fraud_ratio * 100) << "%)\n> ";
                
                // Broadcast to WebSockets
                std::string alert_msg = "[ALERT] Fraud Ring Detected: " + merchant_id + "\r\n";
                for (int fd : active_sockets) {
                    send(fd, alert_msg.c_str(), alert_msg.length(), 0);
                }

                new_fraud_rings_found++;
            }
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

std::string Database::getAllSyndicates() {
    std::shared_lock<std::shared_mutex> lock(db_mutex);
    if (caught_syndicates.empty()) return "(nil)\r\n";
    
    std::string result = "+SYNDICATES ";
    for (const std::string& m : caught_syndicates) {
        result += m + ",";
    }
    return result + "\r\n";
}


// --- ASYNCHRONOUS BACKGROUND AOF FLUSHER ---
void Database::runAofFlusherThread() {
    while (true) {
        // Wait 1 second between disk flushes
        std::this_thread::sleep_for(std::chrono::seconds(1));

        {
            // 1. Lock the AOF mutex briefly to swap pointers!
            std::lock_guard<std::mutex> aof_lock(aof_mutex);
            if (active_aof_buffer.empty()) continue; // Nothing to write
            
            // Swap takes nanoseconds. Now active_buffer is empty and ready for new live traffic!
            std::swap(active_aof_buffer, flush_aof_buffer);
        } // Lock is automatically released here!

        // 2. We write to the SSD at our own pace WITHOUT holding any locks!
        std::ofstream file("litedb.aof", std::ios::app);
        if (file.is_open()) {
            for (const std::string& log : flush_aof_buffer) {
                file << log << "\n";
            }
            file.close();
        }
        
        // Clear the flush buffer so it's ready for the next cycle
        flush_aof_buffer.clear();
    }
}