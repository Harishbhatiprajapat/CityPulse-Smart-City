import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Layers,
  Maximize2,
  Minimize2,
  Navigation,
  Car,
  Compass,
  AlertTriangle,
  Info,
  X,
  RefreshCw,
} from 'lucide-react';
import type { Zone, POIPlace, RouteResult, TrafficIncident, POICategory } from '@/types';
import { POI_CATEGORIES, getCategoryMeta } from '@/services/geoService';
import { getTrafficProviderConfig } from '@/services/trafficService';

interface LiveMapProps {
  zones: Zone[];
  selectedZoneId: number | null;
  onSelectZone: (id: number) => void;
  cityLabel: string;
  cityCoords: { lat: number; lng: number };
  poiPlaces?: POIPlace[];
  selectedPOI?: POIPlace | null;
  onSelectPOI?: (poi: POIPlace | null) => void;
  route?: RouteResult | null;
  trafficIncidents?: TrafficIncident[];
  tomtomKey?: string;
  onClearRoute?: () => void;
  heightClass?: string;
  onUserLocationDetected?: (coords: { lat: number; lng: number; accuracy?: number }) => void;
  disabledCategories?: Set<POICategory>;
  onToggleCategory?: (cat: POICategory) => void;
}

type BaseTileType = 'dark' | 'standard' | 'satellite';

const statusColor: Record<string, string> = {
  normal: '#10b981',
  watch: '#f59e0b',
  alert: '#ef4444',
};

function createZoneIcon(color: string, isPulsing: boolean, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 34 : 26;
  const ring = isPulsing
    ? `<div class="cp-pulse-ring" style="border-color:${color}"></div>`
    : '';
  return L.divIcon({
    className: 'cp-map-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        ${ring}
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
          <div style="width:${size * 0.35}px;height:${size * 0.35}px;border-radius:50%;background:white;"></div>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Creates category colored marker conforming to user specifications:
 * Hospitals: Red (#EF4444)
 * Police: Blue (#3B82F6)
 * Schools: Purple (#A855F7)
 * Hotels: Orange (#F97316)
 * Restaurants: Yellow (#EAB308)
 * Pharmacies: Pink (#EC4899)
 * Parks: Green (#22C55E)
 * Bus stations: Cyan (#06B6D4)
 * Railway stations: Indigo (#6366F1)
 * ATMs: Teal (#14B8A6)
 * Government: Dark blue (#1E40AF)
 * Other: Neutral gray (#6B7280)
 */
function createPOIIcon(category: POICategory | string, isSelected: boolean): L.DivIcon {
  const meta = getCategoryMeta(category as POICategory);
  const size = isSelected ? 38 : 30;
  const ring = isSelected
    ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:2.5px dashed ${meta.color};animation:spin 8s linear infinite;"></div>`
    : '';

  return L.divIcon({
    className: 'cp-map-marker',
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;cursor:pointer;">
        ${ring}
        <div style="width:${size}px;height:${size}px;border-radius:50%;background:${meta.color};border:2.5px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.52)}px;color:white;transition:transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
          <span>${meta.emoji}</span>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Distinct pulsing blue marker for current GPS location (#2563EB)
 */
function createGPSUserIcon(): L.DivIcon {
  return L.divIcon({
    className: 'cp-gps-user-marker',
    html: `
      <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;background:rgba(37,99,235,0.4);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;border:2px solid #2563EB;background:rgba(37,99,235,0.25);"></div>
        <div style="width:14px;height:14px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 0 12px rgba(37,99,235,0.85);"></div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function createIncidentIcon(): L.DivIcon {
  return L.divIcon({
    className: 'cp-map-marker',
    html: `
      <div style="width:28px;height:28px;border-radius:50%;background:#EF4444;border:2px solid white;box-shadow:0 2px 8px rgba(239,68,68,0.5);display:flex;align-items:center;justify-content:center;font-size:14px;">
        ⚠️
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function LiveMap({
  zones,
  selectedZoneId,
  onSelectZone,
  cityLabel,
  cityCoords,
  poiPlaces = [],
  selectedPOI = null,
  onSelectPOI,
  route = null,
  trafficIncidents = [],
  tomtomKey,
  onClearRoute,
  heightClass = 'h-[440px] sm:h-[500px]',
  onUserLocationDetected,
  disabledCategories,
  onToggleCategory,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Layer groups to prevent map recreation when toggling
  const baseTileLayerRef = useRef<L.TileLayer | null>(null);
  const trafficTileLayerRef = useRef<L.TileLayer | null>(null);
  const zoneLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const poiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const incidentsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gpsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeBaseTile, setActiveBaseTile] = useState<BaseTileType>('dark');
  const [showTrafficOverlay, setShowTrafficOverlay] = useState(false);
  const [showZonePolygons, setShowZonePolygons] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [activeIncident, setActiveIncident] = useState<TrafficIncident | null>(null);

  // GPS state
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const trafficConfig = getTrafficProviderConfig(tomtomKey);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [cityCoords.lat, cityCoords.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: true,
    });

    // Create Tile Layer (Esri Dark Gray Base default)
    const darkTileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    const baseLayer = L.tileLayer(darkTileUrl, {
      attribution:
        'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      maxNativeZoom: 16,
    }).addTo(map);

    baseTileLayerRef.current = baseLayer;

    // Create layer groups for markers
    zoneLayerGroupRef.current = L.layerGroup().addTo(map);
    poiLayerGroupRef.current = L.layerGroup().addTo(map);
    routeLayerGroupRef.current = L.layerGroup().addTo(map);
    incidentsLayerGroupRef.current = L.layerGroup().addTo(map);
    gpsLayerGroupRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Base Tile without recreating map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseTileLayerRef.current) {
      map.removeLayer(baseTileLayerRef.current);
    }

    let tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
    let attribution =
      'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    let maxNativeZoom = 16;

    if (activeBaseTile === 'standard') {
      tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      maxNativeZoom = 19;
    } else if (activeBaseTile === 'satellite') {
      tileUrl =
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      attribution =
        'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
      maxNativeZoom = 19;
    }

    const newBase = L.tileLayer(tileUrl, {
      attribution,
      maxZoom: 19,
      maxNativeZoom,
    }).addTo(map);

    newBase.on('tileerror', () => {
      if (activeBaseTile === 'dark') {
        console.warn('Dark tile server unresponsive, falling back to OpenStreetMap standard tiles.');
        newBase.setUrl('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
      }
    });

    baseTileLayerRef.current = newBase;
  }, [activeBaseTile]);

  // Toggle Traffic Tile Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (trafficTileLayerRef.current) {
      map.removeLayer(trafficTileLayerRef.current);
      trafficTileLayerRef.current = null;
    }

    if (showTrafficOverlay && trafficConfig.hasApiKey && trafficConfig.tileUrlTemplate) {
      const trafficLayer = L.tileLayer(trafficConfig.tileUrlTemplate, {
        attribution: trafficConfig.attribution,
        maxZoom: 19,
        opacity: 0.8,
      }).addTo(map);
      trafficTileLayerRef.current = trafficLayer;
    }
  }, [showTrafficOverlay, trafficConfig.hasApiKey, trafficConfig.tileUrlTemplate, trafficConfig.attribution]);

  // Center on city changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([cityCoords.lat, cityCoords.lng], 12, { animate: true });
  }, [cityCoords.lat, cityCoords.lng]);

  // Render Zone Markers & Polygons
  useEffect(() => {
    const group = zoneLayerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    zones.forEach((zone) => {
      const color = statusColor[zone.status];
      const isSelected = zone.id === selectedZoneId;
      const icon = createZoneIcon(color, zone.status === 'alert', isSelected);

      const marker = L.marker([zone.coords.lat, zone.coords.lng], { icon })
        .addTo(group)
        .bindTooltip(
          `<div style="font-weight:700;font-size:13px;color:#0F172A;">${zone.name}</div>
           <div style="font-size:11px;color:#475569;">Score: ${zone.severityScore}/100 · ${zone.status.toUpperCase()}</div>
           <div style="font-size:11px;color:#475569;">${zone.weather.value}</div>`,
          { direction: 'top', offset: [0, -12], className: 'cp-tooltip' }
        );

      marker.on('click', () => {
        onSelectZone(zone.id);
      });

      if (showZonePolygons && zone.polygon && zone.polygon.length > 2) {
        const polyCoords: [number, number][] = zone.polygon.map((p) => [p.lat, p.lng]);
        L.polygon(polyCoords, {
          color,
          weight: isSelected ? 2.5 : 1.5,
          opacity: 0.8,
          fillColor: color,
          fillOpacity: isSelected ? 0.2 : 0.08,
        })
          .addTo(group)
          .on('click', () => onSelectZone(zone.id));
      }
    });
  }, [zones, selectedZoneId, showZonePolygons, onSelectZone]);

  // Render POI Markers with category filtering
  useEffect(() => {
    const group = poiLayerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    poiPlaces.forEach((poi) => {
      if (disabledCategories && disabledCategories.has(poi.category)) {
        return; // Category filtered out by user
      }

      const isSelected = selectedPOI?.id === poi.id;
      const icon = createPOIIcon(poi.category, isSelected);

      const marker = L.marker([poi.latitude, poi.longitude], { icon })
        .addTo(group)
        .bindTooltip(
          `<div style="font-weight:700;font-size:12px;color:#0F172A;">${poi.name}</div>
           <div style="font-size:11px;color:#475569;">${poi.categoryLabel} · ${poi.distanceKm} km</div>`,
          { direction: 'top', offset: [0, -14], className: 'cp-tooltip' }
        );

      marker.on('click', () => {
        onSelectPOI?.(poi);
      });
    });
  }, [poiPlaces, selectedPOI, disabledCategories, onSelectPOI]);

  // Render Route Polyline & Endpoints
  useEffect(() => {
    const map = mapRef.current;
    const group = routeLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (route && route.coordinates.length > 1) {
      const poly = L.polyline(route.coordinates, {
        color: '#3B82F6',
        weight: 6,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(group);

      // Start pin
      const startCoord = route.coordinates[0];
      L.circleMarker(startCoord, {
        radius: 7,
        fillColor: '#22C55E',
        fillOpacity: 1,
        color: 'white',
        weight: 3,
      })
        .addTo(group)
        .bindTooltip(`<b>Start:</b> ${route.originName}`, { direction: 'top' });

      // Destination pin
      const endCoord = route.coordinates[route.coordinates.length - 1];
      L.circleMarker(endCoord, {
        radius: 8,
        fillColor: '#EF4444',
        fillOpacity: 1,
        color: 'white',
        weight: 3,
      })
        .addTo(group)
        .bindTooltip(`<b>End:</b> ${route.destinationName}`, { direction: 'top' });

      map.fitBounds(poly.getBounds().pad(0.2), { animate: true });
    }
  }, [route]);

  // Render Traffic Incidents
  useEffect(() => {
    const group = incidentsLayerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    trafficIncidents.forEach((inc) => {
      const icon = createIncidentIcon();
      const marker = L.marker([inc.latitude, inc.longitude], { icon })
        .addTo(group)
        .bindTooltip(`<b>${inc.type}</b><br/>${inc.description}`, { direction: 'top' });

      marker.on('click', () => {
        setActiveIncident(inc);
      });
    });
  }, [trafficIncidents]);

  // Render GPS User Position Marker & Accuracy Circle
  useEffect(() => {
    const group = gpsLayerGroupRef.current;
    if (!group) return;

    group.clearLayers();

    if (userCoords) {
      const icon = createGPSUserIcon();
      L.marker([userCoords.lat, userCoords.lng], { icon })
        .addTo(group)
        .bindTooltip(
          `<div style="font-weight:700;font-size:12px;color:#1E40AF;">Your GPS Location</div>
           <div style="font-size:10px;color:#64748B;">Lat: ${userCoords.lat.toFixed(5)}, Lng: ${userCoords.lng.toFixed(5)}</div>
           ${userCoords.accuracy ? `<div style="font-size:10px;color:#64748B;">Accuracy: ±${Math.round(userCoords.accuracy)}m</div>` : ''}`,
          { direction: 'top', offset: [0, -18] }
        );

      if (userCoords.accuracy && userCoords.accuracy < 2000) {
        L.circle([userCoords.lat, userCoords.lng], {
          radius: userCoords.accuracy,
          color: '#2563EB',
          fillColor: '#2563EB',
          fillOpacity: 0.1,
          weight: 1.5,
          dashArray: '4, 4',
        }).addTo(group);
      }
    }
  }, [userCoords]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const handleRecenter = () => {
    mapRef.current?.setView([cityCoords.lat, cityCoords.lng], 12, { animate: true });
  };

  /**
   * Geolocation Handler conforming to Requirement 5:
   * - Request browser location permission
   * - Obtain device coordinates
   * - Move map to user position
   * - Display distinct blue pulsing marker with accuracy radius
   * - Gracefully handle PERMISSION_DENIED, POSITION_UNAVAILABLE, TIMEOUT, insecure context
   * - Never silently substitute Jaipur or another city
   */
  const handleLocateMe = useCallback(() => {
    setGpsError(null);

    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported by your current browser.');
      return;
    }

    if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
      setGpsError('Geolocation requires a secure HTTPS connection or localhost context.');
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const coords = { lat: latitude, lng: longitude, accuracy };
        setUserCoords(coords);
        onUserLocationDetected?.(coords);
        mapRef.current?.setView([latitude, longitude], 14, { animate: true });
      },
      (err) => {
        setIsLocating(false);
        let errorMsg = 'Could not obtain device location.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMsg = 'Location permission was denied. Please allow location access in your browser address bar settings to use GPS.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMsg = 'GPS positioning is currently unavailable. Please verify device location services are turned on.';
            break;
          case err.TIMEOUT:
            errorMsg = 'Location request timed out. Please retry.';
            break;
        }
        setGpsError(errorMsg);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
    );
  }, [onUserLocationDetected]);

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-citynavy-border shadow-lg bg-white dark:bg-citynavy-card transition-all ${
        isFullScreen ? 'fixed inset-0 z-50 rounded-none h-screen' : heightClass
      }`}
    >
      {/* Map Header Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-citynavy-border shadow-md pointer-events-auto">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse-slow" />
          <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-citynavy-text">
            GIS Intelligent Map
          </span>
          <span className="text-xs text-slate-400 dark:text-citynavy-muted border-l border-slate-200 dark:border-slate-700 pl-2">
            {cityLabel}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Map Legend Toggle */}
          <button
            onClick={() => setShowLegend((v) => !v)}
            className={`p-2.5 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md transition-colors ${
              showLegend
                ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                : 'text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title="Marker Color Legend"
            aria-label="Marker Color Legend"
          >
            <Info className="w-4 h-4" />
          </button>

          {/* Layer Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowLayerMenu((v) => !v)}
              className="p-2.5 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Layers & Map Style"
              aria-label="Layers & Map Style"
            >
              <Layers className="w-4 h-4" />
            </button>

            {showLayerMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-xl shadow-2xl p-2.5 z-50 space-y-2 max-h-[420px] overflow-y-auto">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-citynavy-muted px-2 py-1">
                  Base Tile Layer
                </div>
                {(['dark', 'standard', 'satellite'] as BaseTileType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setActiveBaseTile(type);
                      setShowLayerMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      activeBaseTile === type
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {type === 'dark' ? 'Dark GIS (Recommended)' : type === 'standard' ? 'OpenStreetMap Standard' : 'Satellite Imagery'}
                  </button>
                ))}

                <div className="border-t border-slate-100 dark:border-citynavy-border my-1" />

                <label className="flex items-center justify-between px-2 py-1 text-xs text-slate-700 dark:text-citynavy-text cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg">
                  <span>Zone Boundaries</span>
                  <input
                    type="checkbox"
                    checked={showZonePolygons}
                    onChange={(e) => setShowZonePolygons(e.target.checked)}
                    className="accent-citynavy-accent"
                  />
                </label>

                <label className="flex items-center justify-between px-2 py-1 text-xs text-slate-700 dark:text-citynavy-text cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg">
                  <span>Live Traffic Layer</span>
                  <input
                    type="checkbox"
                    checked={showTrafficOverlay}
                    onChange={(e) => setShowTrafficOverlay(e.target.checked)}
                    className="accent-citynavy-accent"
                  />
                </label>

                {onToggleCategory && (
                  <>
                    <div className="border-t border-slate-100 dark:border-citynavy-border my-1" />
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-citynavy-muted px-2 py-0.5">
                      Filter Categories
                    </div>
                    <div className="space-y-1">
                      {POI_CATEGORIES.map((cat) => {
                        const isEnabled = !disabledCategories?.has(cat.id);
                        return (
                          <label
                            key={cat.id}
                            className="flex items-center justify-between px-2 py-1 text-xs text-slate-700 dark:text-citynavy-text cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg"
                          >
                            <span className="flex items-center gap-1.5 truncate">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: cat.color }}
                              />
                              <span className="truncate">{cat.label}</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => onToggleCategory(cat.id)}
                              className="accent-citynavy-accent ml-2"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setIsFullScreen((v) => !v)}
            className="p-2.5 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            aria-label="Full screen"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* GPS Error Notification Banner */}
      {gpsError && (
        <div className="absolute top-16 left-3 right-3 sm:right-auto sm:max-w-md z-[450] bg-red-500/95 text-white backdrop-blur-md rounded-xl p-3 shadow-xl flex items-start justify-between gap-3 animate-slide-down">
          <div className="flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">GPS Location Error</p>
              <p className="text-white/90 mt-0.5">{gpsError}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleLocateMe}
              className="p-1 hover:bg-white/20 rounded-md"
              title="Retry GPS"
              aria-label="Retry GPS"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setGpsError(null)}
              className="p-1 hover:bg-white/20 rounded-md"
              title="Dismiss"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Category Marker Color Legend Overlay */}
      {showLegend && (
        <div className="absolute top-16 right-3 z-[450] w-64 bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border rounded-xl shadow-2xl p-3 space-y-2 animate-slide-down max-h-[380px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-citynavy-border pb-1.5">
            <span className="text-xs font-bold text-slate-800 dark:text-citynavy-text">
              Marker Colors & Categories
            </span>
            <button
              onClick={() => setShowLegend(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close legend"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1 text-[11px]">
            {POI_CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2 py-0.5">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-slate-700 dark:text-citynavy-text font-medium truncate">
                  {cat.label}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 py-0.5 pt-1 border-t border-slate-100 dark:border-citynavy-border">
              <span className="w-3 h-3 rounded-full flex-shrink-0 bg-blue-600 border border-white shadow-sm animate-ping" />
              <span className="text-blue-600 dark:text-blue-400 font-bold">
                My GPS Location (Pulsing)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Map Navigation Controls */}
      <div className="absolute right-3 bottom-14 z-[400] flex flex-col gap-1.5">
        <button
          onClick={handleZoomIn}
          className="w-9 h-9 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-lg"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-9 h-9 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-lg"
          title="Zoom out"
          aria-label="Zoom out"
        >
          -
        </button>
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          className={`w-9 h-9 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md flex items-center justify-center transition-colors ${
            isLocating
              ? 'text-blue-500 animate-spin'
              : userCoords
              ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30'
              : 'text-citynavy-accent hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Locate my position (GPS)"
          aria-label="Locate my position (GPS)"
        >
          <Navigation className="w-4 h-4" />
        </button>
        <button
          onClick={handleRecenter}
          className="w-9 h-9 rounded-xl bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-slate-200 dark:border-citynavy-border shadow-md text-slate-700 dark:text-citynavy-text hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
          title="Recenter map"
          aria-label="Recenter map"
        >
          <Compass className="w-4 h-4" />
        </button>
      </div>

      {/* Active Route Floating Bar */}
      {route && (
        <div className="absolute top-16 left-3 right-3 sm:right-auto sm:max-w-md z-[400] bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-blue-500/40 rounded-xl p-3 shadow-xl flex items-center justify-between gap-3 animate-slide-down">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-500">
              <Car className="w-3.5 h-3.5" /> Active Route
            </div>
            <p className="text-sm font-bold text-slate-800 dark:text-citynavy-text truncate">
              {route.originName} → {route.destinationName}
            </p>
            <p className="text-xs text-slate-500 dark:text-citynavy-muted">{route.summary}</p>
          </div>
          {onClearRoute && (
            <button
              onClick={onClearRoute}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-red-500"
              title="Clear route"
              aria-label="Clear route"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Selected Traffic Incident Card */}
      {activeIncident && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm z-[400] bg-white/95 dark:bg-citynavy-card/95 backdrop-blur-md border border-red-500/40 rounded-xl p-3.5 shadow-2xl animate-slide-down">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center gap-1 w-fit">
                <AlertTriangle className="w-3 h-3" />
                {activeIncident.severity.toUpperCase()} TRAFFIC INCIDENT
              </span>
              <h4 className="text-sm font-bold text-slate-900 dark:text-citynavy-text mt-1">
                {activeIncident.type}
              </h4>
              <p className="text-xs text-slate-500 dark:text-citynavy-muted mt-0.5">
                {activeIncident.description}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                <span>+{Math.round(activeIncident.delaySeconds / 60)} min delay</span>
                {activeIncident.roadClosed && (
                  <span className="text-red-500 font-bold">&middot; ROAD CLOSED</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setActiveIncident(null)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Close incident details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Map Legend Quick Badges */}
      <div className="absolute bottom-3 right-3 z-[400] bg-white/90 dark:bg-citynavy-card/90 backdrop-blur-sm border border-slate-200 dark:border-citynavy-border rounded-lg px-2.5 py-1.5 shadow-md flex items-center gap-3 text-[11px] font-medium text-slate-600 dark:text-citynavy-muted pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" /> Normal
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Watch
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Alert
        </span>
        {userCoords && (
          <span className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 text-blue-500 font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" /> GPS Active
          </span>
        )}
        {showTrafficOverlay && (
          <span className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-2 text-blue-500">
            <Car className="w-3 h-3" /> Live Probe
          </span>
        )}
      </div>
    </div>
  );
}
