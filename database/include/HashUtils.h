#ifndef HASH_UTILS_H
#define HASH_UTILS_H

#include <string>
#include <cstdint>

// Industry standard FNV-1a Hash (Fast and excellent distribution)
inline uint64_t fnv1a_hash(const std::string& text) {
    uint64_t hash = 14695981039346656037ull;
    for (char c : text) {
        hash ^= static_cast<uint64_t>(c);
        hash *= 1099511628211ull;
    }
    return hash;
}

// Famous DJB2 Hash (Created by Dan Bernstein)
inline uint64_t djb2_hash(const std::string& text) {
    uint64_t hash = 5381;
    for (char c : text) {
        hash = ((hash << 5) + hash) + c; // hash * 33 + c
    }
    return hash;
}

#endif