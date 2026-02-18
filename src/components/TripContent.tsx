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
  start_date: string
  end_date: string
  links: Link[]
  messages: { id: string; user_id: string; text: string; created_at: string }[]
}

export default function TripContent({ trip, userId }: { trip: Trip; userId: string }) {
  const [linkUrl, setLinkUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [unfurling, setUnfurling] = useState(false)
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
        await supabase
          .from('votes')
          .delete()
          .eq('link_id', linkId)
          .eq('user_id', userId)
      } else {
        await supabase
          .from('votes')
          .update({ vote: voteType })
          .eq('link_id', linkId)
          .eq('user_id', userId)
      }
    } else {
      await supabase
        .from('votes')
        .insert({
          link_id: linkId,
          user_id: userId,
          vote: voteType,
        })
    }

    router.refresh()
  }

  const handleConfirm = async (linkId: string) => {
    const link = trip.links.find(l => l.id === linkId)
    await supabase
      .from('links')
      .update({ is_confirmed: !link?.is_confirmed })
      .eq('id', linkId)
    
    router.refresh()
  }

  const handleDelete = async (linkId: string) => {
    if (!confirm('Remove this link from the trip?')) return
    
    await supabase
      .from('links')
      .delete()
      .eq('id', linkId)
    
    router.refresh()
  }

  const getCategoryEmoji = (category: string | null) => {
    switch (category) {
      case 'food': return '🍽️'
      case 'hotel': return '🏨'
      case 'activity': return '🎯'
      default: return '🔗'
    }
  }

  const getCategoryLabel = (category: string | null) => {
    switch (category) {
      case 'food': return 'Restaurant'
      case 'hotel': return 'Hotel'
      case 'activity': return 'Activity'
      default: return 'Link'
    }
  }

  const getVoteCounts = (votes: { user_id: string; vote: string }[]) => {
    const up = votes.filter(v => v.vote === 'up').length
    const down = votes.filter(v => v.vote === 'down').length
    return { up, down, total: up - down }
  }

  const getUserVote = (votes: { user_id: string; vote: string }[]) => {
    return votes.find(v => v.user_id === userId)?.vote
  }

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalf = rating % 1 >= 0.5
    const stars = []
    for (let i = 0; i < fullStars; i++) stars.push('★')
    if (hasHalf) stars.push('½')
    return stars.join('')
  }

  const confirmedLinks = trip.links.filter(l => l.is_confirmed)
  const topVoted = [...trip.links].sort((a, b) => {
    const aScore = getVoteCounts(a.votes).total
    const bScore = getVoteCounts(b.votes).total
    return bScore - aScore
  }).slice(0, 3)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-[#F5F0E8] rounded-2xl p-5 mb-6">
            <form onSubmit={handleAddLink} className="flex gap-3">
              <input
                type="url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="Paste a link to a restaurant, hotel, or activity..."
                className="flex-1 px-4 py-3 rounded-xl border-2 border-transparent focus:border-[#FF6B6B] focus:outline-none"
              />
              <button
                type="submit"
                disabled={adding || !linkUrl.trim()}
                className="px-6 py-3 bg-[#FF6B6B] text-white rounded-full font-semibold hover:bg-[#ff5252] transition disabled:opacity-50 min-w-[100px]"
              >
                {unfurling ? '🔍 Fetching...' : adding ? 'Adding...' : 'Add →'}
              </button>
            </form>
            <div className="flex gap-2 mt-3 text-sm text-gray-500">
              <span className="bg-white px-3 py-1 rounded-lg">🍽️ Restaurants</span>
              <span className="bg-white px-3 py-1 rounded-lg">🏨 Hotels</span>
              <span className="bg-white px-3 py-1 rounded-lg">🎯 Activities</span>
            </div>
          </div>

          {trip.links.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl">
              <div className="text-5xl mb-4">📍</div>
              <h3 className="text-xl font-serif mb-2">No links yet</h3>
              <p className="text-gray-600">Paste a link above to start adding ideas!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {trip.links.map((link) => {
                const { up, down, total } = getVoteCounts(link.votes)
                const userVote = getUserVote(link.votes)

                return (
                  <div 
                    key={link.id} 
                    className={`bg-white border-2 rounded-2xl overflow-hidden transition-all ${
                      link.is_confirmed 
                        ? 'border-[#7CB69D] shadow-lg shadow-[#7CB69D]/20' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {link.image_url && (
                      <div className="h-40 bg-gray-100 relative overflow-hidden">
                        <img 
                          src={link.image_url} 
                          alt={link.title || 'Link preview'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        {link.is_confirmed && (
                          <div className="absolute top-3 right-3 bg-[#7CB69D] text-white px-3 py-1 rounded-full text-sm font-semibold">
                            ✓ Confirmed
                          </div>
                        )}
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="absolute top-3 left-3 bg-black/50 hover:bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center transition"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    
                    <div className="p-5">
                      <div className="flex gap-4">
                        {!link.image_url && (
                          <div className="relative">
                            <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                              link.is_confirmed ? 'bg-[#E8F5EE]' : 'bg-[#F5F0E8]'
                            }`}>
                              {getCategoryEmoji(link.category)}
                            </div>
                            <button
                              onClick={() => handleDelete(link.id)}
                              className="absolute -top-2 -left-2 bg-gray-200 hover:bg-red-500 hover:text-white text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs transition"
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              link.category === 'hotel' ? 'bg-blue-100 text-blue-700' :
                              link.category === 'food' ? 'bg-orange-100 text-orange-700' :
                              link.category === 'activity' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {getCategoryEmoji(link.category)} {getCategoryLabel(link.category)}
                            </span>
                            {link.rating && (
                              <span className="text-xs text-yellow-600 font-medium">
                                {renderStars(link.rating)} {link.rating.toFixed(1)}
                                {link.review_count && ` (${link.review_count.toLocaleString()})`}
                              </span>
                            )}
                            {link.price_range && (
                              <span className="text-xs text-green-600 font-medium">
                                {link.price_range}
                              </span>
                            )}
                            {total > 0 && (
                              <span className="text-xs text-[#7CB69D] font-medium">+{total} votes</span>
                            )}
                          </div>
                          
                          <h3 className="font-semibold text-lg leading-tight mb-1">
                            {link.title || 'Untitled'}
                          </h3>
                          
                          {link.description && (
                            <p className="text-gray-600 text-sm line-clamp-2 mb-2">{link.description}</p>
                          )}
                          
                          <a 
                            href={link.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#FF6B6B] text-sm hover:underline inline-flex items-center gap-1"
                          >
                            {new URL(link.url).hostname.replace('www.', '')} ↗
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleVote(link.id, 'up')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                              userVote === 'up'
                                ? 'bg-[#7CB69D] text-white'
                                : 'bg-[#E8F5EE] text-[#7CB69D] hover:bg-[#7CB69D] hover:text-white'
                            }`}
                          >
                            👍 {up}
                          </button>
                          <button
                            onClick={() => handleVote(link.id, 'down')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                              userVote === 'down'
                                ? 'bg-[#FF6B6B] text-white'
                                : 'bg-[#FFE5E5] text-[#FF6B6B] hover:bg-[#FF6B6B] hover:text-white'
                            }`}
                          >
                            👎 {down}
                          </button>
                        </div>
                        
                        <button
                          onClick={() => handleConfirm(link.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                            link.is_confirmed
                              ? 'bg-[#7CB69D] text-white'
                              : 'border-2 border-[#7CB69D] text-[#7CB69D] hover:bg-[#7CB69D] hover:text-white'
                          }`}
                        >
                          {link.is_confirmed ? '✓ Confirmed' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">📊 Trip Progress</h3>
            <div className="text-center mb-4">
              <div className="text-4xl font-bold text-[#7CB69D]">
                {confirmedLinks.length}/{trip.links.length}
              </div>
              <div className="text-sm text-gray-500">Items Confirmed</div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className="bg-[#7CB69D] h-2 rounded-full transition-all"
                style={{ width: trip.links.length > 0 ? `${(confirmedLinks.length / trip.links.length) * 100}%` : '0%' }}
              />
            </div>
            {confirmedLinks.length > 0 && confirmedLinks.length === trip.links.length && (
              <div className="mt-4 p-3 bg-[#E8F5EE] rounded-xl text-center">
                <div className="text-lg mb-1">🎉</div>
                <div className="text-sm font-medium text-[#7CB69D]">All items confirmed!</div>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">📈 Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-orange-50 p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🍽️</div>
                <div className="text-xl font-bold text-orange-600">
                  {trip.links.filter(l => l.category === 'food').length}
                </div>
                <div className="text-xs text-gray-500">Restaurants</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🏨</div>
                <div className="text-xl font-bold text-blue-600">
                  {trip.links.filter(l => l.category === 'hotel').length}
                </div>
                <div className="text-xs text-gray-500">Hotels</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🎯</div>
                <div className="text-xl font-bold text-purple-600">
                  {trip.links.filter(l => l.category === 'activity').length}
                </div>
                <div className="text-xs text-gray-500">Activities</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🔗</div>
                <div className="text-xl font-bold text-gray-600">
                  {trip.links.filter(l => !l.category || l.category === 'other').length}
                </div>
                <div className="text-xs text-gray-500">Other</div>
              </div>
            </div>
          </div>

          {topVoted.length > 0 && topVoted.some(l => getVoteCounts(l.votes).total > 0) && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="font-semibold mb-4">🔥 Top Voted</h3>
              <div className="space-y-3">
                {topVoted.filter(l => getVoteCounts(l.votes).total > 0).map((link, i) => (
                  <div key={link.id} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0 ? 'bg-yellow-100 text-yellow-700' :
                      i === 1 ? 'bg-gray-100 text-gray-600' :
                      'bg-orange-50 text-orange-600'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{link.title}</div>
                      <div className="text-xs text-gray-500">+{getVoteCounts(link.votes).total} votes</div>
                    </div>
                    <span className="text-lg">{getCategoryEmoji(link.category)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirmedLinks.length >= 2 && (
            <div className="bg-gradient-to-br from-[#FF6B6B] to-[#ff8f8f] rounded-2xl p-5 text-white">
              <h3 className="font-semibold mb-2">✨ Ready to plan?</h3>
              <p className="text-sm opacity-90 mb-4">
                You have {confirmedLinks.length} confirmed items. Generate a day-by-day itinerary!
              </p>
              <button className="w-full bg-white text-[#FF6B6B] py-3 rounded-full font-semibold hover:bg-gray-100 transition">
                Generate Itinerary →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
