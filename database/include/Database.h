#ifndef DATABASE_H
#define DATABASE_H

#include <chrono>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <shared_mutex>
#include <list>
#include <deque>
#include <utility>
#include "HashUtils.h"
#include "GeoUtils.h"

// The Bloom Filter Class
class BloomFilter {
private:
    std::vector<bool> bit_array;
    size_t num_bits;
    size_t num_hashes;

public:
    BloomFilter(size_t expected_items = 100000, double false_positive_rate = 0.01);
    void add(const std::string& item);
    bool mightContain(const std::string& item);
};

// Custom data type for a Credit Card Swipe
struct Transaction {
    std::string merchant_id;
    double lat;
    double lon;
    uint64_t timestamp;
};

// The Main Database Engine
class Database {
private:
    const size_t MAX_CAPACITY = 100000;
    
    // Security Modules
    BloomFilter blacklist;
    std::unordered_set<std::string> allowlist;

    // Velocity LRU Cache: UserID -> Queue of last 5 Transactions
    std::list<std::pair<std::string, std::deque<Transaction>>> lru_list;
    std::unordered_map<std::string, decltype(lru_list)::iterator> user_history;

    // --- The Graph Engine Memory ---
    std::unordered_map<std::string, std::unordered_set<std::string>> merchant_to_users;
    std::unordered_map<std::string, int> compromised_cards;
    // NEW: The Crime Scene Evidence Box (MerchantID -> List of Hacker Transactions)
    std::unordered_map<std::string, std::vector<Transaction>> crime_scenes;
    // NEW: Tracks the exact timestamp a merchant last processed a swipe
    std::unordered_map<std::string, uint64_t> merchant_last_active;
    // NEW: Tracks how many times a hacker tried to cash-out at this merchant
    std::unordered_map<std::string, int> cashout_attempts;

    std::shared_mutex db_mutex;
    // --- The Asynchronous AOF Buffers ---
    std::vector<std::string> active_aof_buffer;
    std::vector<std::string> flush_aof_buffer;
    std::mutex aof_mutex; // A tiny, separate lock just for swapping buffers

    // Helper functions
    void appendToLog(const std::string& command_str);
    void loadFromLog();

    std::unordered_set<int> active_sockets;
    std::vector<std::string> caught_syndicates;

    // --- RDB Snapshot Engine ---
    void saveSnapshotRDB();
    void loadSnapshotRDB();
    
    // Helper to serialize/deserialize a Transaction struct
    std::string serializeTransaction(const Transaction& txn);
    Transaction deserializeTransaction(const std::string& data);

public:
    Database(); 
    
    // Admin Commands
    std::string blacklistMerchant(const std::string& merchant);
    std::string whitelistMerchant(const std::string& merchant);

    // The Core Business Logic Command (Notice the is_replay flag!)
    std::string processSwipe(const std::string& user_id, const std::string& merchant_id, double lat, double lon, uint64_t timestamp, bool is_replay = false);

    // The Background Graph Analyzer
    void runGraphAnalysis();

    void registerSocket(int fd);
    void deregisterSocket(int fd);

    // Data Retrieval Commands (For the UI)
    std::string getHistory(const std::string& user_id);
    std::string getSyndicate(const std::string& merchant_id);
    // NEW: Fetch the Crime Scene locations for a specific merchant
    std::string getCrimeScenes(const std::string& merchant_id);

    std::string getAllSyndicates();

    // The Background Snapshot Worker
    void runSnapshotThread();
    void runAofFlusherThread(); // The new background disk writer!
};

// Helper function to parse inputs
std::vector<std::string> parseInput(const std::string& input);

#endif