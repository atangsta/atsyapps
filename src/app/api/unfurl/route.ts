import { NextRequest, NextResponse } from 'next/server'

interface UnfurlResult {
  title: string
  description: string | null
  image_url: string | null
  category: 'hotel' | 'food' | 'activity' | 'other'
  site_name: string | null
}

// URL patterns to detect category
const CATEGORY_PATTERNS = {
  hotel: [
    /marriott\.com/i,
    /hilton\.com/i,
    /hyatt\.com/i,
    /airbnb\.com/i,
    /booking\.com/i,
    /hotels\.com/i,
    /expedia\.com.*hotel/i,
    /vrbo\.com/i,
    /westin/i,
    /sheraton/i,
    /fourseasons\.com/i,
    /ritzcarlton\.com/i,
  ],
  food: [
    /yelp\.com/i,
    /opentable\.com/i,
    /resy\.com/i,
    /doordash\.com/i,
    /ubereats\.com/i,
    /grubhub\.com/i,
    /seamless\.com/i,
    /tripadvisor\.com.*restaurant/i,
    /eater\.com/i,
    /thrillist\.com.*food|restaurant/i,
    /michelin/i,
  ],
  activity: [
    /tripadvisor\.com/i,
    /viator\.com/i,
    /getyourguide\.com/i,
    /eventbrite\.com/i,
    /ticketmaster\.com/i,
    /stubhub\.com/i,
    /museum/i,
    /broadway/i,
    /tours/i,
  ],
}

function detectCategory(url: string, ogType?: string): 'hotel' | 'food' | 'activity' | 'other' {
  // Check URL patterns
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return category as 'hotel' | 'food' | 'activity'
      }
    }
  }
  
  // Check OG type
  if (ogType) {
    if (ogType.includes('restaurant') || ogType.includes('food')) return 'food'
    if (ogType.includes('hotel') || ogType.includes('lodging')) return 'hotel'
  }
  
  return 'other'
}

function extractMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {}
  
  // Match meta tags with property or name attributes
  const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*?)["']|<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["']([^"']+)["']/gi
  
  let match
  while ((match = metaRegex.exec(html)) !== null) {
    const key = match[1] || match[4]
    const value = match[2] || match[3]
    if (key && value) {
      tags[key.toLowerCase()] = value
    }
  }
  
  // Also get title tag
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (titleMatch) {
    tags['title'] = titleMatch[1].trim()
  }
  
  return tags
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Fetch the URL with a timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    let html: string
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RoamlyBot/1.0; +https://roamly.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      })
      clearTimeout(timeout)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      html = await response.text()
    } catch (fetchError) {
      clearTimeout(timeout)
      // Return basic result with URL-based category detection
      return NextResponse.json({
        title: new URL(url).hostname.replace('www.', ''),
        description: null,
        image_url: null,
        category: detectCategory(url),
        site_name: null,
      } as UnfurlResult)
    }

    // Extract meta tags
    const tags = extractMetaTags(html)
    
    // Build result
    const result: UnfurlResult = {
      title: tags['og:title'] || tags['twitter:title'] || tags['title'] || new URL(url).hostname,
      description: tags['og:description'] || tags['twitter:description'] || tags['description'] || null,
      image_url: tags['og:image'] || tags['twitter:image'] || null,
      category: detectCategory(url, tags['og:type']),
      site_name: tags['og:site_name'] || null,
    }
    
    // Clean up title (remove site name suffix if present)
    if (result.title && result.site_name) {
      result.title = result.title
        .replace(new RegExp(`\\s*[|\\-–—]\\s*${result.site_name}\\s*$`, 'i'), '')
        .trim()
    }
    
    // Make image URL absolute if relative
    if (result.image_url && !result.image_url.startsWith('http')) {
      const urlObj = new URL(url)
      result.image_url = result.image_url.startsWith('/')
        ? `${urlObj.origin}${result.image_url}`
        : `${urlObj.origin}/${result.image_url}`
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Unfurl error:', error)
    return NextResponse.json(
      { error: 'Failed to unfurl URL' },
      { status: 500 }
    )
  }
}
