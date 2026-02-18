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
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        return category as 'hotel' | 'food' | 'activity'
      }
    }
  }
  
  if (ogType) {
    if (ogType.includes('restaurant') || ogType.includes('food')) return 'food'
    if (ogType.includes('hotel') || ogType.includes('lodging')) return 'hotel'
  }
  
  return 'other'
}

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

// Extract Yelp-specific data from HTML
function extractYelpData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  // Try to extract rating from aria-label like "4.5 star rating"
  const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star\s*rating"/i)
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1])
  }

  // Try JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const jsonBlock of jsonLdMatch) {
      try {
        const jsonContent = jsonBlock.replace(/<script[^>]*>|<\/script>/gi, '')
        const data = JSON.parse(jsonContent)
        
        // Handle array of JSON-LD objects
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
      } catch {
        // JSON parse error, continue
      }
    }
  }

  // Fallback: look for review count in text like "(1,234 reviews)"
  if (!review_count) {
    const reviewMatch = html.match(/\(?([\d,]+)\s*reviews?\)?/i)
    if (reviewMatch) {
      review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
  }

  // Look for price range patterns ($ $$ $$$ $$$$)
  if (!price_range) {
    const priceMatch = html.match(/aria-label="[^"]*(\${1,4})[^"]*price/i) ||
                       html.match(/>(\${1,4})</i) ||
                       html.match(/price[^>]*>(\${1,4})/i)
    if (priceMatch) {
      price_range = priceMatch[1]
    }
  }

  return { rating, review_count, price_range }
}

// Extract TripAdvisor-specific data
function extractTripAdvisorData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  // TripAdvisor uses bubbles for ratings (e.g., "bubble_45" = 4.5 stars)
  const bubbleMatch = html.match(/bubble_(\d)(\d)/i)
  if (bubbleMatch) {
    rating = parseInt(bubbleMatch[1], 10) + parseInt(bubbleMatch[2], 10) / 10
  }

  // Look for review count
  const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
  if (reviewMatch) {
    review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
  }

  // Try JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const jsonBlock of jsonLdMatch) {
      try {
        const jsonContent = jsonBlock.replace(/<script[^>]*>|<\/script>/gi, '')
        const data = JSON.parse(jsonContent)
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
      } catch {
        // Continue on error
      }
    }
  }

  return { rating, review_count, price_range }
}

// Extract Google Maps data
function extractGoogleMapsData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  // Google embeds rating in meta or aria labels
  const ratingMatch = html.match(/(\d+\.?\d*)\s*stars?/i)
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1])
  }

  const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
  if (reviewMatch) {
    review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
  }

  return { rating, review_count, price_range }
}

// Extract OpenTable data
function extractOpenTableData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  // OpenTable uses JSON-LD extensively
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)
  if (jsonLdMatch) {
    for (const jsonBlock of jsonLdMatch) {
      try {
        const jsonContent = jsonBlock.replace(/<script[^>]*>|<\/script>/gi, '')
        const data = JSON.parse(jsonContent)
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item.aggregateRating) {
            rating = parseFloat(item.aggregateRating.ratingValue)
            review_count = parseInt(item.aggregateRating.reviewCount, 10)
          }
          if (item.priceRange) {
            price_range = item.priceRange
          }
        }
      } catch {
        // Continue
      }
    }
  }

  return { rating, review_count, price_range }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    let html: string
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      clearTimeout(timeout)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      html = await response.text()
    } catch (fetchError) {
      clearTimeout(timeout)
      return NextResponse.json({
        title: new URL(url).hostname.replace('www.', ''),
        description: null,
        image_url: null,
        category: detectCategory(url),
        site_name: null,
        rating: null,
        review_count: null,
        price_range: null,
      } as UnfurlResult)
    }

    const tags = extractMetaTags(html)
    const category = detectCategory(url, tags['og:type'])
    
    // Extract ratings based on the source
    let reviewData = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null }
    
    if (/yelp\.com/i.test(url)) {
      reviewData = extractYelpData(html)
    } else if (/tripadvisor\.com/i.test(url)) {
      reviewData = extractTripAdvisorData(html)
    } else if (/google\.com\/maps|maps\.google/i.test(url)) {
      reviewData = extractGoogleMapsData(html)
    } else if (/opentable\.com/i.test(url)) {
      reviewData = extractOpenTableData(html)
    }
    
    const result: UnfurlResult = {
      title: tags['og:title'] || tags['twitter:title'] || tags['title'] || new URL(url).hostname,
      description: tags['og:description'] || tags['twitter:description'] || tags['description'] || null,
      image_url: tags['og:image'] || tags['twitter:image'] || null,
      category,
      site_name: tags['og:site_name'] || null,
      rating: reviewData.rating,
      review_count: reviewData.review_count,
      price_range: reviewData.price_range,
    }
    
    // Clean up title
    if (result.title && result.site_name) {
      result.title = result.title
        .replace(new RegExp(`\\s*[|\\-–—]\\s*${result.site_name}\\s*$`, 'i'), '')
        .trim()
    }
    
    // Make image URL absolute
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
