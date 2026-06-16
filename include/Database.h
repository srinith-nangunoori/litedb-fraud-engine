#ifndef DATABASE_H
#define DATABASE_H

#include <string>
#include <unordered_map>
#include <vector>
#include <mutex>

class Database {
private:
    std::unordered_map<std::string, std::string> database;
    void appendToLog(const std::string& action, const std::string& key, const std::string& value);
    void loadFromLog();
    std::mutex db_mutex;
public:
    Database(); // Constructor
    std::string set(const std::string& key, const std::string& value);
    std::string get(const std::string& key);
    std::string del(const std::string& key);
};

// Helper function to parse inputs (declared here so both database and main can see it)
std::vector<std::string> parseInput(const std::string& input);

#endif