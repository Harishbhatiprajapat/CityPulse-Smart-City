import { useState } from 'react';
import {
  Navigation,
  MapPin,
  Car,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { LiveMap } from './LiveMap';
import { calculateRoadRoute } from '@/services/routingService';
import { searchCities } from '@/services/geoService';
import type { Zone, CityInfo, RouteResult, CitySearchResult } from '@/types';

interface RoutePlannerProps {
  zones: Zone[];
  selectedZoneId: number | null;
  onSelectZone: (id: number) => void;
  currentCity: CityInfo;
  initialDestination?: { name: string; lat: number; lng: number } | null;
  tomtomKey?: string;
}

export function RoutePlanner({
  zones,
  selectedZoneId,
  onSelectZone,
  currentCity,
  initialDestination,
  tomtomKey,
}: RoutePlannerProps) {
  const [originText, setOriginText] = useState(`${currentCity.name} Center`);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number }>({
    lat: currentCity.latitude,
    lng: currentCity.longitude,
  });

  const [destText, setDestText] = useState(initialDestination?.name || '');
  const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(
    initialDestination ? { lat: initialDestination.lat, lng: initialDestination.lng } : null
  );

  const [destSuggestions, setDestSuggestions] = useState<CitySearchResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  async function handleSearchDest(text: string) {
    setDestText(text);
    if (text.trim().length < 2) {
      setDestSuggestions([]);
      return;
    }
    setLoadingSuggestions(true);
    try {
      const results = await searchCities(text);
      setDestSuggestions(results);
    } catch {
      setDestSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleSelectDest(s: CitySearchResult) {
    setDestText(s.label);
    setDestCoords({ lat: s.latitude, lng: s.longitude });
    setDestSuggestions([]);
  }

  async function handleCalculateRoute() {
    if (!originCoords || !destCoords) {
      setRouteError('Please select a valid destination location.');
      return;
    }

    setLoadingRoute(true);
    setRouteError(null);

    try {
      const res = await calculateRoadRoute(
        originCoords.lat,
        originCoords.lng,
        destCoords.lat,
        destCoords.lng,
        originText,
        destText
      );
      setRoute(res);
    } catch (err: unknown) {
      setRouteError(err instanceof Error ? err.message : 'Could not find a valid driving route.');
    } finally {
      setLoadingRoute(false);
    }
  }

  function handleSwap() {
    if (!destCoords) return;
    const tempText = originText;
    const tempCoords = originCoords;
    setOriginText(destText);
    setOriginCoords(destCoords);
    setDestText(tempText);
    setDestCoords(tempCoords);
    setRoute(null);
  }

  function handleClearRoute() {
    setRoute(null);
  }

  return (
    <div className="space-y-6">
      {/* Route Inputs Form */}
      <div className="bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-citynavy-accent">
              <Navigation className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-citynavy-text">
              Turn-by-Turn Road Route Planning
            </h2>
          </div>
          <span className="text-xs text-slate-400 dark:text-citynavy-muted">
            Powered by OSRM Road Topology Engine
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
          {/* Origin Input */}
          <div className="relative">
            <label className="text-xs font-semibold text-slate-500 dark:text-citynavy-muted mb-1 block">
              Origin (Start Point)
            </label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-3 w-4 h-4 text-emerald-500" />
              <input
                type="text"
                value={originText}
                onChange={(e) => setOriginText(e.target.value)}
                placeholder="Starting place..."
                className="w-full pl-9 pr-3 py-2.5 text-xs bg-slate-50 dark:bg-citynavy-secondary border border-slate-200 dark:border-citynavy-border rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-citynavy-accent"
              />
            </div>
          </div>

          {/* Destination Input */}
          <div className="relative">
            <label className="text-xs font-semibold text-slate-500 dark:text-citynavy-muted mb-1 block">
              Destination
            </label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-3 w-4 h-4 text-red-500" />
              <input
                type="text"
                value={destText}
                onChange={(e) => handleSearchDest(e.target.value)}
                placeholder="Search destination place or facility..."
                className="w-full pl-9 pr-9 py-2.5 text-xs bg-slate-50 dark:bg-citynavy-secondary border border-slate-200 dark:border-citynavy-border rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-citynavy-accent"
              />
              {loadingSuggestions && (
                <Loader2 className="absolute right-3 w-3.5 h-3.5 animate-spin text-citynavy-accent" />
              )}
            </div>

            {/* Destination Autocomplete Suggestions */}
            {destSuggestions.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                {destSuggestions.map((s, idx) => (
                  <button
                    key={`${s.id}-${idx}`}
                    type="button"
                    onClick={() => handleSelectDest(s)}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-citynavy-cardHover text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-citynavy-border/40 last:border-none"
                  >
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-[10px] text-slate-400">{s.label}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCalculateRoute}
            disabled={loadingRoute || !destCoords}
            className="px-5 py-2.5 rounded-xl bg-citynavy-accent text-white font-semibold text-xs hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            {loadingRoute ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Car className="w-4 h-4" />
            )}
            <span>Calculate Route</span>
          </button>

          {destCoords && (
            <button
              type="button"
              onClick={handleSwap}
              className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-citynavy-border text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-citynavy-secondary transition-colors"
            >
              Swap Origin/Dest
            </button>
          )}

          {route && (
            <button
              type="button"
              onClick={handleClearRoute}
              className="px-3 py-2.5 rounded-xl text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              Clear Route
            </button>
          )}
        </div>

        {routeError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{routeError}</span>
          </div>
        )}
      </div>

      {/* Map + Steps Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <LiveMap
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={onSelectZone}
            cityLabel={currentCity.label}
            cityCoords={{ lat: currentCity.latitude, lng: currentCity.longitude }}
            route={route}
            onClearRoute={handleClearRoute}
            tomtomKey={tomtomKey}
            heightClass="h-[520px] sm:h-[600px]"
          />
        </div>

        {/* Turn-by-Turn Steps Panel */}
        <div className="bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-4 shadow-sm flex flex-col h-[520px] sm:h-[600px]">
          <div className="pb-3 border-b border-slate-100 dark:border-citynavy-border">
            <h3 className="text-sm font-bold text-slate-900 dark:text-citynavy-text">
              Turn-by-Turn Driving Directions
            </h3>
            {route ? (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                {(route.distanceMeters / 1000).toFixed(2)} km · {Math.round(route.durationSeconds / 60)} mins driving
              </p>
            ) : (
              <p className="text-xs text-slate-400 dark:text-citynavy-muted mt-1">
                Calculate a route to display turn-by-turn guidance
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 mt-3 pr-1">
            {!route ? (
              <div className="py-24 text-center text-xs text-slate-400 dark:text-citynavy-muted">
                Select a starting point and destination above, then click &ldquo;Calculate Route&rdquo;.
              </div>
            ) : route.steps.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Direct road route ready.
              </div>
            ) : (
              route.steps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-citynavy-secondary/40 border border-slate-100 dark:border-citynavy-border/40 text-xs flex items-start gap-2.5"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {step.instruction}
                    </p>
                    {step.distanceMeters > 0 && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {step.distanceMeters >= 1000
                          ? `${(step.distanceMeters / 1000).toFixed(1)} km`
                          : `${step.distanceMeters} m`}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
