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

// Extract a clean business name from title or URL
function extractBusinessName(title: string, url: string): string {
  let name = title
    .replace(/\s*[|\\-\u2013\u2014:].*/g, '')
    .replace(/\s*(restaurant|cafe|bar|grill|kitchen|eatery|bistro|nyc|ny|new york|official site|home|welcome).*/gi, '')
    .replace(/[\u00ae\u2122\u00a9]/g, '')
    .trim()
  
  if (name.length < 3 || /^(home|welcome|menu)$/i.test(name)) {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.replace('www.', '').replace(/\.(com|net|org|io|co)$/, '')
    name = hostname.split('.')[0]
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
  }
  
  return name.trim()
}

function extractYelpData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star\s*rating"/i)
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1])
  }

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
      }
    }
  }

  if (!review_count) {
    const reviewMatch = html.match(/\(?([\d,]+)\s*reviews?\)?/i)
    if (reviewMatch) {
      review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
  }

  if (!price_range) {
    const priceMatch = html.match(/aria-label="[^"]*($\{1,4})[^"]*price/i) ||
                       html.match(/>($\{1,4})</i) ||
                       html.match(/price[^>]*>($\{1,4})/i)
    if (priceMatch) {
      price_range = priceMatch[1]
    }
  }

  return { rating, review_count, price_range }
}

function extractTripAdvisorData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

  const bubbleMatch = html.match(/bubble_(\d)(\d)/i)
  if (bubbleMatch) {
    rating = parseInt(bubbleMatch[1], 10) + parseInt(bubbleMatch[2], 10) / 10
  }

  const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
  if (reviewMatch) {
    review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
  }

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
      }
    }
  }

  return { rating, review_count, price_range }
}

function extractGoogleMapsData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

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

function extractOpenTableData(html: string): { rating: number | null; review_count: number | null; price_range: string | null } {
  let rating: number | null = null
  let review_count: number | null = null
  let price_range: string | null = null

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
      }
    }
  }

  return { rating, review_count, price_range }
}

async function searchYelpForRatings(businessName: string): Promise<{ rating: number | null; review_count: number | null; price_range: string | null; yelpUrl: string | null }> {
  const result = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null, yelpUrl: null as string | null }
  
  try {
    const searchQuery = encodeURIComponent(businessName)
    const searchUrl = `https://www.yelp.com/search?find_desc=${searchQuery}&find_loc=New+York%2C+NY`
    
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    
    if (!searchResponse.ok) {
      return result
    }
    
    const searchHtml = await searchResponse.text()
    
    const bizLinkMatch = searchHtml.match(/href="(\/biz\/[^"?]+)"/i)
    if (!bizLinkMatch) {
      return result
    }
    
    const bizPath = bizLinkMatch[1]
    const bizUrl = `https://www.yelp.com${bizPath}`
    result.yelpUrl = bizUrl
    
    const bizResponse = await fetch(bizUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    
    if (!bizResponse.ok) {
      return result
    }
    
    const bizHtml = await bizResponse.text()
    const yelpData = extractYelpData(bizHtml)
    
    result.rating = yelpData.rating
    result.review_count = yelpData.review_count
    result.price_range = yelpData.price_range
    
  } catch (error) {
    console.error('Yelp search error:', error)
  }
  
  return result
}

async function searchGoogleForRatings(businessName: string): Promise<{ rating: number | null; review_count: number | null; price_range: string | null }> {
  const result = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null }
  
  try {
    const searchQuery = encodeURIComponent(`${businessName} restaurant reviews rating`)
    const searchUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    
    if (!response.ok) {
      return result
    }
    
    const html = await response.text()
    
    const ratingMatch = html.match(/(\d+\.?\d*)\s*(?:out of 5|\/5|stars?|\u2b50)/i)
    if (ratingMatch) {
      const rating = parseFloat(ratingMatch[1])
      if (rating >= 1 && rating <= 5) {
        result.rating = rating
      }
    }
    
    const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
    if (reviewMatch) {
      result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
    
  } catch (error) {
    console.error('Search error:', error)
  }
  
  return result
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
    let category = detectCategory(url, tags['og:type'])
    
    let reviewData = { rating: null as number | null, review_count: null as number | null, price_range: null as string | null }
    
    const isReviewSite = /yelp\.com|tripadvisor\.com|google\.com\/maps|maps\.google|opentable\.com/i.test(url)
    
    if (/yelp\.com/i.test(url)) {
      reviewData = extractYelpData(html)
    } else if (/tripadvisor\.com/i.test(url)) {
      reviewData = extractTripAdvisorData(html)
    } else if (/google\.com\/maps|maps\.google/i.test(url)) {
      reviewData = extractGoogleMapsData(html)
    } else if (/opentable\.com/i.test(url)) {
      reviewData = extractOpenTableData(html)
    }
    
    if (!reviewData.rating && !isReviewSite) {
      const title = tags['og:title'] || tags['twitter:title'] || tags['title'] || ''
      const businessName = extractBusinessName(title, url)
      
      if (businessName.length >= 3) {
        console.log(`Searching Yelp for: "${businessName}"`)
        
        const yelpResult = await searchYelpForRatings(businessName)
        if (yelpResult.rating) {
          reviewData = {
            rating: yelpResult.rating,
            review_count: yelpResult.review_count,
            price_range: yelpResult.price_range,
          }
          if (category === 'other') {
            category = 'food'
          }
        } else {
          const searchResult = await searchGoogleForRatings(businessName)
          if (searchResult.rating) {
            reviewData = searchResult
          }
        }
      }
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
    
    if (result.title) {
      if (/t-shirt|shirt|merch|product|shop|cart|checkout/i.test(result.title)) {
        const urlObj = new URL(url)
        const hostname = urlObj.hostname.replace('www.', '').replace(/\.(com|net|org|io|co)$/, '')
        result.title = hostname.charAt(0).toUpperCase() + hostname.slice(1)
      }
      
      if (result.site_name) {
        result.title = result.title
          .replace(new RegExp(`\\s*[|\\-\u2013\u2014]\\s*${result.site_name}\\s*$`, 'i'), '')
          .trim()
      }
    }
    
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
