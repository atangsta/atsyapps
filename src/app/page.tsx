'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.push('/trips')
      } else {
        setLoading(false)
      }
    }
    checkUser()
  }, [supabase, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="text-4xl font-serif text-[#FF6B6B] animate-pulse">Roamly</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-serif text-[#FF6B6B]">Roamly</div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-gray-700 hover:text-[#FF6B6B] transition">
              Log in
            </Link>
            <Link 
              href="/signup" 
              className="bg-[#FF6B6B] text-white px-6 py-2 rounded-full font-semibold hover:bg-[#ff5252] transition"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="inline-block bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full text-sm text-gray-600 mb-6">
          ✨ Plan trips with friends, not spreadsheets
        </div>
        
        <h1 className="text-5xl md:text-7xl font-serif mb-6">
          Group trips,<br />
          <span className="text-[#FF6B6B]">finally organized</span>
        </h1>
        
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          Drop links, vote on ideas, chat with your crew, and watch your itinerary build itself. 
          No more scattered WhatsApp threads and lost Google Docs.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link 
            href="/signup"
            className="inline-block bg-[#FF6B6B] text-white px-10 py-4 rounded-full text-lg font-semibold hover:bg-[#ff5252] hover:scale-105 transition shadow-lg shadow-[#FF6B6B]/30"
          >
            Start Planning Free →
          </Link>
          <Link 
            href="/login"
            className="inline-block bg-white text-gray-700 px-10 py-4 rounded-full text-lg font-semibold hover:bg-gray-50 transition border-2 border-gray-200"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-3xl font-serif text-center mb-12">How it works</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="text-4xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold mb-2">Drop links</h3>
            <p className="text-gray-600">
              Found a cool Airbnb? Amazing restaurant? Just paste the link. 
              We&apos;ll unfurl it into a beautiful card.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="text-4xl mb-4">👍</div>
            <h3 className="text-xl font-semibold mb-2">Vote together</h3>
            <p className="text-gray-600">
              Everyone votes on what they love. See what the group actually wants, 
              not just what one person planned.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="text-4xl mb-4">📅</div>
            <h3 className="text-xl font-semibold mb-2">Auto-itinerary</h3>
            <p className="text-gray-600">
              Drag approved items to your day-by-day plan. 
              Pull it up on your phone while you&apos;re actually there.
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-white py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="text-6xl mb-6">✈️</div>
          <h2 className="text-3xl font-serif mb-4">Ready for your next adventure?</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Join travelers who are tired of &quot;let&apos;s just figure it out when we get there&quot; 
            and want a plan that everyone&apos;s excited about.
          </p>
          <Link 
            href="/signup"
            className="inline-block bg-[#FF6B6B] text-white px-10 py-4 rounded-full text-lg font-semibold hover:bg-[#ff5252] transition"
          >
            Create Your First Trip
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#F5F0E8] border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-500">
          <div className="text-xl font-serif text-[#FF6B6B] mb-2">Roamly</div>
          <p className="text-sm">Built with love for travelers who plan together 🌍</p>
        </div>
      </footer>
    </div>
  )
}
