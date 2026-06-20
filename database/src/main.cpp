#include "Database.h"
#include <iostream>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>
#include <thread>

void handleClient(int client_fd , Database& db){
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

const int PORT = 6379;

int main() {
    Database db;
    
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

        // Spawn a new thread for this client. 
        // We use std::ref(db) so all threads share the SAME database in memory!
        std::thread t(handleClient, client_fd, std::ref(db));

        // Detach the thread so it runs independently in the background
        t.detach();
    }
    close(server_fd);
    return 0;
}