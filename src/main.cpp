#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <unordered_map>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>

const int PORT = 6379;

// --- THE CORE DATABASE ---
// This Hash Map is our actual "Database". It lives entirely in RAM.
std::unordered_map<std::string, std::string> database;

// --- THE PARSER ---
// Takes a raw network string like "SET name Rahul\n" and turns it into ["SET", "name", "Rahul"]
std::vector<std::string> parseInput(const std::string& input) {
    std::vector<std::string> tokens;
    std::stringstream ss(input);
    std::string word;
    
    // ss >> word automatically splits by spaces and ignores newlines (\n)
    while (ss >> word) {
        tokens.push_back(word);
    }
    return tokens;
}

int main() {
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

        // A buffer to hold the raw bytes coming from the network
        char buffer[1024] = {0};

        // --- THE COMMAND LOOP ---
        // Keep reading from this client until they disconnect
        while (true) {
            memset(buffer, 0, sizeof(buffer)); // Clear buffer before reading
            
            // Read data from the socket
            ssize_t bytes_read = read(client_fd, buffer, sizeof(buffer) - 1);
            
            // If bytes_read is 0 or less, the client closed the connection
            if (bytes_read <= 0) {
                std::cout << "[INFO] Client disconnected." << std::endl;
                break;
            }

            std::string raw_input(buffer);
            std::vector<std::string> command = parseInput(raw_input);

            // If the user just hit Enter without typing anything
            if (command.empty()) continue; 

            std::string action = command[0];
            std::string response = "";

            // --- THE EXECUTION ENGINE ---
            if (action == "SET" && command.size() >= 3) {
                std::string key = command[1];
                std::string value = command[2];
                database[key] = value; // Saving to RAM!
                response = "+OK\r\n";
            } 
            else if (action == "GET" && command.size() >= 2) {
                std::string key = command[1];
                if (database.find(key) != database.end()) {
                    response = "\"" + database[key] + "\"\r\n"; // Found it
                } else {
                    response = "(nil)\r\n"; // Key doesn't exist
                }
            } 
            else if (action == "DEL" && command.size() >= 2) {
                std::string key = command[1];
                database.erase(key);
                response = "+OK\r\n";
            } 
            else {
                response = "-ERROR Unknown command or incorrect arguments\r\n";
            }

            // Send the response back over the network
            send(client_fd, response.c_str(), response.length(), 0);
        }

        close(client_fd);
    }

    close(server_fd);
    return 0;
}