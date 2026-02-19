import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TripCard from '@/components/TripCard'
import UserMenu from '@/components/UserMenu'

// Force dynamic rendering - this page requires Supabase auth
export const dynamic = 'force-dynamic'

export default async function TripsPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Fetch user's trips - RLS policies handle access control
  const { data: trips } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Nav */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/trips" className="text-2xl font-serif text-[#FF6B6B]">
            Roamly
          </Link>
          <div className="flex items-center gap-4">
            <Link 
              href="/create-trip"
              className="bg-[#FF6B6B] text-white px-6 py-2 rounded-full font-semibold hover:bg-[#ff5252] transition"
            >
              + New Trip
            </Link>
            <UserMenu user={user} />
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-serif mb-8">My Trips ✈️</h1>

        {trips && trips.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* New Trip Card */}
            <Link 
              href="/create-trip"
              className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[280px] hover:border-[#FF6B6B] hover:bg-[#FFE5E5] transition group"
            >
              <div className="w-14 h-14 rounded-full bg-gray-100 group-hover:bg-[#FF6B6B] flex items-center justify-center text-3xl text-gray-400 group-hover:text-white transition mb-4">
                +
              </div>
              <span className="font-semibold text-gray-600 group-hover:text-[#FF6B6B]">
                Start a new trip
              </span>
            </Link>

            {/* Trip Cards */}
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🌍</div>
            <h2 className="text-2xl font-serif mb-2">No trips yet</h2>
            <p className="text-gray-600 mb-6">Start planning your next adventure!</p>
            <Link 
              href="/create-trip"
              className="inline-block bg-[#FF6B6B] text-white px-8 py-3 rounded-full font-semibold hover:bg-[#ff5252] transition"
            >
              Create Your First Trip
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
