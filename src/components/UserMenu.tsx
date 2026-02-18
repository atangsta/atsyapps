'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

export default function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = user.user_metadata?.full_name
    ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase()
    : user.email?.charAt(0).toUpperCase() || '?'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-[#FF6B6B] text-white flex items-center justify-center font-semibold hover:bg-[#ff5252] transition"
      >
        {initials}
      </button>

      {open && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg z-50 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <p className="font-semibold text-gray-800">
                {user.user_metadata?.full_name || 'Traveler'}
              </p>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
