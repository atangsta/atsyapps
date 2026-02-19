'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Link {
  id: string
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  category: string | null
  is_confirmed: boolean
  rating: number | null
  review_count: number | null
  price_range: string | null
  votes: { user_id: string; vote: string }[]
  comments: { id: string; user_id: string; text: string; created_at: string }[]
}

interface Trip {
  id: string
  name: string
  destination: string
  start_date: string
  end_date: string
  links: Link[]
  messages: { id: string; user_id: string; text: string; created_at: string }[]
}

interface ItineraryItem {
  id: string
  date: string
  time: string
  timeSlot: string
  type: string
  title: string
  subtitle?: string
  link?: Link
  estimatedCost?: number
}

interface DayPlan {
  date: string
  dayNumber: number
  dayLabel: string
  items: ItineraryItem[]
}

interface Itinerary {
  days: DayPlan[]
  totalCost: number
  summary: string
}

type ViewMode = 'browse' | 'itinerary'
type Category = 'all' | 'hotel' | 'food' | 'activity' | 'other'

const CATEGORIES = [
  { id: 'all' as Category, label: 'All', emoji: '📍' },
  { id: 'hotel' as Category, label: 'Hotels', emoji: '🏨' },
  { id: 'food' as Category, label: 'Meals', emoji: '🍽️' },
  { id: 'activity' as Category, label: 'Activities', emoji: '🎯' },
  { id: 'other' as Category, label: 'Other', emoji: '🔗' },
]

export default function TripContent({ trip, userId }: { trip: Trip; userId: string }) {
  const [linkUrl, setLinkUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [unfurling, setUnfurling] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Category>('all')
  const [selectedLink, setSelectedLink] = useState<Link | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newComment, setNewComment] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('browse')
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)
  const [generatingItinerary, setGeneratingItinerary] = useState(false)
  const [weather, setWeather] = useState<{ temp_f: number; condition: string; icon: string } | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkUrl.trim()) return
    
    setAdding(true)
    setUnfurling(true)

    try {
      const unfurlResponse = await fetch('/api/unfurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: linkUrl }),
      })
      
      let metadata = {
        title: 'New Link',
        description: null as string | null,
        image_url: null as string | null,
        category: 'other',
        rating: null as number | null,
        review_count: null as number | null,
        price_range: null as string | null,
        // Enrichment fields
        venue_type: null as string | null,
        meal_times: null as string[] | null,
        estimated_price_per_person: null as number | null,
        cuisine_type: null as string | null,
      }
      
      if (unfurlResponse.ok) {
        metadata = await unfurlResponse.json()
      }
      
      setUnfurling(false)

      const { error } = await supabase
        .from('links')
        .insert({
          trip_id: trip.id,
          url: linkUrl,
          title: metadata.title,
          description: metadata.description,
          image_url: metadata.image_url,
          category: metadata.category,
          rating: metadata.rating,
          review_count: metadata.review_count,
          price_range: metadata.price_range,
          // Enrichment fields
          venue_type: metadata.venue_type,
          meal_times: metadata.meal_times,
          estimated_price_per_person: metadata.estimated_price_per_person,
          cuisine_type: metadata.cuisine_type,
          added_by: userId,
        })

      if (!error) {
        setLinkUrl('')
        router.refresh()
      }
    } catch (err) {
      console.error('Failed to add link:', err)
    }
    
    setAdding(false)
    setUnfurling(false)
  }

  const handleVote = async (linkId: string, voteType: 'up' | 'down') => {
    const link = trip.links.find(l => l.id === linkId)
    const existingVote = link?.votes.find(v => v.user_id === userId)

    if (existingVote) {
      if (existingVote.vote === voteType) {
        await supabase.from('votes').delete().eq('link_id', linkId).eq('user_id', userId)
      } else {
        await supabase.from('votes').update({ vote: voteType }).eq('link_id', linkId).eq('user_id', userId)
      }
    } else {
      await supabase.from('votes').insert({ link_id: linkId, user_id: userId, vote: voteType })
    }
    router.refresh()
  }

  const handleConfirm = async (linkId: string) => {
    const link = trip.links.find(l => l.id === linkId)
    await supabase.from('links').update({ is_confirmed: !link?.is_confirmed }).eq('id', linkId)
    router.refresh()
  }

  const handleDelete = async (linkId: string) => {
    if (!confirm('Remove this link from the trip?')) return
    await supabase.from('links').delete().eq('id', linkId)
    setSelectedLink(null)
    router.refresh()
  }

  const handleAddComment = async (linkId: string) => {
    if (!newComment.trim()) return
    await supabase.from('comments').insert({ link_id: linkId, user_id: userId, text: newComment })
    setNewComment('')
    router.refresh()
  }

  const handleGenerateItinerary = async () => {
    setGeneratingItinerary(true)
    try {
      // Fetch itinerary and weather in parallel
      const [itineraryResponse, weatherResponse] = await Promise.all([
        fetch('/api/generate-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripId: trip.id }),
        }),
        fetch(`/api/weather?location=${encodeURIComponent(trip.destination || 'New York')}`),
      ])
      
      if (itineraryResponse.ok) {
        const data = await itineraryResponse.json()
        setItinerary(data)
        setViewMode('itinerary')
      }
      
      if (weatherResponse.ok) {
        const weatherData = await weatherResponse.json()
        setWeather(weatherData)
      }
    } catch (err) {
      console.error('Failed to generate itinerary:', err)
    }
    setGeneratingItinerary(false)
  }

  const getVoteCounts = (votes: { user_id: string; vote: string }[]) => {
    const up = votes.filter(v => v.vote === 'up').length
    const down = votes.filter(v => v.vote === 'down').length
    return { up, down }
  }

  const getUserVote = (votes: { user_id: string; vote: string }[]) => {
    return votes.find(v => v.user_id === userId)?.vote
  }

  const getItemEmoji = (type: string, category?: string) => {
    if (type === 'hotel_checkin' || type === 'hotel_checkout') return '🏨'
    if (type === 'meal') return '🍽️'
    if (type === 'activity') return '🎯'
    if (type === 'flight') return '✈️'
    if (category === 'hotel') return '🏨'
    if (category === 'food') return '🍽️'
    if (category === 'activity') return '🎯'
    return '📍'
  }

  // Filter links by category and search
  const filteredLinks = trip.links.filter(link => {
    const matchesCategory = activeCategory === 'all' || link.category === activeCategory
    const matchesSearch = !searchQuery || 
      link.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const confirmedCount = trip.links.filter(l => l.is_confirmed).length

  return (
    <div className="min-h-screen bg-white">
      {/* Category Tabs */}
      <div className="border-b bg-white sticky top-[73px] z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setActiveCategory(cat.id); setViewMode('browse'); setSelectedLink(null); }}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition ${
                    activeCategory === cat.id && viewMode === 'browse'
                      ? 'bg-[#FFF8E7] text-gray-800 border border-[#F0E6D0]'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            
            {/* Craft Button */}
            <button 
              onClick={handleGenerateItinerary}
              disabled={generatingItinerary || confirmedCount < 1}
              className={`px-6 py-2.5 rounded-full font-medium transition ${
                viewMode === 'itinerary'
                  ? 'bg-[#8B9DC3] text-white'
                  : confirmedCount >= 1
                    ? 'bg-[#8B9DC3] text-white hover:bg-[#7A8BB0]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {generatingItinerary ? 'Crafting...' : 'Craft'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {viewMode === 'itinerary' && itinerary ? (
          /* Itinerary View */
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-serif mb-2">Trip Itinerary</h2>
                <p className="text-gray-600">{itinerary.summary}</p>
              </div>
              <div className="flex items-center gap-6">
                {weather && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-2xl">{weather.icon}</span>
                    <span className="font-medium">{weather.temp_f}°F</span>
                    <span className="text-sm text-gray-400">in {trip.destination}</span>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-3xl font-bold text-[#7CB69D]">
                    ${itinerary.totalCost.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Estimated total</div>
                </div>
              </div>
            </div>

            {/* Back button */}
            <button
              onClick={() => setViewMode('browse')}
              className="mb-6 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Back to browse
            </button>

            {/* Timeline */}
            <div className="space-y-8">
              {itinerary.days.map((day) => (
                <div key={day.date} className="relative">
                  {/* Day Header */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="bg-[#FFF8E7] px-4 py-2 rounded-full text-sm font-medium">
                      {day.dayLabel}
                    </div>
                  </div>

                  {/* Timeline Items */}
                  <div className="relative pl-8 border-l-2 border-[#FFF8E7] ml-4 space-y-4">
                    {day.items.length === 0 ? (
                      <div className="text-gray-400 text-sm py-4">No activities planned</div>
                    ) : (
                      day.items.map((item, idx) => (
                        <div key={item.id} className="relative">
                          {/* Timeline dot */}
                          <div className={`absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white ${
                            item.type === 'hotel_checkin' || item.type === 'hotel_checkout' 
                              ? 'bg-blue-400' 
                              : item.type === 'meal' 
                                ? 'bg-orange-400' 
                                : 'bg-[#8B9DC3]'
                          }`} />

                          {/* Card */}
                          <div className={`bg-white border rounded-xl p-4 ml-4 ${
                            item.type === 'hotel_checkin' || item.type === 'hotel_checkout'
                              ? 'border-blue-200 bg-blue-50/50'
                              : item.type === 'meal'
                                ? 'border-orange-200 bg-orange-50/50'
                                : 'border-gray-200'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <span className="text-2xl">{getItemEmoji(item.type, item.link?.category || undefined)}</span>
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">{item.time}</div>
                                  <div className="font-medium">{item.title}</div>
                                  {item.subtitle && (
                                    <div className="text-sm text-gray-500">{item.subtitle}</div>
                                  )}
                                  {item.link?.url && (
                                    <a 
                                      href={item.link.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-xs text-[#8B9DC3] hover:underline mt-1 inline-block"
                                    >
                                      View details ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                              {item.estimatedCost && item.estimatedCost > 0 && (
                                <div className="text-sm font-medium text-gray-600">
                                  ${item.estimatedCost}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Cost Breakdown */}
            <div className="mt-12 bg-[#F5F0E8] rounded-2xl p-6">
              <h3 className="font-semibold mb-4">Cost Breakdown</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">🏨 Accommodation</span>
                  <span className="font-medium">
                    ${itinerary.days.flatMap(d => d.items).filter(i => i.type === 'hotel_checkin').reduce((sum, i) => sum + (i.estimatedCost || 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">🍽️ Meals</span>
                  <span className="font-medium">
                    ${itinerary.days.flatMap(d => d.items).filter(i => i.type === 'meal').reduce((sum, i) => sum + (i.estimatedCost || 0), 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">🎯 Activities</span>
                  <span className="font-medium">
                    ${itinerary.days.flatMap(d => d.items).filter(i => i.type === 'activity' || i.type === 'other').reduce((sum, i) => sum + (i.estimatedCost || 0), 0)}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between text-lg">
                  <span className="font-semibold">Total Estimated</span>
                  <span className="font-bold text-[#7CB69D]">${itinerary.totalCost.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        ) : selectedLink ? (
          /* Detail View with Comments */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Card Detail */}
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              {selectedLink.image_url && (
                <div className="aspect-[4/3] bg-gray-100 relative">
                  <img 
                    src={selectedLink.image_url} 
                    alt={selectedLink.title || ''} 
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-2">{selectedLink.title}</h2>
                {selectedLink.description && (
                  <p className="text-gray-600 text-sm mb-3">{selectedLink.description}</p>
                )}
                {selectedLink.rating && (
                  <p className="text-yellow-600 text-sm mb-2">
                    {'★'.repeat(Math.floor(selectedLink.rating))} {selectedLink.rating.toFixed(1)}
                    {selectedLink.review_count && ` (${selectedLink.review_count.toLocaleString()} reviews)`}
                  </p>
                )}
                {selectedLink.price_range && (
                  <p className="text-green-600 text-sm mb-4">{selectedLink.price_range}</p>
                )}
                <div className="flex items-center gap-3">
                  <a 
                    href={selectedLink.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-6 py-2.5 bg-[#FFF8E7] text-gray-800 rounded-full font-medium hover:bg-[#FFEFC7] transition border border-[#F0E6D0]"
                  >
                    View
                  </a>
                  <button
                    onClick={() => handleConfirm(selectedLink.id)}
                    className={`px-4 py-2.5 rounded-full font-medium transition flex items-center gap-2 ${
                      selectedLink.is_confirmed
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600'
                    }`}
                  >
                    {selectedLink.is_confirmed ? (
                      <>
                        <span className="text-lg">✓</span>
                        <span>Confirmed</span>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">○</span>
                        <span>Confirm</span>
                      </>
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setSelectedLink(null)}
                  className="mt-4 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Back to all
                </button>
              </div>
            </div>

            {/* Right: Notes & Comments */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">Notes & Comments</h3>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>👍 {getVoteCounts(selectedLink.votes).up} Votes</span>
                  <span>👎 {getVoteCounts(selectedLink.votes).down} Downvotes</span>
                </div>
              </div>

              {/* Vote Buttons */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => handleVote(selectedLink.id, 'up')}
                  className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                    getUserVote(selectedLink.votes) === 'up'
                      ? 'bg-green-500 text-white'
                      : 'bg-green-50 text-green-600 hover:bg-green-100'
                  }`}
                >
                  👍 Upvote
                </button>
                <button
                  onClick={() => handleVote(selectedLink.id, 'down')}
                  className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
                    getUserVote(selectedLink.votes) === 'down'
                      ? 'bg-red-500 text-white'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                >
                  👎 Downvote
                </button>
              </div>

              {/* Comments */}
              <div className="space-y-4 mb-6 max-h-[300px] overflow-y-auto">
                {selectedLink.comments.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">No comments yet</p>
                ) : (
                  selectedLink.comments.map((comment) => (
                    <div key={comment.id} className="bg-[#FFF8E7] rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[#E8B4B8] flex items-center justify-center text-white text-sm font-medium">
                          {comment.user_id.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">User</span>
                      </div>
                      <p className="text-gray-700 text-sm">{comment.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment */}
              <div className="relative">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment(selectedLink.id)}
                  placeholder="Add Note..."
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-gray-400 transition"
                />
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(selectedLink.id)}
                className="mt-4 text-sm text-red-500 hover:text-red-700"
              >
                Remove from trip
              </button>
            </div>
          </div>
        ) : (
          /* Browse View */
          <>
            {/* Search Bar */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex-1 relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" strokeWidth="2" />
                  <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-full focus:outline-none focus:border-gray-400 transition"
                />
              </div>
              <button className="p-3 hover:bg-gray-100 rounded-lg transition">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </button>
            </div>

            {/* Add Link Form */}
            <div className="mb-8">
              <form onSubmit={handleAddLink} className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="Drop a link here..."
                    className="w-full px-6 py-3 bg-white border border-gray-200 rounded-full focus:outline-none focus:border-gray-400 transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={adding || !linkUrl.trim()}
                  className="px-6 py-3 bg-[#FFF8E7] text-gray-800 rounded-full font-medium hover:bg-[#FFEFC7] transition border border-[#F0E6D0] disabled:opacity-50"
                >
                  {unfurling ? 'Fetching...' : adding ? 'Adding...' : 'Add'}
                </button>
              </form>
            </div>

            {/* Confirmed count banner */}
            {confirmedCount > 0 && (
              <div className="mb-6 bg-[#E8F5EE] border border-[#7CB69D]/30 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <div className="font-medium">{confirmedCount} item{confirmedCount !== 1 ? 's' : ''} confirmed</div>
                    <div className="text-sm text-gray-600">Click "Craft" to generate your itinerary</div>
                  </div>
                </div>
                <button
                  onClick={handleGenerateItinerary}
                  disabled={generatingItinerary}
                  className="px-4 py-2 bg-[#7CB69D] text-white rounded-full text-sm font-medium hover:bg-[#6AA58C] transition"
                >
                  {generatingItinerary ? 'Crafting...' : 'Craft Itinerary →'}
                </button>
              </div>
            )}

            {/* Grid View */}
            {filteredLinks.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">📍</div>
                <h3 className="text-xl font-serif mb-2">No items yet</h3>
                <p className="text-gray-500">Drop a link above to add your first spot!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {filteredLinks.map((link) => (
                  <div 
                    key={link.id} 
                    className={`bg-white border rounded-2xl overflow-hidden hover:shadow-lg transition group relative ${
                      link.is_confirmed 
                        ? 'border-green-400 ring-2 ring-green-400/30 bg-green-50/30' 
                        : 'border-gray-200'
                    }`}
                  >
                    {/* Confirmed Banner */}
                    {link.is_confirmed && (
                      <div className="absolute top-0 left-0 right-0 bg-green-500 text-white text-xs font-semibold text-center py-1 z-10">
                        ✓ CONFIRMED
                      </div>
                    )}
                    
                    {/* Image - Clickable to open details */}
                    <div 
                      className={`aspect-[4/3] bg-gray-100 relative overflow-hidden cursor-pointer ${link.is_confirmed ? 'mt-6' : ''}`}
                      onClick={() => setSelectedLink(link)}
                    >
                      {link.image_url ? (
                        <img 
                          src={link.image_url} 
                          alt={link.title || ''} 
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl bg-[#FFF8E7]">
                          {link.category === 'hotel' ? '🏨' : link.category === 'food' ? '🍽️' : link.category === 'activity' ? '🎯' : '🔗'}
                        </div>
                      )}
                    </div>
                    
                    {/* Info */}
                    <div className="p-4">
                      {/* Title - no truncation, wraps naturally */}
                      <h3 
                        className="font-medium text-center mb-1 cursor-pointer hover:text-[#8B9DC3]"
                        onClick={() => setSelectedLink(link)}
                      >
                        {link.title || 'Untitled'}
                      </h3>
                      {link.price_range && (
                        <p className="text-gray-500 text-sm text-center">{link.price_range}</p>
                      )}
                      {link.rating && (
                        <p className="text-yellow-600 text-sm text-center mt-1">
                          {'★'.repeat(Math.floor(link.rating))} {link.rating.toFixed(1)}
                        </p>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedLink(link)}
                          className="px-4 py-2 bg-[#FFF8E7] text-gray-800 rounded-full text-sm font-medium border border-[#F0E6D0] hover:bg-[#FFEFC7] transition"
                        >
                          View
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleConfirm(link.id)
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-1 ${
                            link.is_confirmed
                              ? 'bg-green-500 text-white hover:bg-red-500'
                              : 'bg-gray-100 text-gray-600 hover:bg-green-500 hover:text-white'
                          }`}
                          title={link.is_confirmed ? 'Click to unconfirm' : 'Click to confirm'}
                        >
                          {link.is_confirmed ? '✓' : '○'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
