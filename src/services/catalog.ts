import { isCompatibleMediaUrl, normalizeMediaUrl } from '../lib/media'
import type {
  PodcastEpisode,
  PodcastShow,
  RadioBrowserStation,
  RadioStation,
} from '../types'

const RADIO_BROWSER_API = 'https://de1.api.radio-browser.info/json/stations/search'
const PODCAST_API = 'https://itunes.apple.com'

function requestPodcastJsonp<T>(path: 'search' | 'lookup', params: Record<string, string>) {
  return new Promise<T[]>((resolve, reject) => {
    const callbackName = `podcastJsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const script = document.createElement('script')
    const callbacks = window as unknown as Record<string, ((data: { results?: T[] }) => void) | undefined>
    const timeout = window.setTimeout(
      () => finish(new Error('Podcast-Anfrage hat zu lange gedauert.')),
      15_000,
    )

    const finish = (error?: Error, results: T[] = []) => {
      window.clearTimeout(timeout)
      script.remove()
      delete callbacks[callbackName]
      if (error) reject(error)
      else resolve(results)
    }

    callbacks[callbackName] = (data) => finish(undefined, data.results ?? [])
    script.onerror = () => finish(new Error('Podcast-Verzeichnis ist nicht erreichbar.'))
    const query = new URLSearchParams({ ...params, callback: callbackName })
    script.src = `${PODCAST_API}/${path}?${query}`
    document.head.appendChild(script)
  })
}

export async function searchRadioStations(name = '') {
  const params = new URLSearchParams({
    countrycode: 'DE',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
    limit: '120',
  })
  if (name) params.set('name', name)

  const response = await fetch(`${RADIO_BROWSER_API}?${params}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const results = await response.json() as RadioBrowserStation[]

  return results
    .filter((station) => {
      const codec = station.codec.toUpperCase()
      return station.name
        && isCompatibleMediaUrl(station.url_resolved)
        && !station.hls
        && ['MP3', 'AAC', 'AAC+'].includes(codec)
    })
    .map<RadioStation>((station) => ({
      id: `radio-${station.stationuuid}`,
      name: station.name.trim(),
      genre: [station.tags.split(',')[0], station.codec, station.bitrate ? `${station.bitrate} kbit/s` : '']
        .filter(Boolean)
        .join(' · '),
      streamUrl: normalizeMediaUrl(station.url_resolved),
      logoUrl: station.favicon,
      mediaType: 'radio',
    }))
}

export async function searchPodcastShows(term: string) {
  const results = await requestPodcastJsonp<PodcastShow>('search', {
    term,
    country: 'DE',
    media: 'podcast',
    entity: 'podcast',
    limit: '60',
  })

  return results
    .filter((show) => show.collectionId && show.collectionName)
    .map<RadioStation>((show) => ({
      id: `podcast-show-${show.collectionId}`,
      name: show.collectionName,
      genre: `${show.artistName || 'Podcast'}${show.trackCount ? ` · ${show.trackCount} Folgen` : ''}`,
      streamUrl: '',
      logoUrl: show.artworkUrl600 || show.artworkUrl100 || '',
      mediaType: 'podcast-show',
      collectionId: show.collectionId,
    }))
}

export async function getPodcastEpisodes(show: RadioStation) {
  if (!show.collectionId) return []
  const results = await requestPodcastJsonp<PodcastEpisode>('lookup', {
    id: String(show.collectionId),
    entity: 'podcastEpisode',
    limit: '100',
    country: 'DE',
  })

  return results
    .filter((episode) => episode.trackName
      && isCompatibleMediaUrl(episode.episodeUrl)
      && (!episode.episodeContentType || episode.episodeContentType === 'audio'))
    .map<RadioStation>((episode) => ({
      id: `podcast-${episode.trackId}`,
      name: episode.trackName,
      genre: `${new Date(episode.releaseDate).toLocaleDateString('de-DE')} · ${episode.collectionName}`,
      streamUrl: normalizeMediaUrl(episode.episodeUrl),
      logoUrl: episode.artworkUrl600 || episode.artworkUrl160 || show.logoUrl,
      mediaType: 'podcast',
      collectionId: show.collectionId,
      releaseDate: episode.releaseDate,
    }))
}
