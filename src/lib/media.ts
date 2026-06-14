import type { EpisodeFilter, RadioStation } from '../types'

export function normalizeMediaUrl(url: string) {
  return url.trim().replace(/&amp;/gi, '&')
}

export function isCompatibleMediaUrl(url: string) {
  return /^https:\/\//i.test(url)
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

export function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function filterEpisodes(
  episodes: RadioStation[],
  filter: EpisodeFilter,
  listenedEpisodeIds: Set<string>,
) {
  const filtered = filter === 'heard'
    ? episodes.filter((episode) => listenedEpisodeIds.has(episode.id))
    : filter === 'unheard'
      ? episodes.filter((episode) => !listenedEpisodeIds.has(episode.id))
      : [...episodes]

  return filtered.sort((first, second) => {
    const firstDate = new Date(first.releaseDate ?? 0).getTime()
    const secondDate = new Date(second.releaseDate ?? 0).getTime()
    return filter === 'oldest' ? firstDate - secondDate : secondDate - firstDate
  })
}

export function favoritesFirst(entries: RadioStation[], favoriteIds: Set<string>) {
  return [
    ...entries.filter((entry) => favoriteIds.has(entry.id)),
    ...entries.filter((entry) => !favoriteIds.has(entry.id)),
  ]
}

export function isSameMedia(first: RadioStation, second: RadioStation) {
  if (first.id === second.id) return true
  return Boolean(first.streamUrl && second.streamUrl
    && normalizeMediaUrl(first.streamUrl) === normalizeMediaUrl(second.streamUrl))
}

export function prependPreferred(entries: RadioStation[], preferredEntries: RadioStation[]) {
  return [
    ...preferredEntries,
    ...entries.filter((entry) => !preferredEntries.some((preferred) => isSameMedia(entry, preferred))),
  ]
}

function getProxyBase(configuredProxy: string | undefined, sameOriginPath: string) {
  const sameOriginProxyDisabled = import.meta.env.VITE_DISABLE_SAME_ORIGIN_PROXY === 'true'
  const canUseSameOriginProxy = !sameOriginProxyDisabled
    && (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  return configuredProxy || (canUseSameOriginProxy ? sameOriginPath : '')
}

export function getPlayableMediaUrl(url: string) {
  const normalizedUrl = normalizeMediaUrl(url)
  if (!/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl
  const proxyBase = getProxyBase(import.meta.env.VITE_MEDIA_PROXY_URL, '/media-proxy')
  return proxyBase ? `${proxyBase}?url=${encodeURIComponent(normalizedUrl)}` : normalizedUrl
}

export function getMetadataUrl(url: string) {
  const normalizedUrl = normalizeMediaUrl(url)
  const proxyBase = getProxyBase(import.meta.env.VITE_METADATA_PROXY_URL, '/media-metadata')
  return proxyBase ? `${proxyBase}?url=${encodeURIComponent(normalizedUrl)}` : ''
}
