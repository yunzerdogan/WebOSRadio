import { useCallback, useEffect, useRef, useState } from 'react'
import type { RadioStation } from './types'

const stations: RadioStation[] = [
  {
    id: 'groove-salad',
    name: 'SomaFM Groove Salad',
    genre: 'Ambient / Downtempo',
    streamUrl: 'https://ice2.somafm.com/groovesalad-128-mp3',
    logoUrl: 'https://somafm.com/img3/groovesalad-400.jpg',
  },
  {
    id: 'secret-agent',
    name: 'SomaFM Secret Agent',
    genre: 'Spy Jazz / Lounge',
    streamUrl: 'https://ice2.somafm.com/secretagent-128-mp3',
    logoUrl: 'https://somafm.com/img3/secretagent-400.jpg',
  },
  {
    id: 'drone-zone',
    name: 'SomaFM Drone Zone',
    genre: 'Atmospheric Ambient',
    streamUrl: 'https://ice2.somafm.com/dronezone-128-mp3',
    logoUrl: 'https://somafm.com/img3/dronezone-400.jpg',
  },
  {
    id: 'def-con',
    name: 'SomaFM DEF CON Radio',
    genre: 'Electronica / Hacker Culture',
    streamUrl: 'https://ice2.somafm.com/defcon-128-mp3',
    logoUrl: 'https://somafm.com/img3/defcon-400.jpg',
  },
  {
    id: 'illinois-street-lounge',
    name: 'SomaFM Illinois Street Lounge',
    genre: 'Classic Lounge',
    streamUrl: 'https://ice2.somafm.com/illstreet-128-mp3',
    logoUrl: 'https://somafm.com/img3/illstreet-400.jpg',
  },
  {
    id: 'indie-pop-rocks',
    name: 'SomaFM Indie Pop Rocks!',
    genre: 'Indie Pop / Rock',
    streamUrl: 'https://ice2.somafm.com/indiepop-128-mp3',
    logoUrl: 'https://somafm.com/img3/indiepop-400.jpg',
  },
]

function App() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const playStation = useCallback((station: RadioStation) => {
    const audio = audioRef.current
    if (!audio) return

    setErrorMessage('')
    setIsPlaying(false)

    audio.pause()
    audio.removeAttribute('src')
    audio.load()

    setCurrentStation(station)
    audio.src = station.streamUrl
    audio.load()

    void audio.play().catch(() => {
      setIsPlaying(false)
      setErrorMessage('Der Stream konnte nicht gestartet werden.')
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((index) => (index + 1) % stations.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((index) => (index - 1 + stations.length) % stations.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        playStation(stations[activeIndex])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, playStation])

  useEffect(() => {
    const audio = audioRef.current

    return () => {
      if (!audio) return
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }, [])

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-900 text-white">
      <audio
        ref={audioRef}
        preload="none"
        onPlaying={() => {
          setIsPlaying(true)
          setErrorMessage('')
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => {
          setIsPlaying(false)
          setErrorMessage('Dieser Sender ist momentan nicht erreichbar.')
        }}
      />

      <div className="grid h-full grid-cols-[46%_54%]">
        <section className="flex h-full flex-col border-r border-slate-700/70 bg-slate-950/40 px-12 py-10">
          <header className="mb-8">
            <p className="text-lg font-semibold uppercase tracking-[0.35em] text-purple-400">
              Web Radio
            </p>
            <h1 className="mt-2 text-5xl font-black tracking-tight">Sender</h1>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-3 gap-6 p-2">
            {stations.map((station, index) => {
              const isFocused = activeIndex === index
              const isCurrent = currentStation?.id === station.id

              return (
                <article
                  key={station.id}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`relative flex min-h-0 items-center gap-5 rounded-3xl border p-5 transition-all duration-200 ${
                    isFocused
                      ? 'z-10 scale-105 border-purple-400 bg-slate-800 shadow-2xl shadow-purple-950/70 ring-4 ring-purple-500'
                      : 'border-slate-700 bg-slate-800/55'
                  }`}
                >
                  <img
                    src={station.logoUrl}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-2xl bg-slate-700 object-cover shadow-lg"
                  />
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-2xl font-bold leading-tight">
                      {station.name}
                    </h2>
                    <p className="mt-2 truncate text-lg text-slate-300">{station.genre}</p>
                  </div>
                  {isCurrent && isPlaying && (
                    <span className="absolute right-4 top-4 h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
                  )}
                </article>
              )
            })}
          </div>

          <footer className="mt-7 flex items-center gap-8 text-xl text-slate-300">
            <span><strong className="text-white">↑ ↓</strong> Sender wählen</span>
            <span><strong className="rounded-lg bg-white px-3 py-1 text-slate-950">OK</strong> Abspielen</span>
          </footer>
        </section>

        <section className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950 px-20 py-12">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
          <div className="absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

          {currentStation ? (
            <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
              <p className="mb-8 text-xl font-bold uppercase tracking-[0.4em] text-purple-400">
                Now Playing
              </p>
              <div className={`rounded-[3rem] bg-slate-800/80 p-7 shadow-2xl ring-1 ring-white/10 ${isPlaying ? 'shadow-purple-900/60' : ''}`}>
                <img
                  src={currentStation.logoUrl}
                  alt={`${currentStation.name} Logo`}
                  className="h-96 w-96 rounded-[2.25rem] object-cover"
                />
              </div>

              <div className="mt-10 w-full overflow-hidden">
                <h2
                  className={`${currentStation.name.length > 24 ? 'marquee-track' : ''} text-6xl font-black tracking-tight`}
                >
                  {currentStation.name}
                </h2>
              </div>
              <p className="mt-4 text-2xl font-medium text-slate-300">{currentStation.genre}</p>

              <div className="mt-10 flex h-20 items-end justify-center gap-3" aria-label={isPlaying ? 'Wiedergabe läuft' : 'Wiedergabe pausiert'}>
                {[48, 72, 60, 80, 52].map((height, index) => (
                  <span
                    key={index}
                    className={`w-4 rounded-full bg-gradient-to-t from-purple-600 to-fuchsia-300 ${isPlaying ? 'equalizer-bar' : 'opacity-25'}`}
                    style={{ height }}
                  />
                ))}
              </div>

              <p className={`mt-6 text-xl font-semibold ${errorMessage ? 'text-rose-400' : isPlaying ? 'text-emerald-400' : 'text-slate-400'}`}>
                {errorMessage || (isPlaying ? 'LIVE' : 'Stream wird geladen ...')}
              </p>
            </div>
          ) : (
            <div className="relative z-10 max-w-2xl text-center">
              <div className="mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-purple-500/15 ring-2 ring-purple-400/30">
                <span className="text-8xl text-purple-300">♪</span>
              </div>
              <h2 className="mt-10 text-6xl font-black">Bereit zum Hören</h2>
              <p className="mt-6 text-2xl leading-relaxed text-slate-300">
                Wähle links mit den Pfeiltasten einen Sender und drücke OK.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
