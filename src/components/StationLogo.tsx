import { useState } from 'react'
import type { RadioStation } from '../types'

interface StationLogoProps {
  station: RadioStation
  large?: boolean
  compact?: boolean
}

export function StationLogo({ station, large = false, compact = false }: StationLogoProps) {
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
