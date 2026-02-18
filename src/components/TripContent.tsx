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
  votes: { user_id: string; vote: string }[]
  comments: { id: string; user_id: string; text: string; created_at: string }[]
}

interface Trip {
  id: string
  name: string
  links: Link[]
  messages: { id: string; user_id: string; text: string; created_at: string }[]
}

export default function TripContent({ trip, userId }: { trip: Trip; userId: string }) {
  const [linkUrl, setLinkUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkUrl.trim()) return
    
    setAdding(true)

    // For now, just save the URL. We'll add unfurling later.
    const { error } = await supabase
      .from('links')
      .insert({
        trip_id: trip.id,
        url: linkUrl,
        title: 'New Link', // TODO: Unfurl
        category: 'other',
        added_by: userId,
      })

    if (!error) {
      setLinkUrl('')
      router.refresh()
    }
    
    setAdding(false)
  }

  const handleVote = async (linkId: string, voteType: 'up' | 'down') => {
    // Check if user already voted
    const link = trip.links.find(l => l.id === linkId)
    const existingVote = link?.votes.find(v => v.user_id === userId)

    if (existingVote) {
      if (existingVote.vote === voteType) {
        // Remove vote
        await supabase
          .from('votes')
          .delete()
          .eq('link_id', linkId)
          .eq('user_id', userId)
      } else {
        // Change vote
        await supabase
          .from('votes')
          .update({ vote: voteType })
          .eq('link_id', linkId)
          .eq('user_id', userId)
      }
    } else {
      // Add new vote
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

  const getCategoryEmoji = (category: string | null) => {
    switch (category) {
      case 'food': return '🍽️'
      case 'hotel': return '🏨'
      case 'activity': return '🎯'
      default: return '🔗'
    }
  }

  const getVoteCounts = (votes: { user_id: string; vote: string }[]) => {
    const up = votes.filter(v => v.vote === 'up').length
    const down = votes.filter(v => v.vote === 'down').length
    return { up, down }
  }

  const getUserVote = (votes: { user_id: string; vote: string }[]) => {
    return votes.find(v => v.user_id === userId)?.vote
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Add Link */}
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
                className="px-6 py-3 bg-[#FF6B6B] text-white rounded-full font-semibold hover:bg-[#ff5252] transition disabled:opacity-50"
              >
                {adding ? 'Adding...' : 'Add →'}
              </button>
            </form>
            <div className="flex gap-2 mt-3 text-sm text-gray-500">
              <span className="bg-white px-3 py-1 rounded-lg">🍽️ Yelp</span>
              <span className="bg-white px-3 py-1 rounded-lg">🏨 Airbnb</span>
              <span className="bg-white px-3 py-1 rounded-lg">🎫 TripAdvisor</span>
            </div>
          </div>

          {/* Links List */}
          {trip.links.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl">
              <div className="text-5xl mb-4">📍</div>
              <h3 className="text-xl font-serif mb-2">No links yet</h3>
              <p className="text-gray-600">
                Paste a link above to start adding ideas!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {trip.links.map((link) => {
                const { up, down } = getVoteCounts(link.votes)
                const userVote = getUserVote(link.votes)

                return (
                  <div 
                    key={link.id} 
                    className={`bg-white border rounded-2xl p-5 ${
                      link.is_confirmed ? 'border-[#7CB69D] bg-gradient-to-r from-[#E8F5EE] to-white' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex gap-4">
                      <div className="w-20 h-20 bg-[#F5F0E8] rounded-xl flex items-center justify-center text-3xl">
                        {getCategoryEmoji(link.category)}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{link.title || 'Untitled'}</h3>
                        <p className="text-gray-600 text-sm line-clamp-2">
                          {link.description || link.url}
                        </p>
                        <a 
                          href={link.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-[#FF6B6B] text-sm hover:underline"
                        >
                          View link →
                        </a>
                      </div>
                    </div>

                    {/* Votes */}
                    <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Progress */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">📊 Trip Progress</h3>
            <div className="text-center">
              <div className="text-4xl font-bold">
                {trip.links.filter(l => l.is_confirmed).length}/{trip.links.length}
              </div>
              <div className="text-sm text-gray-500">Confirmed</div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h3 className="font-semibold mb-4">📈 Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F5F0E8] p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🍽️</div>
                <div className="font-bold">{trip.links.filter(l => l.category === 'food').length}</div>
                <div className="text-xs text-gray-500">Restaurants</div>
              </div>
              <div className="bg-[#F5F0E8] p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🏨</div>
                <div className="font-bold">{trip.links.filter(l => l.category === 'hotel').length}</div>
                <div className="text-xs text-gray-500">Hotels</div>
              </div>
              <div className="bg-[#F5F0E8] p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">🎯</div>
                <div className="font-bold">{trip.links.filter(l => l.category === 'activity').length}</div>
                <div className="text-xs text-gray-500">Activities</div>
              </div>
              <div className="bg-[#F5F0E8] p-4 rounded-xl text-center">
                <div className="text-2xl mb-1">💬</div>
                <div className="font-bold">{trip.messages.length}</div>
                <div className="text-xs text-gray-500">Messages</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
