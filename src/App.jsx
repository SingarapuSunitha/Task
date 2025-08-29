import React, { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Marker,
  ZoomControl,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Helpers
function colorForMag(m) {
  if (m === null || m === undefined) return "#999999";
  if (m < 4.0) return "#2e7d32"; // green
  if (m < 6.0) return "#ff9800"; // orange
  return "#d32f2f"; // red
}

function radiusForMag(m) {
  if (!isFinite(m)) return 4;
  return Math.max(4, 3 + m * 2);
}

// Click to recenter map
function ClickToCenter({ setCenter }) {
  useMapEvents({
    click(e) {
      setCenter([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// Format date for API
function toIso(d) {
  return d.toISOString().slice(0, 19) + "Z"; // ✅ add Z to keep UTC
}

export default function App() {
  const [quakes, setQuakes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  // Map state
  const [center, setCenter] = useState([20, 0]);
  const [zoom, setZoom] = useState(2);

  // Filters
  const [hours, setHours] = useState(24);
  const [minMag, setMinMag] = useState(0);

  const autoRefreshRef = useRef(null);

  // Build USGS URL dynamically
  const buildUrl = (hrs, minMag) => {
    const end = new Date();
    const start = new Date(end.getTime() - hrs * 60 * 60 * 1000);
    return `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${toIso(
      start
    )}&endtime=${toIso(end)}&minmagnitude=${minMag}`;
  };

  // Fetch earthquakes
  async function fetchQuakes() {
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl(hours, minMag);
      console.log("Fetching:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Network response not ok");
      const data = await res.json();
      setQuakes(data.features || []);
      console.log("Fetched", data.features?.length || 0, "quakes");
    } catch (err) {
      console.error(err);
      setError("Failed to fetch earthquake data.");
    } finally {
      setLoading(false);
    }
  }

  // initial + auto-refresh
  useEffect(() => {
    fetchQuakes();
    autoRefreshRef.current = setInterval(fetchQuakes, 1000 * 60 * 5);
    return () => clearInterval(autoRefreshRef.current);
  }, []);

  // geolocation
  useEffect(() => {
    if (!navigator.geolocation) return;
    let mounted = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mounted) return;
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setUserLocation([lat, lon]);
      },
      (err) => {
        console.warn("Geolocation error:", err?.message);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
    return () => (mounted = false);
  }, []);

  return (
    <div className="app-root">
      {/* Header */}
      <header className="topbar">
        <div className="title">🌍 Earthquake Visualizer — Last {hours} hrs</div>

        <div className="controls">
          <input
            type="number"
            min="1"
            max="720"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="input"
            title="Number of hours back from now"
          />
          <select
            value={minMag}
            onChange={(e) => setMinMag(Number(e.target.value))}
            className="input"
            title="Minimum magnitude"
          >
            <option value={0}>All magnitudes</option>
            <option value={2.5}>≥ 2.5</option>
            <option value={4.5}>≥ 4.5</option>
            <option value={6.0}>≥ 6.0</option>
          </select>
          <button className="btn" onClick={fetchQuakes}>
            ⟳ Apply
          </button>

          <button
            className="btn"
            onClick={() => {
              if (userLocation) {
                setCenter(userLocation);
                setZoom(5);
              } else {
                alert("User location not available.");
              }
            }}
          >
            📍 My Location
          </button>
        </div>
      </header>

      {/* Main Map */}
      <main className="map-area">
        {loading && <div className="status">Loading earthquakes…</div>}
        {error && <div className="status error">{error}</div>}
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClickToCenter setCenter={setCenter} />

          {/* Earthquake markers */}
          {quakes.map((f) => {
            const id = f.id;
            const props = f.properties || {};
            const coords = f.geometry?.coordinates || [];
            const lon = coords[0];
            const lat = coords[1];
            const depth = coords[2];
            const mag = props.mag;
            const place = props.place || "Unknown location";
            const time = props.time ? new Date(props.time) : null;
            if (lat === undefined || lon === undefined) return null;

            return (
              <CircleMarker
                key={id}
                center={[lat, lon]}
                radius={radiusForMag(mag)}
                pathOptions={{
                  color: colorForMag(mag),
                  fillColor: colorForMag(mag),
                  fillOpacity: 0.8,
                  weight: 1,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 220 }}>
                    <strong>{place}</strong>
                    <div>Magnitude: {mag ?? "N/A"}</div>
                    <div>Depth: {depth ?? "N/A"} km</div>
                    <div>Time: {time ? time.toLocaleString() : "N/A"}</div>
                    {props.url && (
                      <div style={{ marginTop: 6 }}>
                        <a href={props.url} target="_blank" rel="noreferrer">
                          USGS Details →
                        </a>
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

          {/* User location */}
          {userLocation && (
            <Marker
              position={userLocation}
              icon={L.divIcon({
                className: "user-location-icon",
                html: `<div class="user-dot" title="Your location"></div>`,
                iconSize: [16, 16],
              })}
            >
              <Popup>Your Location</Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Legend */}
        <aside className="legend">
          <h4>Legend</h4>
          <div className="legend-item">
            <span className="swatch" style={{ background: colorForMag(2) }} />
            <span>Small (&lt; 4)</span>
          </div>
          <div className="legend-item">
            <span className="swatch" style={{ background: colorForMag(5) }} />
            <span>Medium (4–6)</span>
          </div>
          <div className="legend-item">
            <span className="swatch" style={{ background: colorForMag(7) }} />
            <span>Strong (≥ 6)</span>
          </div>
          <div className="legend-item">
            <span className="swatch user" />
            <span>Your Location</span>
          </div>
          <div className="meta">
            <small>
              Data: USGS API. Auto-refresh every 5 min. Filters: Hours + MinMag.
            </small>
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div>Built with React + Leaflet • Earthquake data © USGS</div>
      </footer>
    </div>
  );
}
