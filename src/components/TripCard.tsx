'use client'

import Link from 'next/link'

interface Trip {
  id: string
  name: string
  emoji: string
  destination: string
  start_date: string
  end_date: string
  created_at: string
}

export default function TripCard({ trip }: { trip: Trip }) {
  const startDate = new Date(trip.start_date)
  const endDate = new Date(trip.end_date)
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <Link href={`/trips/${trip.id}`} className="block">
      <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition hover:-translate-y-1">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#FF6B6B] to-[#FF8E8E] p-6 text-white relative">
          <h3 className="text-xl font-serif mb-1">{trip.name}</h3>
          <span className="text-sm opacity-90">
            {formatDate(startDate)} - {formatDate(endDate)}, {endDate.getFullYear()}
          </span>
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-5xl opacity-30">
            {trip.emoji}
          </span>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="flex items-center gap-2 text-gray-600 text-sm mb-3">
            <span>📍</span>
            <span>{trip.destination}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600 text-sm">
            <span>🌙</span>
            <span>{nights} night{nights !== 1 ? 's' : ''}</span>
          </div>
          
          {/* Status */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs font-semibold px-3 py-1 bg-[#FFE5E5] text-[#FF6B6B] rounded-full">
              Planning
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
