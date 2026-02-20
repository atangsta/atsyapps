'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)
    
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-4xl font-serif text-[#FF6B6B]">
            Roamly
          </Link>
          <p className="text-gray-600 mt-2">Welcome back, traveler</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          {sent ? (
            /* Success State */
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h2 className="text-xl font-semibold mb-2">Check your email</h2>
              <p className="text-gray-600 mb-4">
                We sent a magic link to <strong>{email}</strong>
              </p>
              <p className="text-sm text-gray-500">
                Click the link in your email to sign in. It may take a minute to arrive.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-6 text-[#FF6B6B] text-sm font-medium hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* Email Form */
            <form onSubmit={handleMagicLink}>
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-1">Sign in with email</h2>
                <p className="text-gray-500 text-sm">No password needed — we'll send you a magic link</p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">
                  {error}
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-[#FF6B6B] focus:outline-none transition"
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full bg-[#FF6B6B] text-white py-3 rounded-full font-semibold hover:bg-[#ff5252] transition disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          )}
        </div>

        {/* Back to home */}
        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/" className="hover:text-gray-700">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
