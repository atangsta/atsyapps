import { NextRequest, NextResponse } from 'next/server'

interface UnfurlResult {
  title: string
  description: string | null
  image_url: string | null
  category: 'hotel' | 'food' | 'activity' | 'other'
  site_name: string | null
  rating: number | null
  review_count: number | null
  price_range: string | null
}

function detectCategory(url: string, title?: string): 'hotel' | 'food' | 'activity' | 'other' {
  const text = `${url} ${title || ''}`.toLowerCase()
  
  if (/marriott|hilton|hyatt|airbnb|booking\.com|hotels\.com|expedia.*hotel|vrbo|westin|sheraton|fourseasons|ritzcarlton/i.test(text)) {
    return 'hotel'
  }
  if (/yelp|opentable|resy|restaurant|food|dining|eater\.com|michelin/i.test(text)) {
    return 'food'
  }
  if (/tripadvisor|viator|getyourguide|eventbrite|ticketmaster|museum|broadway|tours/i.test(text)) {
    return 'activity'
  }
  return 'other'
}

// Extract meta tags from HTML
function extractMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {}
  
  const metaRegex = /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*?)["']|<meta\s+content=["']([^"']*?)["']\s+(?:property|name)=["']([^"']+)["']/gi
  
  let match
  while ((match = metaRegex.exec(html)) !== null) {
    const key = match[1] || match[4]
    const value = match[2] || match[3]
    if (key && value) {
      tags[key.toLowerCase()] = value
    }
  }
  
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  if (titleMatch) {
    tags['title'] = titleMatch[1].trim()
  }
  
  return tags
}

// Extract Yelp data from page HTML
function extractYelpData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  // Try aria-label for rating
  const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star\s*rating"/i)
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1])
  }

  // Try JSON-LD
  const jsonLdMatches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  for (const jsonBlock of jsonLdMatches) {
    try {
      const data = JSON.parse(jsonBlock[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item.aggregateRating) {
          rating = rating || parseFloat(item.aggregateRating.ratingValue)
          review_count = review_count || parseInt(item.aggregateRating.reviewCount, 10)
        }
        if (item.priceRange) {
          price_range = item.priceRange
        }
      }
    } catch { /* ignore */ }
  }

  // Fallback review count
  if (!review_count) {
    const reviewMatch = html.match(/\(?([\d,]+)\s*reviews?\)?/i)
    if (reviewMatch) {
      review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
  }

  // Fallback price range
  if (!price_range) {
    const priceMatch = html.match(/aria-label="[^"]*(\${1,4})[^"]*"/i) || html.match(/>(\${1,4})</i)
    if (priceMatch) {
      price_range = priceMatch[1]
    }
  }

  return { rating, review_count, price_range }
}

// Search DuckDuckGo for business info (for non-review sites)
async function searchForBusinessInfo(businessName: string, city: string = 'NYC'): Promise<{
  description: string | null
  rating: number | null
  review_count: number | null
  price_range: string | null
}> {
  const result = { description: null as string | null, rating: null as number | null, review_count: null as number | null, price_range: null as string | null }
  
  if (!businessName || businessName.length < 2) return result
  
  try {
    const searchQuery = encodeURIComponent(`${businessName} ${city} restaurant reviews`)
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    
    if (!response.ok) return result
    
    const html = await response.text()
    const snippets: string[] = []
    const snippetMatches = html.matchAll(/class="result__snippet"[^>]*>([^<]+)</gi)
    for (const match of snippetMatches) {
      if (match[1]?.length > 20) snippets.push(match[1].trim())
    }
    
    for (const snippet of snippets) {
      if (!result.rating) {
        const ratingMatch = snippet.match(/(\d+\.?\d*)\s*(?:stars?|\/\s*5|out of 5)/i)
        if (ratingMatch) {
          const r = parseFloat(ratingMatch[1])
          if (r >= 1 && r <= 5) result.rating = r
        }
      }
      if (!result.review_count) {
        const reviewMatch = snippet.match(/([\d,]+)\s*reviews?/i)
        if (reviewMatch) result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
      }
      if (!result.price_range) {
        const priceMatch = snippet.match(/(\${1,4})(?:\s|$|[^$])/i)
        if (priceMatch) result.price_range = priceMatch[1]
      }
    }
    
    // Build description from relevant snippets
    const goodSnippets = snippets.filter(s => 
      s.length > 30 && 
      !/book now|reserve|order online|sign up/i.test(s) &&
      /food|restaurant|dish|cuisine|menu|chef|atmosphere|dining|delicious|serves|known for/i.test(s)
    )
    
    if (goodSnippets.length > 0) {
      result.description = goodSnippets[0].substring(0, 200).trim()
      if (!/[.!?]$/.test(result.description)) result.description += '...'
    }
    
  } catch { /* ignore */ }
  
  return result
}

// Get Yelp photo from search
async function getYelpImage(businessName: string): Promise<string | null> {
  try {
    const searchQuery = encodeURIComponent(`${businessName} NYC`)
    const response = await fetch(`https://www.yelp.com/search?find_desc=${searchQuery}&find_loc=New+York%2C+NY`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    
    if (!response.ok) return null
    const html = await response.text()
    const imgMatch = html.match(/src="(https:\/\/s3-media\d?\.fl\.yelpcdn\.com\/bphoto\/[^"]+)"/i)
    return imgMatch ? imgMatch[1] : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace('www.', '').toLowerCase()
    
    // Check if this is a review site we should scrape directly
    const isYelp = hostname.includes('yelp.com')
    const isTripAdvisor = hostname.includes('tripadvisor.com')
    const isOpenTable = hostname.includes('opentable.com')
    const isReviewSite = isYelp || isTripAdvisor || isOpenTable
    
    // Fetch the original page
    let html = ''
    let tags: Record<string, string> = {}
    
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      clearTimeout(timeout)
      
      if (response.ok) {
        html = await response.text()
        tags = extractMetaTags(html)
      }
    } catch { /* ignore fetch errors */ }
    
    // Get title - prefer OG tags, clean up site suffix
    let title = tags['og:title'] || tags['twitter:title'] || tags['title'] || ''
    
    // Clean title - remove site name suffix
    title = title
      .replace(/\s*[|\\-–—]\s*(Yelp|TripAdvisor|OpenTable|Google Maps).*$/i, '')
      .replace(/\s*-\s*Restaurant\s*$/i, '')
      .trim()
    
    // If title is empty or generic, extract from URL path
    if (!title || title.length < 3 || /^(home|welcome|menu)$/i.test(title)) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      // For Yelp: /biz/restaurant-name-city
      const bizPart = pathParts.find(p => p.includes('-') && p.length > 5)
      if (bizPart) {
        title = bizPart
          .split('-')
          .slice(0, -1) // Remove city suffix
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      } else {
        title = hostname.replace(/\.(com|net|org)$/i, '')
      }
    }
    
    const category = detectCategory(url, title)
    
    // Get ratings/reviews
    let reviewData = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null }
    
    if (isYelp && html) {
      // Scrape Yelp directly
      reviewData = extractYelpData(html)
    } else if (!isReviewSite && title.length >= 3) {
      // For non-review sites, search the web for info
      const searchData = await searchForBusinessInfo(title)
      reviewData = searchData
      // Use search description if we don't have one
      if (searchData.description && !tags['og:description']) {
        tags['og:description'] = searchData.description
      }
    }
    
    // Get image
    let imageUrl = tags['og:image'] || tags['twitter:image'] || null
    
    // Make image URL absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = imageUrl.startsWith('/')
        ? `${urlObj.origin}${imageUrl}`
        : `${urlObj.origin}/${imageUrl}`
    }
    
    // If no image and it's food, try Yelp
    if (!imageUrl && category === 'food') {
      imageUrl = await getYelpImage(title)
    }
    
    const result: UnfurlResult = {
      title,
      description: tags['og:description'] || tags['twitter:description'] || tags['description'] || null,
      image_url: imageUrl,
      category,
      site_name: tags['og:site_name'] || hostname,
      rating: reviewData.rating,
      review_count: reviewData.review_count,
      price_range: reviewData.price_range,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Unfurl error:', error)
    return NextResponse.json({ error: 'Failed to unfurl URL' }, { status: 500 })
  }
}
