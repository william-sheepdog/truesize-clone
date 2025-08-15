// script.js for True Size of Countries

// Initialize the map and set its view
const map = L.map('map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 2,
    maxBounds: [[-90, -180], [90, 180]] // Prevent user from panning too far
});

// Add the base map tile layer from OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// --- Global Variables ---
let countriesLayer; // To hold the main GeoJSON layer of all countries
const selectedCountries = new Map(); // To track the draggable country layers and their data
const countryNameMap = new Map(); // To map official country names to their layers

// --- Main Logic ---

// Fetch the GeoJSON data for all countries
fetch('countries.geojson')
    .then(response => response.json())
    .then(data => {
        // Create a GeoJSON layer with custom styling and behavior
        countriesLayer = L.geoJSON(data, {
            style: feature => ({
                fillColor: '#3388ff',
                weight: 1,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            }),
            onEachFeature: (feature, layer) => {
                // Store the country name for searching
                const countryName = feature.properties.ADMIN;
                countryNameMap.set(countryName.toLowerCase(), layer);

                // Add a click event listener to each country
                layer.on('click', () => {
                    selectCountry(feature, layer);
                });
            }
        }).addTo(map);
    })
    .catch(error => console.error('Error loading country data:', error));

/**
 * Handles the selection of a country.
 * @param {object} feature - The GeoJSON feature of the selected country.
 * @param {L.Layer} layer - The Leaflet layer of the selected country.
 */
function selectCountry(feature, layer) {
    const countryName = feature.properties.ADMIN;

    // Prevent re-selecting the same country
    if (selectedCountries.has(countryName)) {
        return;
    }

    // Calculate the true geodesic area of the country in square meters
    const latlngs = layer.getLatLngs();
    const trueArea = calculateGeodesicArea(latlngs);

    // Create a new, draggable polygon for the selected country
    const draggablePolygon = L.polygon(latlngs, {
        color: getRandomColor(),
        weight: 2,
        fillOpacity: 0.8,
        // Custom property to make it draggable
    }).addTo(map);

    // Enable dragging on the new polygon
    enableDragging(draggablePolygon);

    // Store the draggable layer and its true area
    selectedCountries.set(countryName, {
        layer: draggablePolygon,
        trueArea: trueArea
    });

    // Attach the scaling logic to the drag event
    draggablePolygon.on('drag', event => {
        const draggedLayer = event.target;
        rescalePolygon(draggedLayer, trueArea);
    });

    // Initial rescale in case it's created at a different latitude than its data
    rescalePolygon(draggablePolygon, trueArea);
}

/**
 * Rescales a polygon to maintain its true area as it's dragged across latitudes.
 * @param {L.Polygon} layer - The polygon layer to rescale.
 * @param {number} trueArea - The true geodesic area of the polygon in square meters.
 */
function rescalePolygon(layer, trueArea) {
    const center = layer.getCenter();
    const currentProjectedArea = calculateGeodesicArea(layer.getLatLngs());

    // Avoid division by zero
    if (currentProjectedArea === 0) return;

    // The scale factor is the square root of the ratio of true area to current projected area
    const scaleFactor = Math.sqrt(trueArea / currentProjectedArea);

    // Get the current coordinates
    const latlngs = layer.getLatLngs()[0];

    // Create new scaled coordinates relative to the center
    const scaledLatLngs = latlngs.map(latlng => {
        const newLat = center.lat + (latlng.lat - center.lat) * scaleFactor;
        const newLng = center.lng + (latlng.lng - center.lng) * scaleFactor;
        return L.latLng(newLat, newLng);
    });

    // Set the new coordinates for the polygon
    layer.setLatLngs(scaledLatLngs);
}


// --- Utility Functions ---

/**
 * Calculates the geodesic area of a polygon.
 * Handles both single and multi-polygon shapes.
 * @param {Array} latlngs - The array of LatLngs from a Leaflet layer.
 * @returns {number} The total area in square meters.
 */
function calculateGeodesicArea(latlngs) {
    if (!latlngs || latlngs.length === 0) {
        return 0;
    }

    // Handle nested arrays for multi-polygons
    if (Array.isArray(latlngs[0][0])) {
        let totalArea = 0;
        latlngs.forEach(polygon => {
            totalArea += L.GeometryUtil.geodesicArea(polygon[0]);
        });
        return totalArea;
    } else {
        return L.GeometryUtil.geodesicArea(latlngs[0]);
    }
}


/**
 * A simple drag handler for Leaflet polygons.
 * @param {L.Polygon} layer - The layer to make draggable.
 */
function enableDragging(layer) {
    let isDragging = false;
    let previousLatLng;

    layer.on('mousedown', e => {
        isDragging = true;
        previousLatLng = e.latlng;
        map.dragging.disable(); // Disable map dragging while moving the polygon
    });

    map.on('mousemove', e => {
        if (isDragging) {
            const latLngs = layer.getLatLngs()[0];
            const latDelta = e.latlng.lat - previousLatLng.lat;
            const lngDelta = e.latlng.lng - previousLatLng.lng;

            const newLatLngs = latLngs.map(latlng => {
                return L.latLng(latlng.lat + latDelta, latlng.lng + lngDelta);
            });

            layer.setLatLngs(newLatLngs);
            previousLatLng = e.latlng;
            layer.fire('drag', { latlng: e.latlng }); // Fire custom drag event
        }
    });

    map.on('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            map.dragging.enable();
        }
    });
}


/**
 * Generates a random vibrant color for the selected polygons.
 * @returns {string} A hex color code.
 */
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}


// --- Event Listeners for UI ---

// Clear Button
document.getElementById('clear-btn').addEventListener('click', () => {
    selectedCountries.forEach(country => {
        map.removeLayer(country.layer);
    });
    selectedCountries.clear();
});

// Search Input
document.getElementById('country-search').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (e.key === 'Enter' || e.inputType === 'insertReplacementText') { // Handle selection from datalist
        const layer = countryNameMap.get(searchTerm);
        if (layer) {
            selectCountry(layer.feature, layer);
            map.fitBounds(layer.getBounds()); // Zoom to the country
            e.target.value = ''; // Clear search bar
        }
    }
});

// Add autocomplete functionality to the search bar
const searchInput = document.getElementById('country-search');
const datalist = document.createElement('datalist');
datalist.id = 'country-list';
searchInput.setAttribute('list', 'country-list');
document.body.appendChild(datalist);

fetch('countries.geojson')
    .then(response => response.json())
    .then(data => {
        data.features.forEach(feature => {
            const option = document.createElement('option');
            option.value = feature.properties.ADMIN;
            datalist.appendChild(option);
        });
    });
