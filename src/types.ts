export interface RadioStation {
  id: string
  name: string
  genre: string
  streamUrl: string
  logoUrl: string
  mediaType?: 'radio' | 'podcast' | 'podcast-show'
  collectionId?: number
  releaseDate?: string
  lastPlayedAt?: number
}

export interface StreamMetadata {
  title: string
  station: string
}

export interface RadioBrowserStation {
  stationuuid: string
  name: string
  url_resolved: string
  favicon: string
  tags: string
  country: string
  codec: string
  bitrate: number
  hls: number
}

export interface PodcastEpisode {
  trackId: number
  trackName: string
  collectionName: string
  episodeUrl: string
  artworkUrl600?: string
  artworkUrl160?: string
  releaseDate: string
  episodeContentType?: string
}

export interface PodcastShow {
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl600?: string
  artworkUrl100?: string
  primaryGenreName?: string
  trackCount?: number
}

export type View =
  | 'radio'
  | 'favorites'
  | 'subscriptions'
  | 'history'
  | 'podcast-shows'
  | 'podcast-episodes'
  | 'local'

export type EpisodeFilter = 'newest' | 'oldest' | 'unheard' | 'heard'

export interface NavigationState {
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
