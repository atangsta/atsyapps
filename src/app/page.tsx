'use client'

import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [linkUrl, setLinkUrl] = useState('')
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Store link in session/localStorage and redirect to signup
    if (linkUrl.trim()) {
      sessionStorage.setItem('pendingLink', linkUrl)
    }
    router.push('/signup')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-4xl font-serif text-gray-800 animate-pulse">Roamly</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-6 flex justify-between items-center">
          {/* Hamburger Menu */}
          <button className="p-2 hover:bg-gray-100 rounded-lg transition">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          
          {/* Log In Button */}
          <Link 
            href="/login" 
            className="px-6 py-2.5 bg-[#FFF8E7] text-gray-800 rounded-full font-medium hover:bg-[#FFEFC7] transition border border-[#F0E6D0]"
          >
            Log In
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <h1 className="text-4xl md:text-5xl font-serif text-gray-800 mb-12">
          Start your trip
        </h1>
        
        {/* Link Input */}
        <form onSubmit={handleSubmit} className="w-full max-w-xl">
          <div className="relative">
            <input
              type="text"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Drop a link here"
              className="w-full px-6 py-4 text-lg bg-white border border-gray-200 rounded-full focus:outline-none focus:border-gray-400 transition pr-14"
            />
            <button 
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 8 12 16" />
                <polyline points="8 12 12 8 16 12" />
              </svg>
            </button>
          </div>
        </form>
      </div>

      {/* Cloud Mascot - Bottom Left */}
      <div className="absolute bottom-0 left-0 pointer-events-none">
        <svg width="400" height="300" viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Background cloud shape */}
          <ellipse cx="150" cy="240" rx="180" ry="100" fill="#FFF8E7" />
          <ellipse cx="280" cy="200" rx="140" ry="90" fill="#FFF8E7" />
          <ellipse cx="100" cy="200" rx="100" ry="70" fill="#FFF8E7" />
          
          {/* Face */}
          <g transform="translate(100, 180)">
            {/* Left eye - closed/happy */}
            <path d="M30 20 Q40 10 50 20" stroke="#4A4A4A" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* Right eye - closed/happy */}
            <path d="M70 20 Q80 10 90 20" stroke="#4A4A4A" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* Smile */}
            <path d="M45 45 Q60 60 75 45" stroke="#4A4A4A" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>
        </svg>
      </div>
    </div>
  )
}
