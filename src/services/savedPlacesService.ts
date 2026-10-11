import type { SavedPlace } from '@/types';

const STORAGE_KEY = 'citypulse_saved_places';

export function getSavedPlaces(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function savePlace(place: Omit<SavedPlace, 'id' | 'savedAt'>): SavedPlace {
  const existing = getSavedPlaces();
  const id = `place_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newPlace: SavedPlace = {
    ...place,
    id,
    savedAt: new Date().toISOString(),
  };

  const updated = [newPlace, ...existing.filter((p) => p.name !== place.name)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return newPlace;
}

export function removeSavedPlace(id: string): void {
  const existing = getSavedPlaces();
  const filtered = existing.filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function isPlaceSaved(name: string): boolean {
  const existing = getSavedPlaces();
  return existing.some((p) => p.name.toLowerCase() === name.toLowerCase());
}
