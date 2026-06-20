#ifndef DATABASE_H
#define DATABASE_H

#include <string>
#include <unordered_map>
#include <vector>
#include <shared_mutex>
#include <list>
#include <utility>

class Database {
private:
    std::list<std::pair<std::string, std::string>> lru_list;
    std::unordered_map<std::string, std::list<std::pair<std::string, std::string>>::iterator> database;
    void appendToLog(const std::string& action, const std::string& key, const std::string& value);
    void loadFromLog();
    std::shared_mutex db_mutex;
    const size_t MAX_CAPACITY = 5;
    void setInternal(const std::string& key, const std::string& value);
    void delInternal(const std::string& key);
public:
    Database(); // Constructor
    std::string set(const std::string& key, const std::string& value);
    std::string get(const std::string& key);
    std::string del(const std::string& key);
};

// Helper function to parse inputs (declared here so both database and main can see it)
std::vector<std::string> parseInput(const std::string& input);

#endif