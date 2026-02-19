import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import UserMenu from '@/components/UserMenu'
import TripContent from '@/components/TripContent'

// Force dynamic rendering - this page requires Supabase auth
export const dynamic = 'force-dynamic'

export default async function TripDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Fetch trip with links, votes, and comments
  const { data: trip, error } = await supabase
    .from('trips')
    .select(`
      *,
      links (
        *,
        votes (user_id, vote),
        comments (id, user_id, text, created_at)
      ),
      trip_members (user_id, role),
      messages (id, user_id, text, created_at)
    `)
    .eq('id', id)
    .single()

  if (error || !trip) {
    notFound()
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="bg-white shadow-sm sticky top-0 z-50 border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/trips" className="text-2xl font-serif text-[#FF6B6B]">
            Roamly
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              href="/trips"
              className="px-4 py-2 text-sm border border-gray-200 rounded-full hover:bg-gray-50 transition"
            >
              ← Back to Trips
            </Link>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      {/* Trip Header */}
      <div className="bg-[#F5F0E8] border-b">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-4">
            <span className="text-5xl">{trip.emoji}</span>
            <div>
              <h1 className="text-3xl font-serif">{trip.name}</h1>
              <div className="flex gap-4 text-gray-600 mt-1">
                <span>📅 {formatDate(trip.start_date)} - {formatDate(trip.end_date)}</span>
                <span>📍 {trip.destination}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <TripContent trip={trip} userId={user.id} />
    </div>
  )
}
