#include <iostream>
#include <string>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <cstring>

const int PORT = 6379;

int main() {
    // 1. Create a socket
    // AF_INET = IPv4 protocol
    // SOCK_STREAM = TCP (reliable connection-oriented)
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        std::cerr << "Failed to create socket. Error: " << strerror(errno) << std::endl;
        return 1;
    }

    // Set socket options to reuse the address (prevents "Address already in use" errors on restart)
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        std::cerr << "setsockopt failed" << std::endl;
        close(server_fd);
        return 1;
    }

    // 2. Bind the socket to IP and Port
    sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY; // Listen on all network interfaces
    address.sin_port = htons(PORT);       // Convert port to network byte order (Big Endian)

    if (bind(server_fd, (struct sockaddr*)&address, sizeof(address)) < 0) {
        std::cerr << "Bind failed. Port " << PORT << " might be in use." << std::endl;
        close(server_fd);
        return 1;
    }

    // 3. Listen for incoming connections (max backlog queue size of 5)
    if (listen(server_fd, 5) < 0) {
        std::cerr << "Listen failed." << std::endl;
        close(server_fd);
        return 1;
    }

    std::cout << "[INFO] LiteDB Server started on port " << PORT << std::endl;
    std::cout << "[INFO] Waiting for incoming connections..." << std::endl;

    // 4. Accept a connection (Infinite loop to keep server running)
    while (true) {
        sockaddr_in client_address;
        socklen_t client_addr_len = sizeof(client_address);
        
        // This call blocks (waits) until a client connects
        int client_fd = accept(server_fd, (struct sockaddr*)&client_address, &client_addr_len);
        if (client_fd < 0) {
            std::cerr << "Failed to accept connection." << std::endl;
            continue;
        }

        std::cout << "[INFO] Client connected!" << std::endl;

        // Send a simple greeting back to the client
        std::string greeting = "+OK Welcome to LiteDB\r\n";
        send(client_fd, greeting.c_str(), greeting.length(), 0);

        // Close connection with the client for now
        close(client_fd);
        std::cout << "[INFO] Client disconnected." << std::endl;
    }

    // Close the server socket
    close(server_fd);
    return 0;
}