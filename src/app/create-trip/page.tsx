'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const EMOJI_OPTIONS = ['🏖️', '🇯🇵', '🏔️', '🎡', '🍷', '🎿', '🏕️', '🌴', '🗽', '🏰', '🌺', '⛵']

export default function CreateTripPage() {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✈️')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      setError('You must be logged in to create a trip')
      setLoading(false)
      return
    }

    // Create trip
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        name,
        emoji,
        destination,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id,
      })
      .select()
      .single()

    if (tripError) {
      setError(tripError.message)
      setLoading(false)
      return
    }

    // Add creator as owner in trip_members
    const { error: memberError } = await supabase
      .from('trip_members')
      .insert({
        trip_id: trip.id,
        user_id: user.id,
        role: 'owner',
        joined_at: new Date().toISOString(),
      })

    if (memberError) {
      console.error('Failed to add trip member:', memberError)
    }

    // Redirect to trip detail
    router.push(`/trips/${trip.id}`)
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Nav */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <Link href="/trips" className="text-2xl font-serif text-[#FF6B6B]">
            Roamly
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Progress */}
        <div className="flex justify-center gap-2 mb-8">
          <div className="w-6 h-2 rounded-full bg-[#FF6B6B]" />
          <div className="w-2 h-2 rounded-full bg-gray-200" />
          <div className="w-2 h-2 rounded-full bg-gray-200" />
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif mb-2">Create your trip ✈️</h1>
          <p className="text-gray-600">Let&apos;s get the basics down first</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Emoji Picker */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Pick a vibe for your trip</label>
              <div className="flex flex-wrap gap-3">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`w-12 h-12 text-2xl rounded-xl border-2 transition hover:scale-110 ${
                      emoji === e 
                        ? 'border-[#FF6B6B] bg-[#FFE5E5]' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Trip Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Trip name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Tokyo Adventure 2026"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#FF6B6B] focus:outline-none transition"
                required
              />
            </div>

            {/* Destination */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Where are you going?</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g., Tokyo, Japan"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#FF6B6B] focus:outline-none transition"
                required
              />
            </div>

            {/* Dates */}
            <div className="mb-8">
              <label className="block text-sm font-medium mb-2">When?</label>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#FF6B6B] focus:outline-none transition"
                  required
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#FF6B6B] focus:outline-none transition"
                  required
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between">
              <Link 
                href="/trips"
                className="px-6 py-3 border-2 border-gray-200 rounded-full font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-[#FF6B6B] text-white rounded-full font-semibold hover:bg-[#ff5252] transition disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Trip →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
