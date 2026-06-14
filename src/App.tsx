import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  PodcastEpisode,
  PodcastShow,
  RadioBrowserStation,
  RadioStation,
  StreamMetadata,
} from './types'

const PAGE_SIZE = 6
const COLUMN_COUNT = 2
const FILTER_NEWEST_FOCUS = -13
const FILTER_OLDEST_FOCUS = -12
const FILTER_UNHEARD_FOCUS = -11
const FILTER_HEARD_FOCUS = -10
const EPISODE_FILTER_FOCUSES = [
  FILTER_NEWEST_FOCUS,
  FILTER_OLDEST_FOCUS,
  FILTER_UNHEARD_FOCUS,
  FILTER_HEARD_FOCUS,
]
const HISTORY_FOCUS = -14
const SPEED_FOCUS = -15
const SLEEP_FOCUS = -16
const PLAYBACK_FOCUS = -9
const VOLUME_FOCUS = -8
const SEEK_FOCUS = -7
const RADIO_FOCUS = -6
const PODCAST_FOCUS = -5
const FAVORITES_FOCUS = -4
const SEARCH_FOCUS = -3
const STAR_FOCUS = -2
const HEADER_FOCUSES = [
  RADIO_FOCUS,
  PODCAST_FOCUS,
  FAVORITES_FOCUS,
  HISTORY_FOCUS,
  SEARCH_FOCUS,
  STAR_FOCUS,
]
const RADIO_BROWSER_API = 'https://de1.api.radio-browser.info/json/stations/search'
const PODCAST_API = 'https://itunes.apple.com'
const FAVORITES_KEY = 'webos-radio-favorites'
const VOLUME_KEY = 'webos-radio-volume'
const LISTENED_EPISODES_KEY = 'webos-radio-listened-episodes'
const PODCAST_POSITIONS_KEY = 'webos-radio-podcast-positions'
const PODCAST_SUBSCRIPTIONS_KEY = 'webos-radio-podcast-subscriptions'
const KNOWN_EPISODES_KEY = 'webos-radio-known-episodes'
const HISTORY_KEY = 'webos-radio-history'
const NAVIGATION_STATE_KEY = 'webos-radio-navigation-state'

type View = 'radio' | 'favorites' | 'subscriptions' | 'history' | 'podcast-shows' | 'podcast-episodes' | 'local'
type EpisodeFilter = 'newest' | 'oldest' | 'unheard' | 'heard'

interface NavigationState {
  items: RadioStation[]
  view: View
  activeIndex: number
  lastListIndex: number
  playerReturnFocus: number
  podcastShows: RadioStation[]
  podcastEpisodes: RadioStation[]
  selectedPodcast: RadioStation | null
  currentStation: RadioStation | null
  episodeFilter: EpisodeFilter
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2]
const CUSTOM_SLEEP_OPTION = -1
const SLEEP_OPTIONS = [0, 1, 15, 30, 60, 90, CUSTOM_SLEEP_OPTION]

const views: View[] = ['radio', 'favorites', 'subscriptions', 'history', 'podcast-shows', 'podcast-episodes', 'local']
const episodeFilters: EpisodeFilter[] = ['newest', 'oldest', 'unheard', 'heard']

function loadNavigationState(): NavigationState | null {
  try {
    const stored = JSON.parse(localStorage.getItem(NAVIGATION_STATE_KEY) ?? 'null') as Partial<NavigationState> | null
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
  } catch {
    return null
  }
}

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

function normalizeMediaUrl(url: string) {
  return url.trim().replace(/&amp;/gi, '&')
}

function isCompatibleMediaUrl(url: string) {
  return /^https:\/\//i.test(url)
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function filterEpisodes(
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

function favoritesFirst(entries: RadioStation[], favoriteIds: Set<string>) {
  return [
    ...entries.filter((entry) => favoriteIds.has(entry.id)),
    ...entries.filter((entry) => !favoriteIds.has(entry.id)),
  ]
}

function isSameMedia(first: RadioStation, second: RadioStation) {
  if (first.id === second.id) return true
  return Boolean(first.streamUrl && second.streamUrl
    && normalizeMediaUrl(first.streamUrl) === normalizeMediaUrl(second.streamUrl))
}

function prependPreferred(entries: RadioStation[], preferredEntries: RadioStation[]) {
  return [
    ...preferredEntries,
    ...entries.filter((entry) => !preferredEntries.some((preferred) => isSameMedia(entry, preferred))),
  ]
}

function getPlayableMediaUrl(url: string) {
  const normalizedUrl = normalizeMediaUrl(url)
  if (!/^https?:\/\//i.test(normalizedUrl)) return normalizedUrl
  const configuredProxy = import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined
  const sameOriginProxy = window.location.protocol === 'http:' || window.location.protocol === 'https:'
  const proxyBase = configuredProxy || (sameOriginProxy ? '/media-proxy' : '')
  return proxyBase
    ? `${proxyBase}?url=${encodeURIComponent(normalizedUrl)}`
    : normalizedUrl
}

function getMetadataUrl(url: string) {
  const normalizedUrl = normalizeMediaUrl(url)
  const configuredProxy = import.meta.env.VITE_METADATA_PROXY_URL as string | undefined
  const sameOriginProxy = window.location.protocol === 'http:' || window.location.protocol === 'https:'
  const proxyBase = configuredProxy || (sameOriginProxy ? '/media-metadata' : '')
  return proxyBase ? `${proxyBase}?url=${encodeURIComponent(normalizedUrl)}` : ''
}

function StationLogo({
  station,
  large = false,
  compact = false,
}: {
  station: RadioStation
  large?: boolean
  compact?: boolean
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const sizeClasses = large
    ? compact
      ? 'h-[clamp(8rem,18vh,13rem)] w-[clamp(8rem,18vh,13rem)] rounded-[1.5rem] text-6xl'
      : 'h-[clamp(13rem,34vh,22rem)] w-[clamp(13rem,34vh,22rem)] rounded-[2rem] text-8xl'
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
  const [initialNavigationState] = useState(loadNavigationState)
  const audioRef = useRef<HTMLAudioElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const customSleepInputRef = useRef<HTMLInputElement>(null)
  const pendingResumeRef = useRef(0)
  const lastPositionSaveRef = useRef(0)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)
  const userStoppedRef = useRef(false)
  const [items, setItems] = useState<RadioStation[]>(initialNavigationState?.items ?? defaultStations)
  const [lastListIndex, setLastListIndex] = useState(initialNavigationState?.lastListIndex ?? 0)
  const [podcastShows, setPodcastShows] = useState<RadioStation[]>(initialNavigationState?.podcastShows ?? [])
  const [podcastEpisodes, setPodcastEpisodes] = useState<RadioStation[]>(initialNavigationState?.podcastEpisodes ?? [])
  const [episodeFilter, setEpisodeFilter] = useState<EpisodeFilter>(initialNavigationState?.episodeFilter ?? 'newest')
  const [listenedEpisodes, setListenedEpisodes] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LISTENED_EPISODES_KEY) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const [podcastPositions, setPodcastPositions] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PODCAST_POSITIONS_KEY) ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  })
  const [subscriptions, setSubscriptions] = useState<RadioStation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PODCAST_SUBSCRIPTIONS_KEY) ?? '[]') as RadioStation[]
    } catch {
      return []
    }
  })
  const [knownEpisodes, setKnownEpisodes] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(KNOWN_EPISODES_KEY) ?? '{}') as Record<string, string[]>
    } catch {
      return {}
    }
  })
  const [newEpisodeIds, setNewEpisodeIds] = useState<string[]>([])
  const [history, setHistory] = useState<RadioStation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as RadioStation[]
    } catch {
      return []
    }
  })
  const [view, setView] = useState<View>(initialNavigationState?.view ?? 'local')
  const [activeIndex, setActiveIndex] = useState(initialNavigationState?.activeIndex ?? 0)
  const [playerReturnFocus, setPlayerReturnFocus] = useState(initialNavigationState?.playerReturnFocus ?? 0)
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(initialNavigationState?.currentStation ?? null)
  const [selectedPodcast, setSelectedPodcast] = useState<RadioStation | null>(initialNavigationState?.selectedPodcast ?? null)
  const [favorites, setFavorites] = useState<RadioStation[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as RadioStation[]
    } catch {
      return []
    }
  })
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(() => {
    const storedVolume = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1
      ? storedVolume
      : 1
  })
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackMessage, setPlaybackMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [favoriteRemovalTarget, setFavoriteRemovalTarget] = useState<RadioStation | null>(null)
  const [favoriteRemovalAction, setFavoriteRemovalAction] = useState<'cancel' | 'remove'>('cancel')
  const [searchTerm, setSearchTerm] = useState('')
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [sleepMinutes, setSleepMinutes] = useState(0)
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null)
  const [sleepRemaining, setSleepRemaining] = useState(0)
  const [isCustomSleepOpen, setIsCustomSleepOpen] = useState(false)
  const [customSleepMinutes, setCustomSleepMinutes] = useState('')
  const [customSleepError, setCustomSleepError] = useState('')
  const [streamMetadata, setStreamMetadata] = useState<StreamMetadata>({ title: '', station: '' })

  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => favorite.id)), [favorites])
  const subscriptionIds = useMemo(() => new Set(subscriptions.map((subscription) => subscription.id)), [subscriptions])
  const preferredIds = useMemo(
    () => new Set([...favoriteIds, ...subscriptionIds]),
    [favoriteIds, subscriptionIds],
  )
  const preferredEntries = useMemo(() => {
    if (view === 'radio' || view === 'local') {
      return favorites.filter((favorite) => favorite.mediaType === 'radio')
    }
    if (view === 'podcast-shows') return subscriptions
    if (view === 'podcast-episodes') {
      return favorites.filter((favorite) => favorite.mediaType === 'podcast'
        && (!selectedPodcast?.collectionId || favorite.collectionId === selectedPodcast.collectionId))
    }
    return []
  }, [favorites, selectedPodcast, subscriptions, view])
  const orderedItems = useMemo(
    () => preferredEntries.length
      ? prependPreferred(items, preferredEntries)
      : favoritesFirst(items, preferredIds),
    [items, preferredEntries, preferredIds],
  )
  const listIndex = activeIndex < 0 ? lastListIndex : activeIndex
  const pageIndex = Math.floor(listIndex / PAGE_SIZE)
  const pageCount = Math.max(1, Math.ceil(orderedItems.length / PAGE_SIZE))
  const visibleItems = useMemo(
    () => orderedItems.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE),
    [orderedItems, pageIndex],
  )
  const focusedItem = orderedItems[listIndex] ?? null
  const favoriteTarget = focusedItem?.mediaType === 'radio'
    || focusedItem?.mediaType === 'podcast'
    || focusedItem?.mediaType === 'podcast-show'
    ? focusedItem
    : currentStation?.mediaType === 'radio' || currentStation?.mediaType === 'podcast'
      ? currentStation
      : null
  const listenedEpisodeIds = useMemo(() => new Set(listenedEpisodes), [listenedEpisodes])
  const newEpisodeIdSet = useMemo(() => new Set(newEpisodeIds), [newEpisodeIds])
  const isFavoriteEntry = useCallback(
    (entry: RadioStation) => favorites.some((favorite) => isSameMedia(entry, favorite)),
    [favorites],
  )
  const isFavoriteTarget = favoriteTarget
    ? favoriteTarget.mediaType === 'podcast-show'
      ? subscriptionIds.has(favoriteTarget.id)
      : isFavoriteEntry(favoriteTarget)
    : false

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites))
  }, [favorites])

  useEffect(() => {
    localStorage.setItem(VOLUME_KEY, String(volume))
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    localStorage.setItem(LISTENED_EPISODES_KEY, JSON.stringify(listenedEpisodes))
  }, [listenedEpisodes])

  useEffect(() => {
    localStorage.setItem(PODCAST_POSITIONS_KEY, JSON.stringify(podcastPositions))
  }, [podcastPositions])

  useEffect(() => {
    localStorage.setItem(PODCAST_SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions))
  }, [subscriptions])

  useEffect(() => {
    localStorage.setItem(KNOWN_EPISODES_KEY, JSON.stringify(knownEpisodes))
  }, [knownEpisodes])

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }, [history])

  useEffect(() => {
    const navigationState: NavigationState = {
      items,
      view,
      activeIndex,
      lastListIndex,
      playerReturnFocus,
      podcastShows,
      podcastEpisodes,
      selectedPodcast,
      currentStation,
      episodeFilter,
    }
    localStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(navigationState))
  }, [
    activeIndex,
    currentStation,
    episodeFilter,
    items,
    lastListIndex,
    playerReturnFocus,
    podcastEpisodes,
    podcastShows,
    selectedPodcast,
    view,
  ])

  useEffect(() => {
    const legacySubscriptions = favorites.filter((favorite) => favorite.mediaType === 'podcast-show')
    if (!legacySubscriptions.length) return
    setSubscriptions((current) => {
      const currentIds = new Set(current.map((subscription) => subscription.id))
      return [...current, ...legacySubscriptions.filter((subscription) => !currentIds.has(subscription.id))]
    })
    setFavorites((current) => current.filter((favorite) => favorite.mediaType !== 'podcast-show'))
  }, [])

  useEffect(() => {
    if (activeIndex >= 0) setLastListIndex(activeIndex)
  }, [activeIndex])

  useEffect(() => {
    if (isSearchOpen) window.setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [isSearchOpen])

  useEffect(() => {
    if (isCustomSleepOpen) window.setTimeout(() => customSleepInputRef.current?.focus(), 50)
  }, [isCustomSleepOpen])

  const playStation = useCallback((station: RadioStation) => {
    const audio = audioRef.current
    if (!audio || !station.streamUrl) return
    if (currentStation?.mediaType === 'podcast' && audio.currentTime > 0) {
      setPodcastPositions((current) => ({ ...current, [currentStation.id]: audio.currentTime }))
    }
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
    retryCountRef.current = 0
    userStoppedRef.current = false
    setErrorMessage('')
    setStreamMetadata({ title: '', station: '' })
    setPlaybackMessage(station.mediaType === 'podcast' ? 'Folge wird geladen ...' : 'Stream wird verbunden ...')
    setIsPlaying(false)
    const resumePosition = station.mediaType === 'podcast' ? podcastPositions[station.id] ?? 0 : 0
    pendingResumeRef.current = resumePosition
    lastPositionSaveRef.current = resumePosition
    setCurrentTime(resumePosition)
    setDuration(0)
    audio.pause()
    setCurrentStation(station)
    audio.defaultMuted = isMuted
    audio.muted = isMuted
    audio.volume = volume
    audio.playbackRate = station.mediaType === 'podcast' ? playbackSpeed : 1
    const mediaUrl = getPlayableMediaUrl(station.streamUrl)
    audio.src = mediaUrl
    setHistory((current) => [
      { ...station, lastPlayedAt: Date.now() },
      ...current.filter((entry) => entry.id !== station.id),
    ].slice(0, 50))
    void audio.play().catch((error: unknown) => {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unbekannter Fehler'
      setErrorMessage(`Start fehlgeschlagen: ${reason}`)
    })
  }, [currentStation, isMuted, playbackSpeed, podcastPositions, volume])

  const handleMediaError = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentStation || userStoppedRef.current) return
    const nextAttempt = retryCountRef.current + 1
    retryCountRef.current = nextAttempt

    if (nextAttempt <= 3) {
      const delaySeconds = 2 ** (nextAttempt - 1)
      setPlaybackMessage(`Verbindung unterbrochen · Versuch ${nextAttempt}/3 in ${delaySeconds} Sek.`)
      retryTimerRef.current = window.setTimeout(() => {
        pendingResumeRef.current = audio.currentTime
        audio.src = getPlayableMediaUrl(currentStation.streamUrl)
        audio.playbackRate = currentStation.mediaType === 'podcast' ? playbackSpeed : 1
        void audio.play().catch(() => undefined)
      }, delaySeconds * 1000)
      return
    }

    if (currentStation.mediaType === 'radio') {
      const currentIndex = orderedItems.findIndex((item) => item.id === currentStation.id)
      const nextStation = orderedItems
        .slice(currentIndex + 1)
        .find((item) => item.mediaType === 'radio' && item.streamUrl)
        ?? orderedItems.find((item) => item.mediaType === 'radio' && item.id !== currentStation.id && item.streamUrl)
      if (nextStation) {
        setStatusMessage(`„${currentStation.name}“ ist nicht erreichbar. Wechsle zu „${nextStation.name}“.`)
        playStation(nextStation)
        return
      }
    }

    const code = audio.error?.code ?? 0
    setErrorMessage(mediaErrorMessages[code] ?? 'Audio ist momentan nicht erreichbar.')
  }, [currentStation, orderedItems, playbackSpeed, playStation])

  const seekPodcast = useCallback((nextTime: number) => {
    const audio = audioRef.current
    if (!audio || currentStation?.mediaType !== 'podcast' || !Number.isFinite(audio.duration)) return
    const clampedTime = Math.max(0, Math.min(nextTime, audio.duration))
    audio.currentTime = clampedTime
    setCurrentTime(clampedTime)
  }, [currentStation])

  const seekBy = useCallback((seconds: number) => {
    seekPodcast((audioRef.current?.currentTime ?? currentTime) + seconds)
  }, [currentTime, seekPodcast])

  const changeVolume = useCallback((nextVolume: number) => {
    const normalizedVolume = Math.max(0, Math.min(1, nextVolume))
    setVolume(normalizedVolume)
    if (normalizedVolume > 0) {
      setIsMuted(false)
      if (audioRef.current) audioRef.current.muted = false
    }
  }, [])

  const changeVolumeBy = useCallback((amount: number) => {
    changeVolume(volume + amount)
  }, [changeVolume, volume])

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => {
      const nextMuted = !muted
      if (audioRef.current) audioRef.current.muted = nextMuted
      return nextMuted
    })
  }, [])

  const changePlaybackSpeed = useCallback((direction: number) => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const nextIndex = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, currentIndex + direction))
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex]
    setPlaybackSpeed(nextSpeed)
    if (audioRef.current && currentStation?.mediaType === 'podcast') audioRef.current.playbackRate = nextSpeed
  }, [currentStation, playbackSpeed])

  const changeSleepOption = useCallback((direction: number) => {
    const currentIndex = SLEEP_OPTIONS.indexOf(sleepMinutes)
    const nextIndex = (currentIndex + direction + SLEEP_OPTIONS.length) % SLEEP_OPTIONS.length
    setSleepMinutes(SLEEP_OPTIONS[nextIndex])
  }, [sleepMinutes])

  const activateSleepTimer = useCallback(() => {
    if (sleepMinutes === CUSTOM_SLEEP_OPTION) {
      setCustomSleepMinutes('')
      setCustomSleepError('')
      setIsCustomSleepOpen(true)
      return
    }
    if (sleepMinutes === 0) {
      setSleepEndsAt(null)
      setSleepRemaining(0)
      setStatusMessage('Sleep-Timer ausgeschaltet.')
      return
    }
    const endsAt = Date.now() + sleepMinutes * 60_000
    setSleepEndsAt(endsAt)
    setSleepRemaining(sleepMinutes * 60)
    setStatusMessage(`Sleep-Timer auf ${sleepMinutes} Minuten gesetzt.`)
  }, [sleepMinutes])

  const submitCustomSleepTimer = useCallback((event?: FormEvent) => {
    event?.preventDefault()
    const minutes = Number(customSleepMinutes)
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      setCustomSleepError('Bitte eine ganze Zahl zwischen 1 und 1440 eingeben.')
      return
    }
    const endsAt = Date.now() + minutes * 60_000
    setSleepMinutes(minutes)
    setSleepEndsAt(endsAt)
    setSleepRemaining(minutes * 60)
    setStatusMessage(`Sleep-Timer auf ${minutes} Minuten gesetzt.`)
    setIsCustomSleepOpen(false)
    setCustomSleepError('')
  }, [customSleepMinutes])

  const toggleListened = useCallback(() => {
    const target = focusedItem?.mediaType === 'podcast'
      ? focusedItem
      : currentStation?.mediaType === 'podcast'
        ? currentStation
        : null
    if (!target) {
      setStatusMessage('Wähle zuerst eine Podcast-Folge aus.')
      return
    }
    setListenedEpisodes((current) => {
      const isListened = current.includes(target.id)
      setStatusMessage(isListened ? 'Folge als ungehört markiert.' : 'Folge als gehört markiert.')
      if (!isListened) {
        setPodcastPositions((positions) => {
          const next = { ...positions }
          delete next[target.id]
          return next
        })
      }
      return isListened ? current.filter((id) => id !== target.id) : [...current, target.id]
    })
  }, [currentStation, focusedItem])

  const focusPlayer = useCallback((returnFocus: number) => {
    if (!currentStation) return
    setPlayerReturnFocus(returnFocus)
    setActiveIndex(PLAYBACK_FOCUS)
  }, [currentStation])

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentStation) {
      setStatusMessage('Wähle zuerst einen Sender oder eine Podcast-Folge aus.')
      return
    }

    if (!audio.getAttribute('src')) {
      playStation(currentStation)
      return
    }

    if (audio.paused) {
      userStoppedRef.current = false
      audio.defaultMuted = isMuted
      audio.muted = isMuted
      audio.volume = volume
      setPlaybackMessage('Wiedergabe wird gestartet ...')
      void audio.play().catch((error: unknown) => {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'Unbekannter Fehler'
        setErrorMessage(`Start fehlgeschlagen: ${reason}`)
      })
    } else {
      userStoppedRef.current = true
      audio.pause()
      setPlaybackMessage('PAUSE')
    }
  }, [currentStation, isMuted, playStation, volume])

  useEffect(() => {
    if (!sleepEndsAt) return
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 1000))
      setSleepRemaining(remaining)
      if (remaining === 0) {
        userStoppedRef.current = true
        audioRef.current?.pause()
        setSleepEndsAt(null)
        setSleepMinutes(0)
        setSleepRemaining(0)
        setPlaybackMessage('Sleep-Timer beendet die Wiedergabe')
      }
    }
    updateTimer()
    const timer = window.setInterval(updateTimer, 1000)
    return () => window.clearInterval(timer)
  }, [sleepEndsAt])

  useEffect(() => {
    if (view !== 'podcast-episodes' || !['heard', 'unheard'].includes(episodeFilter)) return
    const filtered = favoritesFirst(
      filterEpisodes(podcastEpisodes, episodeFilter, listenedEpisodeIds),
      favoriteIds,
    )
    setItems(filtered)
    setActiveIndex((current) => current >= 0 ? Math.min(current, Math.max(0, filtered.length - 1)) : current)
  }, [episodeFilter, favoriteIds, listenedEpisodeIds, podcastEpisodes, view])

  useEffect(() => {
    if (!currentStation || currentStation.mediaType !== 'radio' || !isPlaying) return
    const metadataUrl = getMetadataUrl(currentStation.streamUrl)
    if (!metadataUrl) return
    let cancelled = false
    const loadMetadata = async () => {
      try {
        const response = await fetch(metadataUrl)
        if (!response.ok) return
        const metadata = await response.json() as StreamMetadata
        if (!cancelled) setStreamMetadata(metadata)
      } catch {
        // Metadata is optional; audio playback should continue if it is unavailable.
      }
    }
    void loadMetadata()
    const timer = window.setInterval(() => void loadMetadata(), 20_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [currentStation, isPlaying])

  const showItems = useCallback((nextItems: RadioStation[], nextView: View, message: string) => {
    setItems(nextItems)
    setView(nextView)
    setLastListIndex(0)
    setActiveIndex(0)
    setStatusMessage(message)
  }, [])

  const applyEpisodeFilter = useCallback((filter: EpisodeFilter, episodes = podcastEpisodes) => {
    const filteredEpisodes = filterEpisodes(episodes, filter, listenedEpisodeIds)
    setEpisodeFilter(filter)
    setItems(filteredEpisodes)
    setLastListIndex(0)
    const filterFocus: Record<EpisodeFilter, number> = {
      newest: FILTER_NEWEST_FOCUS,
      oldest: FILTER_OLDEST_FOCUS,
      unheard: FILTER_UNHEARD_FOCUS,
      heard: FILTER_HEARD_FOCUS,
    }
    setActiveIndex(filteredEpisodes.length ? 0 : filterFocus[filter])
    const labels: Record<EpisodeFilter, string> = {
      newest: 'Neu → Alt',
      oldest: 'Alt → Neu',
      unheard: 'Ungehört',
      heard: 'Gehört',
    }
    setStatusMessage(`${filteredEpisodes.length} Folgen · ${labels[filter]}`)
  }, [listenedEpisodeIds, podcastEpisodes])

  const markEpisodeListened = useCallback((episodeId: string) => {
    setListenedEpisodes((current) => current.includes(episodeId) ? current : [...current, episodeId])
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
      if (!episodes.length) throw new Error('Keine abspielbaren Folgen gefunden')
      const knownForShow = knownEpisodes[String(show.collectionId)] ?? []
      const isSubscribed = subscriptionIds.has(show.id)
      setNewEpisodeIds(isSubscribed && knownForShow.length
        ? episodes.filter((episode) => !knownForShow.includes(episode.id)).map((episode) => episode.id)
        : [])
      setKnownEpisodes((current) => ({
        ...current,
        [String(show.collectionId)]: episodes.map((episode) => episode.id),
      }))
      setSelectedPodcast(show)
      setPodcastEpisodes(episodes)
      setEpisodeFilter('newest')
      showItems(filterEpisodes(episodes, 'newest', listenedEpisodeIds), 'podcast-episodes', `${episodes.length} Folgen geladen.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Folgen konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }, [knownEpisodes, listenedEpisodeIds, showItems, subscriptionIds])

  const removeFavorite = useCallback((target: RadioStation) => {
    setFavorites((current) => current.filter((favorite) => !isSameMedia(favorite, target)))
    if (view === 'favorites') {
      setItems((current) => current.filter((item) => !isSameMedia(item, target)))
      setActiveIndex((current) => Math.max(0, Math.min(current, orderedItems.length - 2)))
    }
    setStatusMessage(`${target.mediaType === 'podcast' ? 'Podcast-Folge' : 'Radio'} aus Favoriten entfernt.`)
    setFavoriteRemovalTarget(null)
    setFavoriteRemovalAction('cancel')
  }, [orderedItems.length, view])

  const toggleFavorite = useCallback(() => {
    if (!favoriteTarget) {
      setStatusMessage('Wähle zuerst ein Radio, einen Podcast oder eine Folge aus.')
      return
    }
    if (favoriteTarget.mediaType === 'podcast-show') {
      setSubscriptions((current) => {
        const exists = current.some((subscription) => subscription.id === favoriteTarget.id)
        setStatusMessage(exists ? 'Podcast-Abo entfernt.' : 'Podcast abonniert.')
        return exists
          ? current.filter((subscription) => subscription.id !== favoriteTarget.id)
          : [...current, favoriteTarget]
      })
      return
    }

    const exists = favorites.some((favorite) => isSameMedia(favorite, favoriteTarget))
    if (exists) {
      setFavoriteRemovalTarget(favoriteTarget)
      setFavoriteRemovalAction('cancel')
      return
    }

    setFavorites((current) => {
      const nextFavorites = [...current, favoriteTarget]
      const typeLabel = favoriteTarget.mediaType === 'podcast' ? 'Podcast-Folge' : 'Radio'
      setStatusMessage(`${typeLabel} zu Favoriten hinzugefügt.`)
      const nextFavoriteIds = new Set(nextFavorites.map((favorite) => favorite.id))
      const nextPreferred = view === 'radio' || view === 'local'
        ? nextFavorites.filter((favorite) => favorite.mediaType === 'radio')
        : view === 'podcast-episodes'
          ? nextFavorites.filter((favorite) => favorite.mediaType === 'podcast'
            && (!selectedPodcast?.collectionId || favorite.collectionId === selectedPodcast.collectionId))
          : []
      const nextItems = nextPreferred.length
        ? prependPreferred(items, nextPreferred)
        : favoritesFirst(items, nextFavoriteIds)
      const nextIndex = nextItems.findIndex((item) => isSameMedia(item, favoriteTarget))
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex)
        setLastListIndex(nextIndex)
      }
      return nextFavorites
    })
  }, [favoriteTarget, favorites, items, selectedPodcast, view])

  const showFavorites = useCallback(() => {
    const relevantFavorites = view.startsWith('podcast')
      ? favorites.filter((favorite) => favorite.mediaType === 'podcast')
      : favorites.filter((favorite) => favorite.mediaType === 'radio')
    showItems(relevantFavorites, 'favorites', relevantFavorites.length ? `${relevantFavorites.length} Favoriten.` : 'Noch keine Favoriten gespeichert.')
  }, [favorites, showItems, view])

  const showSubscriptions = useCallback(() => {
    const podcastFavorites = favorites.filter((favorite) => favorite.mediaType === 'podcast')
    const entries = [...subscriptions, ...podcastFavorites]
    showItems(entries, 'subscriptions', entries.length ? `${subscriptions.length} Abos · ${podcastFavorites.length} Folgen-Favoriten.` : 'Noch keine Podcasts abonniert.')
  }, [favorites, showItems, subscriptions])

  const showHistory = useCallback(() => {
    const entries = history.map((entry) => ({
      ...entry,
      genre: entry.lastPlayedAt
        ? `Zuletzt ${new Date(entry.lastPlayedAt).toLocaleString('de-DE')} · ${entry.genre}`
        : entry.genre,
    }))
    showItems(entries, 'history', history.length ? `${history.length} zuletzt gehörte Einträge.` : 'Der Verlauf ist noch leer.')
  }, [history, showItems])

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (favoriteRemovalTarget) {
        event.preventDefault()
        const isOkKey = event.key === 'Enter' || event.keyCode === 13
        const isBackKey = event.key === 'Escape' || event.keyCode === 461
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          setFavoriteRemovalAction((current) => current === 'cancel' ? 'remove' : 'cancel')
        } else if (isOkKey) {
          if (favoriteRemovalAction === 'remove') removeFavorite(favoriteRemovalTarget)
          else setFavoriteRemovalTarget(null)
        } else if (isBackKey) {
          setFavoriteRemovalTarget(null)
          setFavoriteRemovalAction('cancel')
        }
        return
      }
      if (isCustomSleepOpen) return
      if (isSearchOpen) return
      const isOkKey = event.key === 'Enter' || event.keyCode === 13
      const isFavoriteKey = event.key.toLowerCase() === 'f' || event.keyCode === 405
      const isListenedKey = event.key.toLowerCase() === 'g' || event.keyCode === 406
      const isBackKey = event.key === 'Escape' || event.keyCode === 461
      const isPlayPauseKey = event.key === 'MediaPlayPause' || event.keyCode === 415 || event.keyCode === 19
      const isStopKey = event.key === 'MediaStop' || event.keyCode === 413
      if (isPlayPauseKey) {
        event.preventDefault()
        togglePlayback()
        return
      }
      if (isStopKey) {
        event.preventDefault()
        userStoppedRef.current = true
        audioRef.current?.pause()
        if (audioRef.current) audioRef.current.currentTime = 0
        setPlaybackMessage('GESTOPPT')
        return
      }
      if (isFavoriteKey) {
        event.preventDefault()
        toggleFavorite()
        return
      }
      if (isListenedKey) {
        event.preventDefault()
        toggleListened()
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
        if (activeIndex === FILTER_NEWEST_FOCUS) applyEpisodeFilter('newest')
        else if (activeIndex === FILTER_OLDEST_FOCUS) applyEpisodeFilter('oldest')
        else if (activeIndex === FILTER_UNHEARD_FOCUS) applyEpisodeFilter('unheard')
        else if (activeIndex === FILTER_HEARD_FOCUS) applyEpisodeFilter('heard')
        else if (activeIndex === SPEED_FOCUS) changePlaybackSpeed(1)
        else if (activeIndex === SLEEP_FOCUS) activateSleepTimer()
        else if (activeIndex === PLAYBACK_FOCUS) togglePlayback()
        else if (activeIndex === VOLUME_FOCUS) toggleMute()
        else if (activeIndex === SEEK_FOCUS) togglePlayback()
        else if (activeIndex === RADIO_FOCUS) void loadRadioCatalog()
        else if (activeIndex === PODCAST_FOCUS) void loadPodcastShows()
        else if (activeIndex === FAVORITES_FOCUS) {
          if (view.startsWith('podcast') || view === 'subscriptions') showSubscriptions()
          else showFavorites()
        }
        else if (activeIndex === HISTORY_FOCUS) showHistory()
        else if (activeIndex === SEARCH_FOCUS) setIsSearchOpen(true)
        else if (activeIndex === STAR_FOCUS) toggleFavorite()
        else if (orderedItems[activeIndex]) activateItem(orderedItems[activeIndex])
        return
      }

      if (activeIndex === SPEED_FOCUS) {
        if (event.key === 'ArrowLeft') changePlaybackSpeed(-1)
        else if (event.key === 'ArrowRight') changePlaybackSpeed(1)
        else if (event.key === 'ArrowUp') setActiveIndex(currentStation?.mediaType === 'podcast' && duration > 0 ? SEEK_FOCUS : PLAYBACK_FOCUS)
        else if (event.key === 'ArrowDown') setActiveIndex(VOLUME_FOCUS)
        return
      }

      if (activeIndex === SLEEP_FOCUS) {
        if (event.key === 'ArrowLeft') changeSleepOption(-1)
        else if (event.key === 'ArrowRight') changeSleepOption(1)
        else if (event.key === 'ArrowUp') setActiveIndex(VOLUME_FOCUS)
        return
      }

      if (EPISODE_FILTER_FOCUSES.includes(activeIndex)) {
        const filterIndex = EPISODE_FILTER_FOCUSES.indexOf(activeIndex)
        if (event.key === 'ArrowLeft' && filterIndex > 0) setActiveIndex(EPISODE_FILTER_FOCUSES[filterIndex - 1])
        else if (event.key === 'ArrowRight' && filterIndex < EPISODE_FILTER_FOCUSES.length - 1) setActiveIndex(EPISODE_FILTER_FOCUSES[filterIndex + 1])
        else if (event.key === 'ArrowUp') setActiveIndex(PODCAST_FOCUS)
        else if (event.key === 'ArrowDown' && orderedItems.length) setActiveIndex(Math.min(lastListIndex, orderedItems.length - 1))
        return
      }

      if (activeIndex === PLAYBACK_FOCUS) {
        if (event.key === 'ArrowLeft') setActiveIndex(playerReturnFocus)
        else if (event.key === 'ArrowDown') {
          if (currentStation?.mediaType === 'podcast' && duration > 0) setActiveIndex(SEEK_FOCUS)
          else setActiveIndex(VOLUME_FOCUS)
        }
        return
      }

      if (activeIndex === VOLUME_FOCUS) {
        if (event.key === 'ArrowLeft') changeVolumeBy(-0.05)
        else if (event.key === 'ArrowRight') changeVolumeBy(0.05)
        else if (event.key === 'ArrowUp') {
          if (currentStation?.mediaType === 'podcast') setActiveIndex(SPEED_FOCUS)
          else setActiveIndex(PLAYBACK_FOCUS)
        }
        else if (event.key === 'ArrowDown') setActiveIndex(SLEEP_FOCUS)
        return
      }

      if (activeIndex === SEEK_FOCUS) {
        if (event.key === 'ArrowLeft') seekBy(-15)
        else if (event.key === 'ArrowRight') seekBy(15)
        else if (event.key === 'ArrowUp') setActiveIndex(PLAYBACK_FOCUS)
        else if (event.key === 'ArrowDown') setActiveIndex(SPEED_FOCUS)
        return
      }

      if (activeIndex < 0) {
        const headerIndex = HEADER_FOCUSES.indexOf(activeIndex)
        if (event.key === 'ArrowLeft' && headerIndex > 0) setActiveIndex(HEADER_FOCUSES[headerIndex - 1])
        else if (event.key === 'ArrowRight' && headerIndex < HEADER_FOCUSES.length - 1) setActiveIndex(HEADER_FOCUSES[headerIndex + 1])
        else if (event.key === 'ArrowRight' && headerIndex === HEADER_FOCUSES.length - 1) focusPlayer(activeIndex)
        else if (event.key === 'ArrowDown' && orderedItems.length) setActiveIndex(Math.min(lastListIndex, orderedItems.length - 1))
        return
      }

      const pageStart = Math.floor(activeIndex / PAGE_SIZE) * PAGE_SIZE
      const pageEnd = Math.min(pageStart + PAGE_SIZE, orderedItems.length) - 1
      const localIndex = activeIndex - pageStart
      if (event.key === 'ArrowUp') {
        if (localIndex < COLUMN_COUNT) {
          const activeFilterFocus: Record<EpisodeFilter, number> = {
            newest: FILTER_NEWEST_FOCUS,
            oldest: FILTER_OLDEST_FOCUS,
            unheard: FILTER_UNHEARD_FOCUS,
            heard: FILTER_HEARD_FOCUS,
          }
          setActiveIndex(view === 'podcast-episodes' ? activeFilterFocus[episodeFilter] : view.startsWith('podcast') || view === 'subscriptions' ? PODCAST_FOCUS : RADIO_FOCUS)
        }
        else setActiveIndex(activeIndex - COLUMN_COUNT)
      } else if (event.key === 'ArrowDown') {
        const nextIndex = activeIndex + COLUMN_COUNT
        if (nextIndex < orderedItems.length) setActiveIndex(nextIndex)
        else if (currentStation?.mediaType === 'podcast' && duration > 0) setActiveIndex(SEEK_FOCUS)
        else if (currentStation) setActiveIndex(VOLUME_FOCUS)
      } else if (event.key === 'ArrowLeft') {
        if (localIndex % COLUMN_COUNT === 1) setActiveIndex(activeIndex - 1)
        else if (pageStart > 0) setActiveIndex(pageStart - 1)
      } else if (event.key === 'ArrowRight') {
        if (localIndex % COLUMN_COUNT === 0 && activeIndex < pageEnd) setActiveIndex(activeIndex + 1)
        else if (activeIndex === pageEnd && activeIndex < orderedItems.length - 1) setActiveIndex(activeIndex + 1)
        else if (localIndex % COLUMN_COUNT === 1 || activeIndex === pageEnd) focusPlayer(activeIndex)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activateItem,
    activateSleepTimer,
    activeIndex,
    applyEpisodeFilter,
    changePlaybackSpeed,
    changeSleepOption,
    changeVolumeBy,
    currentStation,
    duration,
    episodeFilter,
    focusPlayer,
    favoriteRemovalAction,
    favoriteRemovalTarget,
    goBackFromEpisodes,
    isSearchOpen,
    isCustomSleepOpen,
    orderedItems,
    lastListIndex,
    loadPodcastShows,
    loadRadioCatalog,
    playerReturnFocus,
    removeFavorite,
    showFavorites,
    showHistory,
    showSubscriptions,
    seekBy,
    toggleFavorite,
    toggleMute,
    toggleListened,
    togglePlayback,
    view,
  ])

  useEffect(() => {
    const audio = audioRef.current
    return () => {
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
    }
  }, [])

  const title = view === 'podcast-episodes'
    ? selectedPodcast?.name || 'Folgen'
    : view === 'podcast-shows'
      ? 'Podcasts'
      : view === 'subscriptions'
        ? 'Podcast-Abos'
        : view === 'history'
          ? 'Verlauf'
      : view === 'favorites'
        ? 'Favoriten'
        : 'Sender'

  const isPodcastMode = view.startsWith('podcast') || view === 'subscriptions'
  const radioFavoriteCount = favorites.filter((favorite) => favorite.mediaType === 'radio').length
  const podcastFavoriteCount = favorites.filter((favorite) => favorite.mediaType === 'podcast').length

  const modeButtons = [
    { focus: RADIO_FOCUS, label: 'Radio', action: () => void loadRadioCatalog(), active: !isPodcastMode },
    { focus: PODCAST_FOCUS, label: 'Podcasts', action: () => void loadPodcastShows(), active: isPodcastMode },
  ]

  const actionButtons = [
    {
      focus: FAVORITES_FOCUS,
      label: isPodcastMode ? `Abos ${subscriptions.length} · ★ ${podcastFavoriteCount}` : `Favoriten ${radioFavoriteCount}`,
      action: isPodcastMode ? showSubscriptions : showFavorites,
      active: view === 'favorites' || view === 'subscriptions',
    },
    { focus: HISTORY_FOCUS, label: 'Verlauf', action: showHistory, active: view === 'history' },
    { focus: SEARCH_FOCUS, label: 'search', action: () => setIsSearchOpen(true), active: false },
    { focus: STAR_FOCUS, label: isFavoriteTarget ? '★' : '☆', action: toggleFavorite, active: isFavoriteTarget },
  ]

  const episodeFilterButtons: Array<{
    focus: number
    filter: EpisodeFilter
    label: string
  }> = [
    { focus: FILTER_NEWEST_FOCUS, filter: 'newest', label: 'Neu → Alt' },
    { focus: FILTER_OLDEST_FOCUS, filter: 'oldest', label: 'Alt → Neu' },
    { focus: FILTER_UNHEARD_FOCUS, filter: 'unheard', label: 'Ungehört' },
    { focus: FILTER_HEARD_FOCUS, filter: 'heard', label: 'Gehört' },
  ]

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-900 text-white">
      <audio
        ref={audioRef}
        preload="none"
        playsInline
        onLoadStart={() => setPlaybackMessage('Audio wird geladen ...')}
        onLoadedMetadata={() => {
          const audio = audioRef.current
          const audioDuration = audio?.duration ?? 0
          setDuration(Number.isFinite(audioDuration) ? audioDuration : 0)
          if (audio && currentStation?.mediaType === 'podcast') {
            audio.playbackRate = playbackSpeed
            const resumePosition = Math.min(pendingResumeRef.current, Math.max(0, audioDuration - 5))
            if (resumePosition > 0) {
              audio.currentTime = resumePosition
              setCurrentTime(resumePosition)
              setPlaybackMessage(`Fortgesetzt bei ${formatTime(resumePosition)}`)
            }
            pendingResumeRef.current = 0
          }
        }}
        onDurationChange={() => {
          const audioDuration = audioRef.current?.duration ?? 0
          setDuration(Number.isFinite(audioDuration) ? audioDuration : 0)
        }}
        onCanPlay={() => setPlaybackMessage('Audio bereit ...')}
        onWaiting={() => setPlaybackMessage('Audio puffert ...')}
        onPlaying={() => {
          retryCountRef.current = 0
          setIsPlaying(true)
          const volumeLabel = isMuted ? 'STUMM' : `${Math.round(volume * 100)} %`
          setPlaybackMessage(currentStation?.mediaType === 'podcast' ? 'PODCAST LÄUFT' : `LIVE · Lautstärke ${volumeLabel}`)
          setErrorMessage('')
        }}
        onPause={() => {
          setIsPlaying(false)
          if (currentStation?.mediaType === 'podcast' && audioRef.current?.currentTime) {
            setPodcastPositions((current) => ({
              ...current,
              [currentStation.id]: audioRef.current?.currentTime ?? 0,
            }))
          }
        }}
        onTimeUpdate={() => {
          const audio = audioRef.current
          if (!audio) return
          setCurrentTime(audio.currentTime)
          if (currentStation?.mediaType === 'podcast' && audio.currentTime - lastPositionSaveRef.current >= 5) {
            lastPositionSaveRef.current = audio.currentTime
            setPodcastPositions((current) => ({ ...current, [currentStation.id]: audio.currentTime }))
          }
          if (
            currentStation?.mediaType === 'podcast'
            && Number.isFinite(audio.duration)
            && audio.duration > 0
            && audio.currentTime / audio.duration >= 0.9
          ) {
            markEpisodeListened(currentStation.id)
          }
        }}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(duration)
          setPlaybackMessage('Wiedergabe beendet')
          if (currentStation?.mediaType === 'podcast') {
            markEpisodeListened(currentStation.id)
            setPodcastPositions((current) => {
              const next = { ...current }
              delete next[currentStation.id]
              return next
            })
          }
        }}
        onError={() => {
          setIsPlaying(false)
          handleMediaError()
        }}
        onVolumeChange={() => {
          const audio = audioRef.current
          if (!audio) return
          setVolume(audio.volume)
          setIsMuted(audio.muted)
        }}
      />
      <div className="grid h-full grid-cols-[49%_51%]">
        <section className="flex h-full flex-col border-r border-slate-700/70 bg-slate-950/40 px-10 py-7">
          <header className="mb-5">
            <div className="min-w-0">
              <p className="text-base font-semibold uppercase tracking-[0.35em] text-purple-400">Web Radio</p>
              <h1 className="mt-1 line-clamp-2 text-4xl font-black leading-tight tracking-tight">{title}</h1>
            </div>
            <div className="mt-5 flex items-stretch gap-3">
              <div className="flex min-w-[19rem] rounded-2xl border-2 border-slate-500 bg-slate-800 p-1.5 shadow-lg shadow-black/30">
                {modeButtons.map((button) => (
                  <button
                    key={button.focus}
                    type="button"
                    tabIndex={-1}
                    disabled={isLoading}
                    onClick={button.action}
                    className={`min-w-0 flex-1 whitespace-nowrap rounded-xl border px-5 py-3 text-lg font-black transition-colors ${
                      activeIndex === button.focus
                        ? 'border-purple-200 bg-purple-500 text-white ring-4 ring-purple-300'
                        : button.active
                          ? 'border-purple-500 bg-purple-700 text-white'
                          : 'border-transparent bg-slate-900 text-slate-200'
                    }`}
                  >
                    {button.label}
                  </button>
                ))}
              </div>

              <div className="grid min-w-0 flex-1 grid-cols-5 gap-1.5">
              {actionButtons.map((button) => (
                <button
                  key={button.focus}
                  type="button"
                  tabIndex={-1}
                  disabled={isLoading}
                  onClick={button.action}
                  className={`min-w-0 overflow-hidden whitespace-nowrap rounded-xl border-2 px-2 py-3 text-sm font-bold shadow-md shadow-black/20 transition-colors ${
                    button.focus === FAVORITES_FOCUS ? 'col-span-2' : 'col-span-1'
                  } ${
                    activeIndex === button.focus
                      ? 'border-purple-200 bg-purple-500 text-white ring-4 ring-purple-300'
                      : button.active
                        ? 'border-purple-400 bg-purple-800 text-white'
                        : 'border-slate-500 bg-slate-800 text-white'
                  }`}
                >
                  {button.focus === SEARCH_FOCUS ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="mx-auto h-6 w-6"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-4-4" />
                    </svg>
                  ) : button.label}
                  {button.focus === SEARCH_FOCUS && <span className="sr-only">Suche</span>}
                </button>
              ))}
              </div>
            </div>
          </header>

          {view === 'podcast-episodes' && (
            <div className="mb-3 flex shrink-0 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/70 p-2">
              <span className="mr-2 text-sm font-bold uppercase tracking-wider text-slate-400">Folgen</span>
              {episodeFilterButtons.map((button) => (
                <button
                  key={button.filter}
                  type="button"
                  tabIndex={-1}
                  onClick={() => applyEpisodeFilter(button.filter)}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                    activeIndex === button.focus
                      ? 'scale-105 bg-purple-500 text-white ring-4 ring-purple-300'
                      : episodeFilter === button.filter
                        ? 'bg-purple-800 text-purple-100'
                        : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {button.label}
                </button>
              ))}
            </div>
          )}

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
                  {(isFavoriteEntry(item) || subscriptionIds.has(item.id)) && <span className="absolute right-3 top-2 text-2xl text-amber-300">★</span>}
                  {newEpisodeIdSet.has(item.id) && (
                    <span className="absolute left-3 top-2 rounded-lg bg-fuchsia-500 px-2 py-1 text-xs font-black uppercase text-white">
                      Neu
                    </span>
                  )}
                  {item.mediaType === 'podcast' && listenedEpisodeIds.has(item.id) && (
                    <span className="absolute bottom-3 left-3 rounded-lg bg-emerald-500/90 px-2 py-1 text-xs font-black uppercase text-emerald-950">
                      Gehört
                    </span>
                  )}
                  {isCurrent && isPlaying && <span className="absolute bottom-3 right-3 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />}
                </article>
              )
            })}
            {!orderedItems.length && (
              <div className="col-span-2 row-span-3 flex items-center justify-center text-center text-2xl text-slate-400">
                Keine Einträge vorhanden.
              </div>
            )}
          </div>

          <footer className="mt-4 flex items-center justify-between gap-4 text-base text-slate-300">
            <span><strong className="text-white">← ↑ ↓ →</strong> Navigieren</span>
            <span><strong className="rounded-md bg-white px-2 py-1 text-slate-950">OK</strong> Öffnen</span>
            <span><strong className="text-amber-300">F/Gelb</strong> Favorit · <strong className="text-blue-300">G/Blau</strong> Gehört</span>
            <span className="text-purple-300">{pageIndex + 1}/{pageCount}</span>
          </footer>
          {statusMessage && <p className="mt-2 truncate text-base text-emerald-400">{statusMessage}</p>}
        </section>

        <section className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950 px-10 py-5">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
          {currentStation ? (
            <div className="relative z-10 flex h-full min-h-0 w-full max-w-3xl flex-col items-center justify-center text-center">
              <p className="mb-3 shrink-0 text-lg font-bold uppercase tracking-[0.4em] text-purple-400">
                {currentStation.mediaType === 'podcast' ? 'Podcast-Folge' : 'Now Playing'}
              </p>
              <div className="shrink-0 rounded-[2.25rem] bg-slate-800/80 p-4 shadow-2xl ring-1 ring-white/10">
                <StationLogo
                  station={currentStation}
                  large
                  compact={currentStation.mediaType === 'podcast'}
                />
              </div>
              <div className="mt-4 w-full shrink-0 overflow-hidden">
                <h2 className={`${currentStation.name.length > 24 ? 'marquee-track' : ''} text-[clamp(2rem,4vh,3rem)] font-black leading-tight tracking-tight`}>
                  {currentStation.name}
                </h2>
              </div>
              <p className="mt-2 line-clamp-1 shrink-0 text-xl font-medium text-slate-300">{currentStation.genre}</p>
              {currentStation.mediaType === 'radio' && (streamMetadata.title || streamMetadata.station) && (
                <div className="mt-2 w-full shrink-0 rounded-xl bg-slate-800/70 px-5 py-2">
                  <p className="truncate text-lg font-bold text-fuchsia-300">{streamMetadata.title || 'Live-Sendung'}</p>
                  {streamMetadata.station && <p className="truncate text-sm text-slate-400">{streamMetadata.station}</p>}
                </div>
              )}
              {currentStation.mediaType === 'podcast' && (
                <div
                  className={`mt-3 w-full shrink-0 rounded-2xl border px-5 py-3 transition-all ${
                    activeIndex === SEEK_FOCUS
                      ? 'border-purple-300 bg-slate-800 ring-4 ring-purple-500'
                      : 'border-slate-700 bg-slate-900/60'
                  }`}
                >
                  <input
                    type="range"
                    tabIndex={-1}
                    min={0}
                    max={duration || 0}
                    step={1}
                    value={Math.min(currentTime, duration || 0)}
                    disabled={!duration}
                    onChange={(event) => seekPodcast(Number(event.target.value))}
                    className="h-3 w-full cursor-pointer accent-purple-500 disabled:opacity-40"
                    aria-label="Podcast-Fortschritt"
                  />
                  <div className="mt-2 flex justify-between text-base font-semibold text-slate-300">
                    <span>{formatTime(currentTime)}</span>
                    <span className={activeIndex === SEEK_FOCUS ? 'text-purple-300' : ''}>
                      {activeIndex === SEEK_FOCUS ? '← 15 Sek. · OK Pause · 15 Sek. →' : '↓ zum Scrubben'}
                    </span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              )}
              {currentStation.mediaType === 'podcast' && (
                <div
                  className={`mt-3 flex w-full shrink-0 items-center justify-between rounded-2xl border px-5 py-3 transition-all ${
                    activeIndex === SPEED_FOCUS
                      ? 'border-purple-300 bg-slate-800 ring-4 ring-purple-500'
                      : 'border-slate-700 bg-slate-900/60'
                  }`}
                >
                  <span className="font-bold text-slate-300">Geschwindigkeit</span>
                  <span className="text-xl font-black text-purple-300">{playbackSpeed.toFixed(2).replace(/\.00$/, '')}×</span>
                  <span className="text-sm text-slate-400">← langsamer · OK/→ schneller</span>
                </div>
              )}
              <div
                className={`mt-3 w-full shrink-0 rounded-2xl border px-5 py-3 transition-all ${
                  activeIndex === VOLUME_FOCUS
                    ? 'border-purple-300 bg-slate-800 ring-4 ring-purple-500'
                    : 'border-slate-700 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-5">
                  <span className="w-10 text-2xl">{isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</span>
                  <input
                    type="range"
                    tabIndex={-1}
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(event) => changeVolume(Number(event.target.value))}
                    className="h-3 flex-1 cursor-pointer accent-purple-500"
                    aria-label="Lautstärke"
                  />
                  <span className="w-20 text-right text-xl font-black">
                    {isMuted ? 'STUMM' : `${Math.round(volume * 100)} %`}
                  </span>
                </div>
                <p className={`mt-1 text-sm font-semibold ${activeIndex === VOLUME_FOCUS ? 'text-purple-300' : 'text-slate-400'}`}>
                  {activeIndex === VOLUME_FOCUS ? '← leiser · OK stumm · lauter →' : '↓ zur Lautstärke'}
                </p>
              </div>
              <div
                className={`mt-3 flex w-full shrink-0 items-center justify-between gap-5 rounded-2xl border px-5 py-3 transition-all ${
                  activeIndex === SLEEP_FOCUS
                    ? 'border-purple-300 bg-slate-800 ring-4 ring-purple-500'
                    : 'border-slate-700 bg-slate-900/60'
                }`}
              >
                <div>
                  <p className="font-bold text-slate-300">Sleep-Timer</p>
                  <p className={`text-sm font-semibold ${sleepEndsAt ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {sleepEndsAt ? 'Läuft' : 'Nicht aktiv'}
                  </p>
                </div>
                <span className={`min-w-36 text-center font-mono text-2xl font-black tabular-nums ${
                  sleepEndsAt ? 'text-emerald-300' : 'text-purple-300'
                }`}>
                  {sleepEndsAt
                    ? formatCountdown(sleepRemaining)
                    : sleepMinutes === CUSTOM_SLEEP_OPTION
                      ? 'Eigene Zeit'
                      : sleepMinutes
                        ? `${sleepMinutes} Min.`
                        : 'Aus'}
                </span>
                <span className="text-right text-sm text-slate-400">←/→ wählen<br />OK setzen</span>
              </div>
              <div className="mt-3 flex h-10 shrink-0 items-end justify-center gap-2">
                {[48, 62, 54, 64, 45].map((height, index) => (
                  <span
                    key={index}
                    className={`w-3 rounded-full bg-gradient-to-t from-purple-600 to-fuchsia-300 ${isPlaying ? 'equalizer-bar' : 'opacity-25'}`}
                    style={{ height: Math.round(height * 0.62) }}
                  />
                ))}
              </div>
              <p className={`mt-2 shrink-0 text-lg font-semibold ${errorMessage ? 'text-rose-400' : isPlaying ? 'text-emerald-400' : 'text-slate-400'}`}>
                {errorMessage || playbackMessage || 'Bereit'}
              </p>
              <button
                type="button"
                onClick={togglePlayback}
                className={`mt-3 shrink-0 rounded-2xl px-8 py-3 text-xl font-black shadow-xl transition active:scale-95 ${
                  activeIndex === PLAYBACK_FOCUS
                    ? 'scale-105 bg-purple-500 ring-4 ring-white'
                    : 'bg-purple-600 ring-2 ring-purple-300 hover:bg-purple-500'
                }`}
              >
                {isPlaying ? '❚❚ Pause' : '▶ Abspielen'}
              </button>
              {activeIndex === PLAYBACK_FOCUS && (
                <p className="mt-1 shrink-0 text-base font-semibold text-purple-300">← zurück · OK auswählen · ↓ weitere Steuerung</p>
              )}
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

      {isCustomSleepOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-24">
          <form
            onSubmit={submitCustomSleepTimer}
            className="w-full max-w-3xl rounded-[2.5rem] border-2 border-purple-400 bg-slate-900 p-10 text-center shadow-2xl ring-4 ring-purple-500/30"
          >
            <p className="text-lg font-bold uppercase tracking-[0.25em] text-purple-400">Eigener Sleep-Timer</p>
            <h2 className="mt-4 text-4xl font-black">Zeit in Minuten</h2>
            <input
              ref={customSleepInputRef}
              type="number"
              inputMode="numeric"
              min="1"
              max="1440"
              step="1"
              value={customSleepMinutes}
              onChange={(event) => {
                setCustomSleepMinutes(event.target.value)
                setCustomSleepError('')
              }}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape' || event.keyCode === 461) {
                  setIsCustomSleepOpen(false)
                  setCustomSleepError('')
                }
              }}
              placeholder="z. B. 45"
              className="mt-8 w-full rounded-2xl border-4 border-purple-400 bg-slate-800 px-7 py-6 text-center text-5xl font-black text-white outline-none placeholder:text-slate-500"
            />
            {customSleepError && <p className="mt-4 text-lg font-bold text-rose-400">{customSleepError}</p>}
            <div className="mt-8 flex justify-between text-xl text-slate-300">
              <span><strong className="text-white">OK / Enter</strong> Timer starten</span>
              <span><strong className="text-white">Zurück</strong> Abbrechen</span>
            </div>
          </form>
        </div>
      )}

      {favoriteRemovalTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 px-24">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="favorite-removal-title"
            className="w-full max-w-3xl rounded-[2.5rem] border-2 border-purple-400 bg-slate-900 p-10 text-center shadow-2xl ring-4 ring-purple-500/30"
          >
            <p className="text-lg font-bold uppercase tracking-[0.25em] text-purple-400">Favorit entfernen</p>
            <h2 id="favorite-removal-title" className="mt-5 line-clamp-2 text-4xl font-black leading-tight">
              „{favoriteRemovalTarget.name}“ wirklich entfernen?
            </h2>
            <div className="mt-10 grid grid-cols-2 gap-5">
              <button
                type="button"
                onClick={() => {
                  setFavoriteRemovalTarget(null)
                  setFavoriteRemovalAction('cancel')
                }}
                className={`rounded-2xl border-2 px-8 py-5 text-2xl font-black ${
                  favoriteRemovalAction === 'cancel'
                    ? 'border-purple-200 bg-purple-600 text-white ring-4 ring-purple-300'
                    : 'border-slate-500 bg-slate-800 text-slate-200'
                }`}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => removeFavorite(favoriteRemovalTarget)}
                className={`rounded-2xl border-2 px-8 py-5 text-2xl font-black ${
                  favoriteRemovalAction === 'remove'
                    ? 'border-rose-200 bg-rose-600 text-white ring-4 ring-rose-300'
                    : 'border-rose-700 bg-rose-950 text-rose-200'
                }`}
              >
                Entfernen
              </button>
            </div>
            <p className="mt-7 text-lg text-slate-300">←/→ auswählen · OK bestätigen · Zurück abbrechen</p>
          </div>
        </div>
      )}

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
