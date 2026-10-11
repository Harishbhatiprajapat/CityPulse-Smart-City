import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Sliders,
  Loader2,
  ChevronRight,
  Compass,
  Bookmark,
  Check,
  X,
} from 'lucide-react';
import { LiveMap } from './LiveMap';
import { LocationDetailPanel } from './LocationDetailPanel';
import { MapAssistantChatbox } from './MapAssistantChatbox';
import {
  searchNearbyPOIs,
  searchPlacesFree,
  geocodeLocation,
  POI_CATEGORIES,
  getCategoryMeta,
} from '@/services/geoService';
import { calculateRoadRoute } from '@/services/routingService';
import { savePlace, isPlaceSaved } from '@/services/savedPlacesService';
import type { Zone, CityInfo, POICategory, POIPlace, RouteResult } from '@/types';

interface ExploreMapProps {
  zones: Zone[];
  selectedZoneId: number | null;
  onSelectZone: (id: number) => void;
  currentCity: CityInfo;
  onPlanRouteTo?: (destName: string, lat: number, lng: number) => void;
  onSelectCity?: (city: CityInfo) => void;
  tomtomKey?: string;
}

export function ExploreMap({
  zones,
  selectedZoneId,
  onSelectZone,
  currentCity,
  onPlanRouteTo,
  onSelectCity,
  tomtomKey,
}: ExploreMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<POICategory>('hospitals');
  const [radiusKm, setRadiusKm] = useState(5);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCenter, setActiveCenter] = useState<{ lat: number; lng: number; label: string }>({
    lat: currentCity.latitude,
    lng: currentCity.longitude,
    label: currentCity.label,
  });

  const [pois, setPois] = useState<POIPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPOI, setSelectedPOI] = useState<POIPlace | null>(null);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);
  const [disabledCategories, setDisabledCategories] = useState<Set<POICategory>>(new Set());

  // Active road route displayed on map
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);

  // User GPS coordinates
  const [userGpsCoords, setUserGpsCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);

  // Suggestions for top search bar
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<POIPlace[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<number | null>(null);

  // Sync center when currentCity changes externally
  useEffect(() => {
    setActiveCenter({
      lat: currentCity.latitude,
      lng: currentCity.longitude,
      label: currentCity.label,
    });
  }, [currentCity.latitude, currentCity.longitude, currentCity.label]);

  // Load POIs when category, center, or radius changes
  const fetchCategoryPOIs = useCallback(
    async (cat: POICategory, centerLat: number, centerLng: number, radius: number) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await searchNearbyPOIs(cat, centerLat, centerLng, radius, controller.signal);
        setPois(data);
        setLoading(false);
        return data;
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Could not retrieve nearby facilities from OpenStreetMap.');
          setLoading(false);
        }
        return [];
      }
    },
    []
  );

  useEffect(() => {
    fetchCategoryPOIs(selectedCategory, activeCenter.lat, activeCenter.lng, radiusKm);
  }, [selectedCategory, activeCenter.lat, activeCenter.lng, radiusKm, fetchCategoryPOIs]);

  // Handle Free Search with Debounce
  const handleSearchInputChange = (val: string) => {
    setSearchQuery(val);

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchDebounceRef.current = window.setTimeout(async () => {
      setIsSearchingSuggestions(true);
      try {
        const results = await searchPlacesFree(val, activeCenter.lat, activeCenter.lng, radiusKm * 2);
        setSuggestions(results.slice(0, 6));
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 350);
  };

  const handleSelectSuggestion = (place: POIPlace) => {
    setShowSuggestions(false);
    setSearchQuery(place.name);
    setSelectedPOI(place);
    setActiveCenter({
      lat: place.latitude,
      lng: place.longitude,
      label: place.address || place.name,
    });

    // Add place to current list if not already present
    setPois((prev) => {
      if (prev.some((p) => p.id === place.id)) return prev;
      return [place, ...prev];
    });
  };

  const handleExecuteSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setShowSuggestions(false);
    setLoading(true);

    try {
      // Check if query is a city or landmark
      const geo = await geocodeLocation(searchQuery);
      if (geo) {
        setActiveCenter({ lat: geo.lat, lng: geo.lng, label: geo.label });
        const results = await searchNearbyPOIs(selectedCategory, geo.lat, geo.lng, radiusKm);
        setPois(results);
      } else {
        const freeResults = await searchPlacesFree(searchQuery, activeCenter.lat, activeCenter.lng, radiusKm * 2);
        setPois(freeResults);
        if (freeResults.length > 0) {
          setSelectedPOI(freeResults[0]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (poi: POIPlace) => {
    savePlace({
      name: poi.name,
      label: poi.address || `${poi.name}, ${currentCity.name}`,
      category: poi.categoryLabel,
      latitude: poi.latitude,
      longitude: poi.longitude,
    });
    setSavedSuccessId(poi.id);
    setTimeout(() => setSavedSuccessId(null), 2000);
  };

  // Toggle Category Layer
  const handleToggleCategory = (cat: POICategory) => {
    setDisabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Direct Route Calculation
  const handleCalculateRoute = async (
    destName: string,
    destLat: number,
    destLng: number,
    originName?: string,
    originLat?: number,
    originLng?: number
  ): Promise<boolean> => {
    const startLat = originLat ?? userGpsCoords?.lat ?? activeCenter.lat;
    const startLng = originLng ?? userGpsCoords?.lng ?? activeCenter.lng;
    const startName = originName ?? (userGpsCoords ? 'My GPS Position' : `${currentCity.name} Center`);

    try {
      const route = await calculateRoadRoute(startLat, startLng, destLat, destLng, startName, destName);
      setActiveRoute(route);
      onPlanRouteTo?.(destName, destLat, destLng);
      return true;
    } catch {
      return false;
    }
  };

  // MAP ASSISTANT TOOL ADAPTERS
  const handleAssistantSetMapLocation = async (place: { name: string; lat: number; lng: number }): Promise<boolean> => {
    setActiveCenter({ lat: place.lat, lng: place.lng, label: place.name });
    if (onSelectCity) {
      onSelectCity({
        name: place.name,
        country: currentCity.country,
        latitude: place.lat,
        longitude: place.lng,
        label: place.name,
      });
    }
    await fetchCategoryPOIs(selectedCategory, place.lat, place.lng, radiusKm);
    return true;
  };

  const handleAssistantSearchPlaces = async (
    category: POICategory,
    radius: number,
    customCenter?: { lat: number; lng: number; name: string }
  ): Promise<POIPlace[]> => {
    setSelectedCategory(category);
    setRadiusKm(radius);

    const targetLat = customCenter ? customCenter.lat : activeCenter.lat;
    const targetLng = customCenter ? customCenter.lng : activeCenter.lng;

    if (customCenter) {
      setActiveCenter({ lat: targetLat, lng: targetLng, label: customCenter.name });
    }

    return await fetchCategoryPOIs(category, targetLat, targetLng, radius);
  };

  const handleAssistantGetCurrentLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setUserGpsCoords(coords);
          setActiveCenter({
            lat: coords.lat,
            lng: coords.lng,
            label: 'My GPS Location',
          });
          resolve({ lat: coords.lat, lng: coords.lng });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleAssistantSelectMarker = (placeId: string) => {
    const found = pois.find((p) => p.id === placeId);
    if (found) setSelectedPOI(found);
  };

  const handleAssistantClearSearch = () => {
    setSearchQuery('');
    setActiveRoute(null);
    setSelectedPOI(null);
    setActiveCenter({
      lat: currentCity.latitude,
      lng: currentCity.longitude,
      label: currentCity.label,
    });
    fetchCategoryPOIs(selectedCategory, currentCity.latitude, currentCity.longitude, radiusKm);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar + Controls Top Deck */}
      <div className="bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Global Search Input */}
          <div className="relative flex-1 max-w-xl">
            <form onSubmit={handleExecuteSearch} className="relative flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="Search city, address, landmark, hospital, hotel, or station..."
                className="w-full pl-10 pr-20 py-2.5 bg-slate-50 dark:bg-citynavy-secondary border border-slate-200 dark:border-citynavy-border rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-citynavy-accent"
              />
              {isSearchingSuggestions && (
                <Loader2 className="absolute right-16 w-3.5 h-3.5 text-blue-500 animate-spin" />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSuggestions([]);
                    setShowSuggestions(false);
                  }}
                  className="absolute right-12 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-colors"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Find'}
              </button>
            </form>

            {/* Instant Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-citynavy-border">
                {suggestions.map((s) => {
                  const meta = getCategoryMeta(s.category);
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSelectSuggestion(s)}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="text-xs font-semibold text-slate-800 dark:text-citynavy-text truncate">
                          {s.name}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate">
                          {s.address?.split(',').slice(0, 2).join(',')}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        {s.distanceKm} km
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Toolbar: Radius Slider & AI Map Assistant trigger */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-citynavy-secondary px-3 py-2 rounded-xl border border-slate-200 dark:border-citynavy-border">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Radius: <span className="font-bold text-citynavy-accent">{radiusKm} km</span>
              </span>
              <input
                type="range"
                min={1}
                max={20}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-20 accent-citynavy-accent cursor-pointer"
              />
            </div>

            {/* Embedded Map Assistant Button */}
            <MapAssistantChatbox
              currentCity={currentCity}
              onSetMapLocation={handleAssistantSetMapLocation}
              onSearchPlaces={handleAssistantSearchPlaces}
              onGetCurrentLocation={handleAssistantGetCurrentLocation}
              onSelectMarker={handleAssistantSelectMarker}
              onClearSearch={handleAssistantClearSearch}
              onCalculateRoute={handleCalculateRoute}
              activePlacesCount={pois.length}
              selectedPOI={selectedPOI}
            />
          </div>
        </div>

        {/* 12 Category Filter Chips Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none pt-1">
          {POI_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const isCategoryDisabled = disabledCategories.has(cat.id);

            return (
              <button
                key={cat.id}
                onClick={() => {
                  if (isCategoryDisabled) handleToggleCategory(cat.id);
                  setSelectedCategory(cat.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'bg-slate-100 dark:bg-citynavy-secondary text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: cat.color,
                        boxShadow: `0 4px 12px ${cat.color}40`,
                      }
                    : {}
                }
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 3-Column GIS Grid: Results (Left) | Interactive Map (Center) | Details (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Results Panel (3 cols on desktop) */}
        <div className="lg:col-span-3 bg-white dark:bg-citynavy-card border border-slate-200 dark:border-citynavy-border rounded-2xl p-3.5 shadow-sm flex flex-col h-[520px] sm:h-[620px]">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-citynavy-border">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-citynavy-text flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-citynavy-accent" />
                <span>Found {pois.length} Locations</span>
              </h3>
              <p className="text-[11px] text-slate-400 dark:text-citynavy-muted mt-0.5">
                {activeCenter.label.split(',')[0]} &middot; {radiusKm} km radius
              </p>
            </div>
            {loading && <Loader2 className="w-4 h-4 text-citynavy-accent animate-spin" />}
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mt-2">
            {loading && pois.length === 0 ? (
              <div className="py-24 flex flex-col items-center justify-center text-center gap-2">
                <Loader2 className="w-6 h-6 text-citynavy-accent animate-spin" />
                <p className="text-xs text-slate-400">Querying live OpenStreetMap geospatial nodes...</p>
              </div>
            ) : error ? (
              <div className="p-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-xl">
                {error}
              </div>
            ) : pois.length === 0 ? (
              <div className="py-24 text-center text-xs text-slate-400 dark:text-citynavy-muted px-4">
                No facilities found in this category within {radiusKm} km. Try expanding the search radius or exploring another zone.
              </div>
            ) : (
              pois.map((p) => {
                const isSelected = selectedPOI?.id === p.id;
                const isSaved = isPlaceSaved(p.name);
                const isRecentlySaved = savedSuccessId === p.id;
                const catMeta = getCategoryMeta(p.category);

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPOI(p)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-sm'
                        : 'border-slate-100 dark:border-citynavy-border/60 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: catMeta.color }}
                          />
                          <h4 className="text-xs font-bold text-slate-900 dark:text-citynavy-text truncate">
                            {p.name}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-citynavy-muted truncate mt-0.5">
                          {p.address || 'Address registered in OpenStreetMap'}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                        {p.distanceKm} km
                      </span>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-citynavy-border/50 text-[11px]">
                      <span className="text-slate-400 dark:text-citynavy-muted">
                        {p.categoryLabel}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSave(p);
                          }}
                          className={`p-1 rounded-md transition-colors ${
                            isRecentlySaved
                              ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                              : isSaved
                              ? 'text-blue-500'
                              : 'text-slate-400 hover:text-blue-500'
                          }`}
                          title="Bookmark place"
                          aria-label="Bookmark place"
                        >
                          {isRecentlySaved ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Bookmark className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCalculateRoute(p.name, p.latitude, p.longitude);
                          }}
                          className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 transition-colors flex items-center gap-1"
                        >
                          <span>Route</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center: Main Interactive Map (6 cols with details open, 9 cols when no details selected) */}
        <div
          className={`transition-all duration-300 ${
            selectedPOI ? 'lg:col-span-5' : 'lg:col-span-9'
          }`}
        >
          <LiveMap
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={onSelectZone}
            cityLabel={activeCenter.label}
            cityCoords={{ lat: activeCenter.lat, lng: activeCenter.lng }}
            poiPlaces={pois}
            selectedPOI={selectedPOI}
            onSelectPOI={(poi) => setSelectedPOI(poi)}
            route={activeRoute}
            onClearRoute={() => setActiveRoute(null)}
            tomtomKey={tomtomKey}
            heightClass="h-[520px] sm:h-[620px]"
            disabledCategories={disabledCategories}
            onToggleCategory={handleToggleCategory}
            onUserLocationDetected={(coords) => {
              setUserGpsCoords(coords);
              setActiveCenter({
                lat: coords.lat,
                lng: coords.lng,
                label: 'My GPS Location',
              });
            }}
          />
        </div>

        {/* Right Column: Location Information Panel (4 cols on desktop when selected) */}
        {selectedPOI && (
          <div className="lg:col-span-4 h-full">
            <LocationDetailPanel
              place={selectedPOI}
              cityName={currentCity.name}
              onClose={() => setSelectedPOI(null)}
              onPlanRouteTo={(name, lat, lng) => handleCalculateRoute(name, lat, lng)}
              onFindNearby={(place) => {
                setActiveCenter({ lat: place.latitude, lng: place.longitude, label: place.name });
                fetchCategoryPOIs(selectedCategory, place.latitude, place.longitude, radiusKm);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
