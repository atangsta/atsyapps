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
  rating_source: string | null
}

function detectCategory(url: string, title?: string): 'hotel' | 'food' | 'activity' | 'other' {
  const text = `${url} ${title || ''}`.toLowerCase()
  
  if (/marriott|hilton|hyatt|airbnb|booking\.com|hotels\.com|expedia.*hotel|vrbo|westin|sheraton|fourseasons|ritzcarlton/i.test(text)) {
    return 'hotel'
  }
  if (/yelp|opentable|resy|restaurant|food|dining|eater\.com|michelin|cafe|bistro|grill|kitchen/i.test(text)) {
    return 'food'
  }
  if (/tripadvisor|viator|getyourguide|eventbrite|ticketmaster|museum|broadway|tours/i.test(text)) {
    return 'activity'
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

// Extract ratings from JSON-LD structured data
function extractJsonLdRatings(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

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

  return { rating, review_count, price_range }
}

// Extract Yelp data from page HTML
function extractYelpData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let { rating, review_count, price_range } = extractJsonLdRatings(html)

  // Try aria-label for rating
  if (!rating) {
    const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star\s*rating"/i)
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1])
    }
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

// Search Yelp for a business
async function searchYelp(businessName: string, location: string = 'New York'): Promise<{
  rating: number | null
  review_count: number | null
  price_range: string | null
  image_url: string | null
}> {
  const result = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null, image_url: null as string | null }
  
  try {
    const searchQuery = encodeURIComponent(businessName)
    const locationQuery = encodeURIComponent(location)
    const searchUrl = `https://www.yelp.com/search?find_desc=${searchQuery}&find_loc=${locationQuery}`
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
    })
    
    if (!response.ok) return result
    
    const html = await response.text()
    
    // Extract first result's rating from search page
    // Look for rating in the search results
    const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star rating"/i)
    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1])
    }
    
    // Look for review count
    const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
    if (reviewMatch) {
      result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
    
    // Look for price range
    const priceMatch = html.match(/>(\${1,4})</i)
    if (priceMatch) {
      result.price_range = priceMatch[1]
    }
    
    // Look for image
    const imgMatch = html.match(/src="(https:\/\/s3-media\d?\.fl\.yelpcdn\.com\/bphoto\/[^"]+)"/i)
    if (imgMatch) {
      result.image_url = imgMatch[1]
    }
    
  } catch { /* ignore */ }
  
  return result
}

// Search TripAdvisor via DuckDuckGo
async function searchTripAdvisor(businessName: string, location: string = 'New York'): Promise<{
  rating: number | null
  review_count: number | null
}> {
  const result = { rating: null as number | null, review_count: null as number | null }
  
  try {
    const searchQuery = encodeURIComponent(`${businessName} ${location} site:tripadvisor.com`)
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    
    if (!response.ok) return result
    
    const html = await response.text()
    
    // Look for rating patterns in snippets
    const ratingMatch = html.match(/(\d+\.?\d*)\s*of\s*5\s*bubbles?/i) || 
                        html.match(/rating[:\s]+(\d+\.?\d*)/i) ||
                        html.match(/(\d+\.?\d*)\s*(?:stars?|out of 5)/i)
    if (ratingMatch) {
      const r = parseFloat(ratingMatch[1])
      if (r >= 1 && r <= 5) result.rating = r
    }
    
    // Look for review count
    const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
    if (reviewMatch) {
      result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
    
  } catch { /* ignore */ }
  
  return result
}

// Search Google Maps via DuckDuckGo
async function searchGoogleMaps(businessName: string, location: string = 'New York'): Promise<{
  rating: number | null
  review_count: number | null
}> {
  const result = { rating: null as number | null, review_count: null as number | null }
  
  try {
    const searchQuery = encodeURIComponent(`${businessName} ${location} reviews rating`)
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    
    if (!response.ok) return result
    
    const html = await response.text()
    
    // Look for Google-style ratings "4.5 (1,234)"
    const ratingMatch = html.match(/(\d+\.?\d*)\s*\([\d,]+\s*reviews?\)/i) ||
                        html.match(/(\d+\.?\d*)\s*stars?/i) ||
                        html.match(/rated\s*(\d+\.?\d*)/i)
    if (ratingMatch) {
      const r = parseFloat(ratingMatch[1])
      if (r >= 1 && r <= 5) result.rating = r
    }
    
    // Look for review count
    const reviewMatch = html.match(/\(([\d,]+)\s*reviews?\)/i) || html.match(/([\d,]+)\s*reviews?/i)
    if (reviewMatch) {
      result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
    
  } catch { /* ignore */ }
  
  return result
}

// Multi-source rating search
async function findRatingsFromMultipleSources(businessName: string, location: string = 'New York'): Promise<{
  rating: number | null
  review_count: number | null
  price_range: string | null
  source: string | null
  image_url: string | null
}> {
  // Try all sources in parallel
  const [yelpResult, tripAdvisorResult, googleResult] = await Promise.all([
    searchYelp(businessName, location),
    searchTripAdvisor(businessName, location),
    searchGoogleMaps(businessName, location),
  ])
  
  // Prioritize: Yelp > TripAdvisor > Google
  if (yelpResult.rating) {
    return {
      rating: yelpResult.rating,
      review_count: yelpResult.review_count,
      price_range: yelpResult.price_range,
      source: 'Yelp',
      image_url: yelpResult.image_url,
    }
  }
  
  if (tripAdvisorResult.rating) {
    return {
      rating: tripAdvisorResult.rating,
      review_count: tripAdvisorResult.review_count,
      price_range: null,
      source: 'TripAdvisor',
      image_url: null,
    }
  }
  
  if (googleResult.rating) {
    return {
      rating: googleResult.rating,
      review_count: googleResult.review_count,
      price_range: null,
      source: 'Google',
      image_url: null,
    }
  }
  
  // Return Yelp image even if no rating found
  return {
    rating: null,
    review_count: null,
    price_range: yelpResult.price_range,
    source: null,
    image_url: yelpResult.image_url,
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
    const isGoogleMaps = hostname.includes('google.com/maps') || hostname.includes('maps.google')
    const isReviewSite = isYelp || isTripAdvisor || isOpenTable || isGoogleMaps
    
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
      .replace(/\s*[|\\-–—]\s*(Yelp|TripAdvisor|OpenTable|Google Maps|Resy|Eater).*$/i, '')
      .replace(/\s*-\s*(Restaurant|Menu|Reservations)\s*$/i, '')
      .trim()
    
    // If title is empty or generic, extract from URL path
    if (!title || title.length < 3 || /^(home|welcome|menu)$/i.test(title)) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      const bizPart = pathParts.find(p => p.includes('-') && p.length > 5)
      if (bizPart) {
        title = bizPart
          .split('-')
          .slice(0, -1)
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      } else {
        title = hostname.replace(/\.(com|net|org)$/i, '')
      }
    }
    
    const category = detectCategory(url, title)
    
    // Get ratings/reviews
    let reviewData = { 
      rating: null as number | null, 
      review_count: null as number | null, 
      price_range: null as string | null,
      source: null as string | null,
    }
    let foundImage: string | null = null
    
    // First try: extract from the page directly if it's a review site
    if (isYelp && html) {
      const yelpData = extractYelpData(html)
      if (yelpData.rating) {
        reviewData = { ...yelpData, source: 'Yelp' }
      }
    } else if ((isTripAdvisor || isOpenTable) && html) {
      const jsonLdData = extractJsonLdRatings(html)
      if (jsonLdData.rating) {
        reviewData = { ...jsonLdData, source: isTripAdvisor ? 'TripAdvisor' : 'OpenTable' }
      }
    }
    
    // Second try: if no rating yet, search multiple sources
    if (!reviewData.rating && title.length >= 3) {
      // Try to extract location from URL or use default
      let location = 'New York'
      if (urlObj.pathname.includes('new-york') || urlObj.hostname.includes('nyc')) {
        location = 'New York'
      }
      
      const multiSourceData = await findRatingsFromMultipleSources(title, location)
      if (multiSourceData.rating) {
        reviewData = {
          rating: multiSourceData.rating,
          review_count: multiSourceData.review_count,
          price_range: multiSourceData.price_range || reviewData.price_range,
          source: multiSourceData.source,
        }
      }
      if (multiSourceData.image_url) {
        foundImage = multiSourceData.image_url
      }
    }
    
    // Get image
    let imageUrl = tags['og:image'] || tags['twitter:image'] || foundImage || null
    
    // Make image URL absolute
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = imageUrl.startsWith('/')
        ? `${urlObj.origin}${imageUrl}`
        : `${urlObj.origin}/${imageUrl}`
    }
    
    // If still no image and it's food, try Yelp search
    if (!imageUrl && category === 'food') {
      const yelpSearch = await searchYelp(title, 'New York')
      if (yelpSearch.image_url) {
        imageUrl = yelpSearch.image_url
      }
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
      rating_source: reviewData.source,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Unfurl error:', error)
    return NextResponse.json({ error: 'Failed to unfurl URL' }, { status: 500 })
  }
}
