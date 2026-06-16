#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <unordered_map>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <fstream>

std::vector<std::string> parseInput(const std::string& input) {
    std::vector<std::string> tokens;
    std::stringstream ss(input);
    std::string word;    
    while (ss >> word) {
        tokens.push_back(word);
    }
    return tokens;
}
class Database {
private:
    std::unordered_map<std::string, std::string> database;

    // Helper method to write database changes to the hard drive
    void appendToLog(const std::string& action, const std::string& key, const std::string& value) {
        std::ofstream file("litedb.aof", std::ios::app);
        if (!file.is_open()) {
            std::cerr << "[ERROR] Could not open log file for writing!" << std::endl;
            return;
        }

        // Clean logging formatting
        if (action == "DEL") {
            file << action << " " << key << "\n";
        } else {
            file << action << " " << key << " " << value << "\n";
        }
        file.close();
    }

    void loadFromLog(){
        std::ifstream file("litedb.aof", std::ios::in);
        if (!file.is_open()) {
            std::cout << "[INFO] No backup file found. Starting fresh with an empty database." << std::endl;
            return;
        }
        std::string line;
        std::vector<std::string>tokens ;
        while(std::getline(file , line)){
            tokens = parseInput(line) ;
            if (tokens.empty()) continue;
            if(tokens[0] == "SET"){
                database[tokens[1]] = tokens[2];
            }
            else if(tokens[0] =="DEL"){
                database.erase(tokens[1]);
            }
        }
        file.close();
    }

public:
    // Constructor (Runs automatically when 'Database db;' is called)
    Database() {
        std::cout << "[INFO] Initializing Database..." << std::endl;
        loadFromLog();
    }

    std::string set(const std::string& key, const std::string& value) {
        database[key] = value;
        appendToLog("SET", key, value);
        return "+OK\r\n";
    }

    std::string get(const std::string& key) {
        if (database.find(key) != database.end()) {
            return database[key] + "\r\n";
        }
        return "(nil)\r\n";
    }

    std::string del(const std::string& key) {
        if (database.find(key) != database.end()) {
            database.erase(key);
            appendToLog("DEL", key, "");
            return "+OK\r\n";
        }
        return "(nil)\r\n"; // If key didn't exist, return nil
    }
};

const int PORT = 6379;

// Helper to tokenize raw strings

int main() {
    Database db; // Calls the constructor automatically!
    
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    bind(server_fd, (struct sockaddr*)&address, sizeof(address));
    listen(server_fd, 5);

    std::cout << "[INFO] LiteDB Server started on port " << PORT << std::endl;

    while (true) {
        sockaddr_in client_address;
        socklen_t client_addr_len = sizeof(client_address);
        
        int client_fd = accept(server_fd, (struct sockaddr*)&client_address, &client_addr_len);
        if (client_fd < 0) continue;

        std::cout << "[INFO] Client connected!" << std::endl;

        char buffer[1024] = {0};

        while (true) {
            memset(buffer, 0, sizeof(buffer));
            ssize_t bytes_read = read(client_fd, buffer, sizeof(buffer) - 1);
            if (bytes_read <= 0) {
                std::cout << "[INFO] Client disconnected." << std::endl;
                break;
            }

            std::string raw_input(buffer);
            std::vector<std::string> command = parseInput(raw_input);

            if (command.empty()) continue; 

            std::string action = command[0];
            std::string response = "";

            if (action == "SET" && command.size() >= 3) {
                response = db.set(command[1], command[2]);
            } 
            else if (action == "GET" && command.size() >= 2) {
                response = db.get(command[1]);
            } 
            else if (action == "DEL" && command.size() >= 2) {
                response = db.del(command[1]);
            } 
            else {
                response = "-ERROR Unknown command or incorrect arguments\r\n";
            }
            send(client_fd, response.c_str(), response.length(), 0);
        }
        close(client_fd);
    }
    close(server_fd);
    return 0;
}