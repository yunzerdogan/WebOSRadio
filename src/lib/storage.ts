import type { EpisodeFilter, NavigationState, View } from '../types'

export const storageKeys = {
  favorites: 'webos-radio-favorites',
  volume: 'webos-radio-volume',
  listenedEpisodes: 'webos-radio-listened-episodes',
  podcastPositions: 'webos-radio-podcast-positions',
  podcastSubscriptions: 'webos-radio-podcast-subscriptions',
  knownEpisodes: 'webos-radio-known-episodes',
  history: 'webos-radio-history',
  navigationState: 'webos-radio-navigation-state',
} as const

const views: View[] = [
  'radio',
  'favorites',
  'subscriptions',
  'history',
  'podcast-shows',
  'podcast-episodes',
  'local',
]
const episodeFilters: EpisodeFilter[] = ['newest', 'oldest', 'unheard', 'heard']

export function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function readStoredVolume() {
  const storedVolume = Number(localStorage.getItem(storageKeys.volume))
  return Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1
    ? storedVolume
    : 1
}

export function loadNavigationState(): NavigationState | null {
  const stored = readStoredJson<Partial<NavigationState> | null>(storageKeys.navigationState, null)
  if (!stored || !views.includes(stored.view as View) || !Array.isArray(stored.items)) return null

  return {
    items: stored.items,
    view: stored.view as View,
    activeIndex: typeof stored.activeIndex === 'number' ? stored.activeIndex : 0,
    lastListIndex: typeof stored.lastListIndex === 'number' ? stored.lastListIndex : 0,
    playerReturnFocus: typeof stored.playerReturnFocus === 'number' ? stored.playerReturnFocus : 0,
    podcastShows: Array.isArray(stored.podcastShows) ? stored.podcastShows : [],
    podcastEpisodes: Array.isArray(stored.podcastEpisodes) ? stored.podcastEpisodes : [],
    selectedPodcast: stored.selectedPodcast ?? null,
    currentStation: stored.currentStation ?? null,
    episodeFilter: episodeFilters.includes(stored.episodeFilter as EpisodeFilter)
      ? stored.episodeFilter as EpisodeFilter
      : 'newest',
  }
}
