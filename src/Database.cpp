#include "Database.h"
#include <iostream>
#include <fstream>
#include <sstream>

// Constructor
Database::Database() {
    std::cout << "[INFO] Initializing Database..." << std::endl;
    loadFromLog();
}

// Append logs to disk
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

// Replay logs on startup
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

        if (tokens[0] == "SET" && tokens.size() >= 3) {
            database[tokens[1]] = tokens[2];
        } else if (tokens[0] == "DEL" && tokens.size() >= 2) {
            database.erase(tokens[1]);
        }
    }
    file.close();
}

std::string Database::set(const std::string& key, const std::string& value) {
    // 1. Lock the database so no other thread can enter
    std::unique_lock<std::shared_mutex> lock(db_mutex); 
    
    // 2. Safely modify the map and write to the file
    database[key] = value;
    appendToLog("SET", key, value);
    
    // 3. The lock is automatically released here when the function returns
    return "+OK\r\n";
}

std::string Database::get(const std::string& key) {
    std::shared_lock<std::shared_mutex> lock(db_mutex); 
    if (database.find(key) != database.end()) {
        return database[key] + "\r\n";
    }
    return "(nil)\r\n";
}

std::string Database::del(const std::string& key) {
    std::unique_lock<std::shared_mutex> lock(db_mutex); 
    if (database.find(key) != database.end()) {
        database.erase(key);
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