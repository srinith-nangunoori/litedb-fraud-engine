#include "Database.h"
#include <iostream>
#include <fstream>
#include <sstream>

// Constructor
Database::Database() {
    std::cout << "[INFO] Initializing Database..." << std::endl;
    loadFromLog();
}

// Append logs to disk (WAL)
void Database::appendToLog(const std::string& action, const std::string& key, const std::string& value) {
    std::ofstream file("litedb.aof", std::ios::app);
    if (!file.is_open()) {
        std::cerr << "[ERROR] Could not open log file for writing!" << std::endl;
        return;
    }

    if (action == "DEL") {
        file << action << " " << key << "\n";
    } else {
        file << action << " " << key << " " << value << "\n";
    }
    file.close();
}

// Replay logs on startup (The Replay Engine)
void Database::loadFromLog() {
    std::ifstream file("litedb.aof", std::ios::in);
    if (!file.is_open()) {
        std::cout << "[INFO] No backup file found. Starting fresh with an empty database." << std::endl;
        return;
    }

    std::string line;
    while (std::getline(file, line)) {
        std::vector<std::string> tokens = parseInput(line);
        if (tokens.empty()) continue;

        // Use our internal helpers so we don't trigger duplicate logging!
        if (tokens[0] == "SET" && tokens.size() >= 3) {
            setInternal(tokens[1], tokens[2]);
        } else if (tokens[0] == "DEL" && tokens.size() >= 2) {
            delInternal(tokens[1]);
        }
    }
    file.close();
    std::cout << "[INFO] Database state reloaded successfully. Total items: " << database.size() << std::endl;
}

// Private LRU set helper
void Database::setInternal(const std::string& key, const std::string& value) {
    auto it = database.find(key);
    if (it != database.end()) {
        // Key exists: Update value and move to front (Most Recently Used)
        auto list_iterator = it->second;
        list_iterator->second = value;
        lru_list.splice(lru_list.begin(), lru_list, list_iterator);
    } else {
        // Key does not exist: Check capacity
        if (database.size() >= MAX_CAPACITY) {
            // Evict Least Recently Used (back of the list)
            std::string oldest_key = lru_list.back().first;
            database.erase(oldest_key);
            lru_list.pop_back();
            appendToLog("DEL", oldest_key, ""); // Keep log in sync
            std::cout << "[INFO] Cache Full! Evicted oldest key: " << oldest_key << std::endl;
        }
        // Insert new item at the front
        lru_list.push_front({key, value});
        database[key] = lru_list.begin();
    }
}

// Private LRU delete helper
void Database::delInternal(const std::string& key) {
    auto it = database.find(key);
    if (it != database.end()) {
        auto list_iterator = it->second;
        lru_list.erase(list_iterator);
        database.erase(key);
    }
}

// Public API: SET
std::string Database::set(const std::string& key, const std::string& value) {
    std::unique_lock<std::shared_mutex> lock(db_mutex); 
    setInternal(key, value);
    appendToLog("SET", key, value);
    return "+OK\r\n";
}

// Public API: GET
std::string Database::get(const std::string& key) {
    std::shared_lock<std::shared_mutex> lock(db_mutex);

    auto it = database.find(key);
    if (it == database.end()) {
        return "(nil)\r\n";
    }

    auto list_iterator = it->second;
    // Move to front (Most Recently Used)
    lru_list.splice(lru_list.begin(), lru_list, list_iterator);
    return list_iterator->second + "\r\n";
}

// Public API: DEL
std::string Database::del(const std::string& key) {
    std::unique_lock<std::shared_mutex> lock(db_mutex); 
    auto it = database.find(key);
    if (it != database.end()) {
        delInternal(key);
        appendToLog("DEL", key, "");
        return "+OK\r\n";
    }
    return "(nil)\r\n";
}

// Helper parsing function implementation
std::vector<std::string> parseInput(const std::string& input) {
    std::vector<std::string> tokens;
    std::stringstream ss(input);
    std::string word;    
    while (ss >> word) {
        tokens.push_back(word);
    }
    return tokens;
}