#ifndef GEO_UTILS_H
#define GEO_UTILS_H

#include <cmath>

const double EARTH_RADIUS_KM = 6371.0;

// Convert degrees to radians
inline double toRadians(double degree) {
    return degree * (M_PI / 180.0);
}

// Haversine formula to calculate distance between two lat/lon points
inline double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    double dLat = toRadians(lat2 - lat1);
    double dLon = toRadians(lon2 - lon1);

    lat1 = toRadians(lat1);
    lat2 = toRadians(lat2);

    double a = std::pow(std::sin(dLat / 2), 2) +
               std::pow(std::sin(dLon / 2), 2) * std::cos(lat1) * std::cos(lat2);
    
    double c = 2 * std::asin(std::sqrt(a));
    return EARTH_RADIUS_KM * c;
}

#endif