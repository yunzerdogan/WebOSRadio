import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type {
  PodcastEpisode,
  PodcastShow,
  RadioBrowserStation,
  RadioStation,
} from './types'

const PAGE_SIZE = 6
const COLUMN_COUNT = 2
const RADIO_FOCUS = -6
const PODCAST_FOCUS = -5
const FAVORITES_FOCUS = -4
const SEARCH_FOCUS = -3
const STAR_FOCUS = -2
const IMPORT_FOCUS = -1
const HEADER_FOCUSES = [
  RADIO_FOCUS,
  PODCAST_FOCUS,
  FAVORITES_FOCUS,
  SEARCH_FOCUS,
  STAR_FOCUS,
  IMPORT_FOCUS,
]
const RADIO_BROWSER_API = 'https://de1.api.radio-browser.info/json/stations/search'
const PODCAST_API = 'https://itunes.apple.com'
const FAVORITES_KEY = 'webos-radio-favorites'

type View = 'radio' | 'favorites' | 'podcast-shows' | 'podcast-episodes' | 'local'

const mediaErrorMessages: Record<number, string> = {
  1: 'Die Wiedergabe wurde abgebrochen.',
  2: 'Netzwerkfehler beim Laden des Streams.',
  3: 'Das Audioformat konnte nicht dekodiert werden.',
  4: 'Stream oder Audioformat wird nicht unterstützt.',
}

const defaultStations: RadioStation[] = [
  {
    id: 'groove-salad',
    name: 'SomaFM Groove Salad',
    genre: 'Ambient / Downtempo',
    streamUrl: 'https://ice2.somafm.com/groovesalad-128-mp3',
    logoUrl: 'https://somafm.com/img3/groovesalad-400.jpg',
    mediaType: 'radio',
  },
  {
    id: 'secret-agent',
    name: 'SomaFM Secret Agent',
    genre: 'Spy Jazz / Lounge',
    streamUrl: 'https://ice2.somafm.com/secretagent-128-mp3',
    logoUrl: 'https://somafm.com/img3/secretagent-400.jpg',
    mediaType: 'radio',
  },
  {
    id: 'drone-zone',
    name: 'SomaFM Drone Zone',
    genre: 'Atmospheric Ambient',
    streamUrl: 'https://ice2.somafm.com/dronezone-128-mp3',
    logoUrl: 'https://somafm.com/img3/dronezone-400.jpg',
    mediaType: 'radio',
  },
  {
    id: 'def-con',
    name: 'SomaFM DEF CON Radio',
    genre: 'Electronica / Hacker Culture',
    streamUrl: 'https://ice2.somafm.com/defcon-128-mp3',
    logoUrl: 'https://somafm.com/img3/defcon-400.jpg',
    mediaType: 'radio',
  },
  {
    id: 'illinois-street-lounge',
    name: 'SomaFM Illinois Street Lounge',
    genre: 'Classic Lounge',
    streamUrl: 'https://ice2.somafm.com/illstreet-128-mp3',
    logoUrl: 'https://somafm.com/img3/illstreet-400.jpg',
    mediaType: 'radio',
  },
  {
    id: 'indie-pop-rocks',
    name: 'SomaFM Indie Pop Rocks!',
    genre: 'Indie Pop / Rock',
    streamUrl: 'https://ice2.somafm.com/indiepop-128-mp3',
    logoUrl: 'https://somafm.com/img3/indiepop-400.jpg',
    mediaType: 'radio',
  },
]

function requestPodcastJsonp<T>(path: 'search' | 'lookup', params: Record<string, string>) {
  return new Promise<T[]>((resolve, reject) => {
    const callbackName = `podcastJsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    const script = document.createElement('script')
    const callbacks = window as unknown as Record<string, ((data: { results?: T[] }) => void) | undefined>
    const timeout = window.setTimeout(
      () => finish(new Error('Podcast-Anfrage hat zu lange gedauert.')),
      15000,
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

function getAttribute(line: string, attribute: string) {
  return line.match(new RegExp(`${attribute}="([^"]*)"`, 'i'))?.[1]?.trim() ?? ''
}

function parseM3u(content: string, fileName: string): RadioStation[] {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const parsed: RadioStation[] = []
  let metadata: { name: string; genre: string; logoUrl: string } | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.toUpperCase().startsWith('#EXTINF:')) {
      const commaIndex = line.indexOf(',')
      metadata = {
        name: commaIndex >= 0 ? line.slice(commaIndex + 1).trim() : '',
        genre: getAttribute(line, 'group-title') || 'Eigene Playlist',
        logoUrl: getAttribute(line, 'tvg-logo'),
      }
      continue
    }
    if (line.startsWith('#')) continue

    parsed.push({
      id: `m3u-${Date.now()}-${parsed.length}`,
      name: metadata?.name || `Sender ${parsed.length + 1}`,
      genre: metadata?.genre || fileName.replace(/\.m3u8?$/i, '') || 'Eigene Playlist',
      streamUrl: line,
      logoUrl: metadata?.logoUrl || '',
      mediaType: 'radio',
    })
    metadata = null
  }
  return parsed
}

function StationLogo({ station, large = false }: { station: RadioStation; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClasses = large
    ? 'h-96 w-96 rounded-[2.25rem] text-8xl'
    : 'h-24 w-24 rounded-2xl text-3xl'

  if (!station.logoUrl || imageFailed) {
    return (
      <div className={`${sizeClasses} flex shrink-0 items-center justify-center bg-gradient-to-br from-purple-600 to-indigo-900 font-black shadow-lg`}>
        {station.name.slice(0, 1).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={station.logoUrl}
      alt={large ? `${station.name} Logo` : ''}
      onError={() => setImageFailed(true)}
      className={`${sizeClasses} shrink-0 bg-slate-700 object-cover shadow-lg`}
    />
  )
}

function App() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<RadioStation[]>(defaultStations)
  const [lastListIndex, setLastListIndex] = useState(0)
  const [podcastShows, setPodcastShows] = useState<RadioStation[]>([])
  const [view, setView] = useState<View>('local')
  const [activeIndex, setActiveIndex] = useState(0)
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null)
  const [selectedPodcast, setSelectedPodcast] = useState<RadioStation | null>(null)
  const [favorites, setFavorites] = useState<RadioStation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as RadioStation[]
    } catch {
      return []
    }
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackMessage, setPlaybackMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const listIndex = activeIndex < 0 ? lastListIndex : activeIndex
  const pageIndex = Math.floor(listIndex / PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const visibleItems = useMemo(
    () => items.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE),
    [items, pageIndex],
  )
  const focusedItem = items[listIndex] ?? null
  const favoriteTarget = focusedItem?.mediaType === 'radio'
    ? focusedItem
    : currentStation?.mediaType === 'radio'
      ? currentStation
      : null
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites])
  const isFavoriteTarget = favoriteTarget ? favoriteIds.has(favoriteTarget.id) : false

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    if (activeIndex >= 0) setLastListIndex(activeIndex)
  }, [activeIndex])

  useEffect(() => {
    if (isSearchOpen) window.setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [isSearchOpen])

  const playStation = useCallback((station: RadioStation) => {
    const audio = audioRef.current
    if (!audio || !station.streamUrl) return
    setErrorMessage('')
    setPlaybackMessage(station.mediaType === 'podcast' ? 'Folge wird geladen ...' : 'Stream wird verbunden ...')
    setIsPlaying(false)
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    setCurrentStation(station)
    audio.defaultMuted = false
    audio.muted = false
    audio.volume = 1
    audio.src = station.streamUrl
    audio.load()
    void audio.play().catch((error: unknown) => {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unbekannter Fehler'
      setErrorMessage(`Start fehlgeschlagen: ${reason}`)
    })
  }, [])

  const showItems = useCallback((nextItems: RadioStation[], nextView: View, message: string) => {
    setItems(nextItems)
    setView(nextView)
    setLastListIndex(0)
    setActiveIndex(0)
    setStatusMessage(message)
  }, [])

  const loadRadioCatalog = useCallback(async (name = '') => {
    setIsLoading(true)
    setStatusMessage(name ? `Suche nach „${name}“ ...` : 'Öffentliche Radios werden geladen ...')
    try {
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
      const results = (await response.json()) as RadioBrowserStation[]
      const stations = results
        .filter((station) => station.name && station.url_resolved)
        .map<RadioStation>((station) => ({
          id: `radio-${station.stationuuid}`,
          name: station.name.trim(),
          genre: [station.tags.split(',')[0], station.codec, station.bitrate ? `${station.bitrate} kbit/s` : '']
            .filter(Boolean)
            .join(' · '),
          streamUrl: station.url_resolved,
          logoUrl: station.favicon,
          mediaType: 'radio',
        }))
      if (!stations.length) throw new Error('Keine Sender gefunden')
      showItems(stations, 'radio', `${stations.length} Radios ${name ? 'gefunden' : 'geladen'}.`)
    } catch (error) {
      setStatusMessage(`Radio-Suche fehlgeschlagen: ${error instanceof Error ? error.message : 'Fehler'}`)
    } finally {
      setIsLoading(false)
    }
  }, [showItems])

  const loadPodcastShows = useCallback(async (term = 'Nachrichten Wissen Geschichte') => {
    setIsLoading(true)
    setStatusMessage(`Podcast-Suche nach „${term}“ ...`)
    try {
      const results = await requestPodcastJsonp<PodcastShow>('search', {
        term,
        country: 'DE',
        media: 'podcast',
        entity: 'podcast',
        limit: '60',
      })
      const shows = results
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
      if (!shows.length) throw new Error('Keine Podcasts gefunden')
      setSelectedPodcast(null)
      setPodcastShows(shows)
      showItems(shows, 'podcast-shows', `${shows.length} Podcast-Sendungen gefunden.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Podcasts konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [showItems])

  const loadPodcastEpisodes = useCallback(async (show: RadioStation) => {
    if (!show.collectionId) return
    setIsLoading(true)
    setStatusMessage(`Folgen von „${show.name}“ werden geladen ...`)
    try {
      const results = await requestPodcastJsonp<PodcastEpisode>('lookup', {
        id: String(show.collectionId),
        entity: 'podcastEpisode',
        limit: '100',
        country: 'DE',
      })
      const episodes = results
        .filter((episode) => episode.episodeUrl && episode.trackName)
        .map<RadioStation>((episode) => ({
          id: `podcast-${episode.trackId}`,
          name: episode.trackName,
          genre: `${new Date(episode.releaseDate).toLocaleDateString('de-DE')} · ${episode.collectionName}`,
          streamUrl: episode.episodeUrl,
          logoUrl: episode.artworkUrl600 || episode.artworkUrl160 || show.logoUrl,
          mediaType: 'podcast',
          collectionId: show.collectionId,
          releaseDate: episode.releaseDate,
        }))
      if (!episodes.length) throw new Error('Keine abspielbaren Folgen gefunden')
      setSelectedPodcast(show)
      showItems(episodes, 'podcast-episodes', `${episodes.length} Folgen geladen.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Folgen konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [showItems])

  const toggleFavorite = useCallback(() => {
    if (!favoriteTarget) {
      setStatusMessage('Wähle zuerst einen Radiosender aus.')
      return
    }
    setFavorites((current) => {
      const exists = current.some((favorite) => favorite.id === favoriteTarget.id)
      setStatusMessage(exists ? 'Aus Favoriten entfernt.' : 'Zu Favoriten hinzugefügt.')
      return exists
        ? current.filter((favorite) => favorite.id !== favoriteTarget.id)
        : [...current, favoriteTarget]
    })
  }, [favoriteTarget])

  const showFavorites = useCallback(() => {
    showItems(favorites, 'favorites', favorites.length ? `${favorites.length} Favoriten.` : 'Noch keine Favoriten gespeichert.')
  }, [favorites, showItems])

  const activateItem = useCallback((item: RadioStation) => {
    if (item.mediaType === 'podcast-show') void loadPodcastEpisodes(item)
    else playStation(item)
  }, [loadPodcastEpisodes, playStation])

  const goBackFromEpisodes = useCallback(() => {
    if (view === 'podcast-episodes' && podcastShows.length) {
      setSelectedPodcast(null)
      showItems(podcastShows, 'podcast-shows', `${podcastShows.length} Podcast-Sendungen.`)
    }
  }, [podcastShows, showItems, view])

  const submitSearch = useCallback((event?: FormEvent) => {
    event?.preventDefault()
    const term = searchTerm.trim()
    if (!term) return
    setIsSearchOpen(false)
    if (view === 'podcast-shows' || view === 'podcast-episodes') void loadPodcastShows(term)
    else void loadRadioCatalog(term)
  }, [loadPodcastShows, loadRadioCatalog, searchTerm, view])

  const importM3u = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const imported = parseM3u(String(reader.result ?? ''), file.name)
      if (!imported.length) {
        setStatusMessage('Keine Stream-URLs in der Datei gefunden.')
        return
      }
      showItems(imported, 'local', `${imported.length} Sender aus ${file.name} geladen.`)
    }
    reader.onerror = () => setStatusMessage('Die M3U-Datei konnte nicht gelesen werden.')
    reader.readAsText(file)
    event.target.value = ''
  }, [showItems])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSearchOpen) return
      const isOkKey = event.key === 'Enter' || event.keyCode === 13
      const isFavoriteKey = event.key.toLowerCase() === 'f' || event.keyCode === 405
      const isBackKey = event.key === 'Escape' || event.keyCode === 461
      if (isFavoriteKey) {
        event.preventDefault()
        toggleFavorite()
        return
      }
      if (isBackKey && view === 'podcast-episodes') {
        event.preventDefault()
        goBackFromEpisodes()
        return
      }
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && !isOkKey) return
      event.preventDefault()

      if (isOkKey) {
        if (activeIndex === RADIO_FOCUS) void loadRadioCatalog()
        else if (activeIndex === PODCAST_FOCUS) void loadPodcastShows()
        else if (activeIndex === FAVORITES_FOCUS) showFavorites()
        else if (activeIndex === SEARCH_FOCUS) setIsSearchOpen(true)
        else if (activeIndex === STAR_FOCUS) toggleFavorite()
        else if (activeIndex === IMPORT_FOCUS) fileInputRef.current?.click()
        else if (items[activeIndex]) activateItem(items[activeIndex])
        return
      }

      if (activeIndex < 0) {
        const headerIndex = HEADER_FOCUSES.indexOf(activeIndex)
        if (event.key === 'ArrowLeft' && headerIndex > 0) setActiveIndex(HEADER_FOCUSES[headerIndex - 1])
        else if (event.key === 'ArrowRight' && headerIndex < HEADER_FOCUSES.length - 1) setActiveIndex(HEADER_FOCUSES[headerIndex + 1])
        else if (event.key === 'ArrowDown' && items.length) setActiveIndex(Math.min(lastListIndex, items.length - 1))
        return
      }

      const pageStart = Math.floor(activeIndex / PAGE_SIZE) * PAGE_SIZE
      const pageEnd = Math.min(pageStart + PAGE_SIZE, items.length) - 1
      const localIndex = activeIndex - pageStart
      if (event.key === 'ArrowUp') {
        if (localIndex < COLUMN_COUNT) setActiveIndex(view.startsWith('podcast') ? PODCAST_FOCUS : RADIO_FOCUS)
        else setActiveIndex(activeIndex - COLUMN_COUNT)
      } else if (event.key === 'ArrowDown') {
        const nextIndex = activeIndex + COLUMN_COUNT
        if (nextIndex < items.length) setActiveIndex(nextIndex)
      } else if (event.key === 'ArrowLeft') {
        if (localIndex % COLUMN_COUNT === 1) setActiveIndex(activeIndex - 1)
        else if (pageStart > 0) setActiveIndex(pageStart - 1)
      } else if (event.key === 'ArrowRight') {
        if (localIndex % COLUMN_COUNT === 0 && activeIndex < pageEnd) setActiveIndex(activeIndex + 1)
        else if (activeIndex === pageEnd && activeIndex < items.length - 1) setActiveIndex(activeIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activateItem,
    activeIndex,
    goBackFromEpisodes,
    isSearchOpen,
    items,
    lastListIndex,
    loadPodcastShows,
    loadRadioCatalog,
    showFavorites,
    toggleFavorite,
    view,
  ])

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
    }
  }, [])

  const title = view === 'podcast-episodes'
    ? selectedPodcast?.name || 'Folgen'
    : view === 'podcast-shows'
      ? 'Podcasts'
      : view === 'favorites'
        ? 'Favoriten'
        : 'Sender'

  const headerButtons = [
    { focus: RADIO_FOCUS, label: 'Radios', action: () => void loadRadioCatalog(), active: view === 'radio' },
    { focus: PODCAST_FOCUS, label: 'Podcasts', action: () => void loadPodcastShows(), active: view.startsWith('podcast') },
    { focus: FAVORITES_FOCUS, label: `Favoriten ${favorites.length}`, action: showFavorites, active: view === 'favorites' },
    { focus: SEARCH_FOCUS, label: 'Suche', action: () => setIsSearchOpen(true), active: false },
    { focus: STAR_FOCUS, label: isFavoriteTarget ? '★' : '☆', action: toggleFavorite, active: isFavoriteTarget },
    { focus: IMPORT_FOCUS, label: 'M3U', action: () => fileInputRef.current?.click(), active: view === 'local' },
  ]

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-900 text-white">
      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onLoadStart={() => setPlaybackMessage('Audio wird geladen ...')}
        onCanPlay={() => setPlaybackMessage('Audio bereit ...')}
        onWaiting={() => setPlaybackMessage('Audio puffert ...')}
        onPlaying={() => {
          setIsPlaying(true)
          setPlaybackMessage(currentStation?.mediaType === 'podcast' ? 'PODCAST LÄUFT' : 'LIVE · Lautstärke 100 %')
          setErrorMessage('')
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          const code = audioRef.current?.error?.code ?? 0
          setErrorMessage(mediaErrorMessages[code] ?? 'Audio ist momentan nicht erreichbar.')
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl"
        onChange={importM3u}
        className="hidden"
      />

      <div className="grid h-full grid-cols-[49%_51%]">
        <section className="flex h-full flex-col border-r border-slate-700/70 bg-slate-950/40 px-10 py-7">
          <header className="mb-5">
            <div className="flex items-end justify-between gap-6">
              <div className="min-w-0">
                <p className="text-base font-semibold uppercase tracking-[0.35em] text-purple-400">Web Radio</p>
                <h1 className="mt-1 max-w-md truncate text-4xl font-black tracking-tight">{title}</h1>
              </div>
              {view === 'podcast-episodes' && (
                <span className="shrink-0 text-base text-slate-400">Zurück-Taste: Sendungen</span>
              )}
            </div>
            <div className="mt-5 flex gap-3">
              {headerButtons.map((button) => (
                <button
                  key={button.focus}
                  type="button"
                  tabIndex={-1}
                  disabled={isLoading}
                  onClick={button.action}
                  className={`rounded-xl border px-4 py-3 text-base font-bold transition-all ${
                    activeIndex === button.focus
                      ? 'scale-105 border-purple-300 bg-purple-600 ring-4 ring-purple-400'
                      : button.active
                        ? 'border-purple-500 bg-purple-950 text-purple-200'
                        : 'border-slate-600 bg-slate-800 text-slate-200'
                  }`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-5 p-2">
            {visibleItems.map((item, localIndex) => {
              const index = pageIndex * PAGE_SIZE + localIndex
              const isFocused = activeIndex === index
              const isCurrent = currentStation?.id === item.id
              return (
                <article
                  key={item.id}
                  role="button"
                  tabIndex={-1}
                  onClick={() => {
                    setActiveIndex(index)
                    activateItem(item)
                  }}
                  className={`relative flex min-h-0 items-center gap-4 rounded-3xl border p-4 transition-all duration-200 ${
                    isFocused
                      ? 'z-10 scale-105 border-purple-400 bg-slate-800 shadow-2xl shadow-purple-950/70 ring-4 ring-purple-500'
                      : 'border-slate-700 bg-slate-800/55'
                  }`}
                >
                  <StationLogo station={item} />
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-xl font-bold leading-tight">{item.name}</h2>
                    <p className="mt-2 line-clamp-2 text-base text-slate-300">{item.genre}</p>
                  </div>
                  {favoriteIds.has(item.id) && <span className="absolute right-3 top-2 text-2xl text-amber-300">★</span>}
                  {isCurrent && isPlaying && <span className="absolute bottom-3 right-3 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />}
                </article>
              )
            })}
            {!items.length && (
              <div className="col-span-2 row-span-3 flex items-center justify-center text-center text-2xl text-slate-400">
                Keine Einträge vorhanden.
              </div>
            )}
          </div>

          <footer className="mt-4 flex items-center justify-between gap-4 text-base text-slate-300">
            <span><strong className="text-white">← ↑ ↓ →</strong> Navigieren</span>
            <span><strong className="rounded-md bg-white px-2 py-1 text-slate-950">OK</strong> Öffnen</span>
            <span><strong className="text-amber-300">F / Gelb</strong> Favorit</span>
            <span className="text-purple-300">{pageIndex + 1}/{pageCount}</span>
          </footer>
          {statusMessage && <p className="mt-2 truncate text-base text-emerald-400">{statusMessage}</p>}
        </section>

        <section className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950 px-16 py-10">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
          {currentStation ? (
            <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
              <p className="mb-7 text-xl font-bold uppercase tracking-[0.4em] text-purple-400">
                {currentStation.mediaType === 'podcast' ? 'Podcast-Folge' : 'Now Playing'}
              </p>
              <div className="rounded-[3rem] bg-slate-800/80 p-6 shadow-2xl ring-1 ring-white/10">
                <StationLogo station={currentStation} large />
              </div>
              <div className="mt-8 w-full overflow-hidden">
                <h2 className={`${currentStation.name.length > 24 ? 'marquee-track' : ''} text-5xl font-black tracking-tight`}>
                  {currentStation.name}
                </h2>
              </div>
              <p className="mt-4 text-2xl font-medium text-slate-300">{currentStation.genre}</p>
              <div className="mt-8 flex h-16 items-end justify-center gap-3">
                {[48, 62, 54, 64, 45].map((height, index) => (
                  <span
                    key={index}
                    className={`w-4 rounded-full bg-gradient-to-t from-purple-600 to-fuchsia-300 ${isPlaying ? 'equalizer-bar' : 'opacity-25'}`}
                    style={{ height }}
                  />
                ))}
              </div>
              <p className={`mt-5 text-xl font-semibold ${errorMessage ? 'text-rose-400' : isPlaying ? 'text-emerald-400' : 'text-slate-400'}`}>
                {errorMessage || playbackMessage || 'Bereit'}
              </p>
            </div>
          ) : (
            <div className="relative z-10 max-w-2xl text-center">
              <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-purple-500/15 text-8xl text-purple-300 ring-2 ring-purple-400/30">♪</div>
              <h2 className="mt-10 text-6xl font-black">Bereit zum Hören</h2>
              <p className="mt-6 text-2xl leading-relaxed text-slate-300">
                Suche Radios, speichere Favoriten oder öffne einen Podcast und wähle eine Folge.
              </p>
            </div>
          )}
        </section>
      </div>

      {isSearchOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-24">
          <form onSubmit={submitSearch} className="w-full max-w-4xl rounded-[2.5rem] border border-purple-500 bg-slate-900 p-12 shadow-2xl ring-4 ring-purple-500/40">
            <p className="text-xl font-bold uppercase tracking-[0.3em] text-purple-400">
              {view.startsWith('podcast') ? 'Podcasts suchen' : 'Radios suchen'}
            </p>
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape' || event.keyCode === 461) setIsSearchOpen(false)
              }}
              placeholder="Suchbegriff eingeben ..."
              className="mt-8 w-full rounded-2xl border-4 border-purple-400 bg-slate-800 px-7 py-6 text-4xl text-white outline-none placeholder:text-slate-500"
            />
            <div className="mt-8 flex justify-between text-xl text-slate-300">
              <span><strong className="text-white">OK / Enter</strong> Suchen</span>
              <span><strong className="text-white">Zurück</strong> Abbrechen</span>
            </div>
          </form>
        </div>
      )}
    </main>
  )
}

export default App
