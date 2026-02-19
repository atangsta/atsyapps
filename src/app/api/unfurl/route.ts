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
  // New enrichment fields
  venue_type: string | null
  meal_times: string[] | null
  estimated_price_per_person: number | null
  cuisine_type: string | null
  ai_summary: string | null
}

interface EnrichmentData {
  venue_type: string | null
  meal_times: string[]
  estimated_price_per_person: number | null
  cuisine_type: string | null
  ai_summary: string | null
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

  if (!rating) {
    const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star\s*rating"/i)
    if (ratingMatch) {
      rating = parseFloat(ratingMatch[1])
    }
  }

  if (!review_count) {
    const reviewMatch = html.match(/\(?([\d,]+)\s*reviews?\)?/i)
    if (reviewMatch) {
      review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
  }

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
    
    const ratingMatch = html.match(/aria-label="(\d+\.?\d*)\s*star rating"/i)
    if (ratingMatch) {
      result.rating = parseFloat(ratingMatch[1])
    }
    
    const reviewMatch = html.match(/([\d,]+)\s*reviews?/i)
    if (reviewMatch) {
      result.review_count = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
    }
    
    const priceMatch = html.match(/>(\${1,4})</i)
    if (priceMatch) {
      result.price_range = priceMatch[1]
    }
    
    const imgMatch = html.match(/src="(https:\/\/s3-media\d?\.fl\.yelpcdn\.com\/bphoto\/[^"]+)"/i)
    if (imgMatch) {
      result.image_url = imgMatch[1]
    }
    
  } catch { /* ignore */ }
  
  return result
}

// Generate a concise summary from enrichment data
function generateSummary(
  businessName: string,
  category: string,
  venueType: string | null,
  cuisineType: string | null,
  mealTimes: string[],
  pricePerPerson: number | null,
  searchSnippets: string
): string | null {
  if (category === 'hotel') {
    // Extract hotel highlights from search
    const highlights: string[] = []
    if (/luxury|5-star|five star|world-class/i.test(searchSnippets)) highlights.push('Luxury hotel')
    else if (/boutique/i.test(searchSnippets)) highlights.push('Boutique hotel')
    else if (/budget|affordable/i.test(searchSnippets)) highlights.push('Budget-friendly hotel')
    else highlights.push('Hotel')
    
    if (/spa|wellness/i.test(searchSnippets)) highlights.push('with spa')
    if (/rooftop|views/i.test(searchSnippets)) highlights.push('great views')
    if (/central|downtown|midtown/i.test(searchSnippets)) highlights.push('central location')
    
    return highlights.join(', ') + '.'
  }
  
  if (category !== 'food') {
    // Activity summary
    if (/museum/i.test(searchSnippets)) return 'Museum and cultural attraction.'
    if (/show|broadway|theater/i.test(searchSnippets)) return 'Theater and entertainment venue.'
    if (/tour/i.test(searchSnippets)) return 'Guided tour or experience.'
    return null
  }
  
  // Restaurant summary
  const parts: string[] = []
  
  // Cuisine + venue type
  if (cuisineType && venueType) {
    const venueLabels: Record<string, string> = {
      fine_dining: 'fine dining',
      casual: 'casual',
      fast_casual: 'fast-casual',
      cafe: 'café',
      bar: 'bar & restaurant'
    }
    parts.push(`${cuisineType} ${venueLabels[venueType] || 'restaurant'}`)
  } else if (cuisineType) {
    parts.push(`${cuisineType} restaurant`)
  } else if (venueType) {
    const venueLabels: Record<string, string> = {
      fine_dining: 'Fine dining restaurant',
      casual: 'Casual dining spot',
      fast_casual: 'Fast-casual eatery',
      cafe: 'Café',
      bar: 'Bar & restaurant'
    }
    parts.push(venueLabels[venueType] || 'Restaurant')
  }
  
  // Extract notable features from search
  const features: string[] = []
  if (/known for|famous for|best|signature/i.test(searchSnippets)) {
    const knownForMatch = searchSnippets.match(/(?:known for|famous for|best|signature)[^.]*?([\w\s]+(?:dish|dishes|menu|food|cuisine|steak|pasta|sushi|ramen|tofu|bbq|pizza|burger|tacos))/i)
    if (knownForMatch) features.push(`known for ${knownForMatch[1].trim().toLowerCase()}`)
  }
  if (/since \d{4}|established \d{4}|opened in \d{4}/i.test(searchSnippets)) {
    const yearMatch = searchSnippets.match(/(?:since|established|opened in) (\d{4})/i)
    if (yearMatch) features.push(`since ${yearMatch[1]}`)
  }
  if (/reservations? (?:required|recommended|needed)/i.test(searchSnippets)) {
    features.push('reservations recommended')
  }
  
  // Combine
  let summary = parts.length > 0 ? parts[0] : 'Restaurant'
  if (features.length > 0) {
    summary += ` — ${features.slice(0, 2).join(', ')}`
  }
  
  // Add meal times hint
  if (mealTimes.length === 1) {
    if (mealTimes[0] === 'dinner') summary += '. Dinner only.'
    else if (mealTimes[0] === 'breakfast') summary += '. Breakfast/brunch spot.'
  } else if (mealTimes.length > 0 && !mealTimes.includes('breakfast')) {
    summary += '. Open for lunch and dinner.'
  }
  
  // Add price hint
  if (pricePerPerson) {
    if (pricePerPerson >= 100) summary += ` ~$${pricePerPerson}/person.`
    else if (pricePerPerson >= 50) summary += ` ~$${pricePerPerson}/person.`
  }
  
  return summary || null
}

// Search web and enrich venue data
async function enrichVenueData(
  businessName: string, 
  location: string = 'New York',
  category: string
): Promise<EnrichmentData> {
  const result: EnrichmentData = {
    venue_type: null,
    meal_times: [],
    estimated_price_per_person: null,
    cuisine_type: null,
    ai_summary: null,
  }
  
  // For hotels, generate a basic summary
  if (category === 'hotel') {
    try {
      const searchQuery = encodeURIComponent(`"${businessName}" ${location} hotel amenities reviews`)
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      if (response.ok) {
        const html = await response.text()
        const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
        result.ai_summary = generateSummary(businessName, category, null, null, [], null, cleanText)
      }
    } catch { /* ignore */ }
    return result
  }
  
  if (category !== 'food') {
    return result
  }
  
  try {
    // Search for restaurant info
    const searchQuery = encodeURIComponent(`"${businessName}" ${location} restaurant type cuisine dinner lunch price`)
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    })
    
    if (!response.ok) return result
    
    const html = await response.text()
    const cleanText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
    
    // Detect venue type
    if (/michelin|fine dining|tasting menu|prix fixe|upscale|white tablecloth|elegant/i.test(cleanText)) {
      result.venue_type = 'fine_dining'
    } else if (/fast casual|counter service|quick service|grab and go/i.test(cleanText)) {
      result.venue_type = 'fast_casual'
    } else if (/cafe|café|coffee shop|coffeehouse|bakery/i.test(cleanText)) {
      result.venue_type = 'cafe'
    } else if (/bar|cocktail|pub|tavern|lounge/i.test(cleanText)) {
      result.venue_type = 'bar'
    } else if (/casual|family|neighborhood|everyday|relaxed/i.test(cleanText)) {
      result.venue_type = 'casual'
    }
    
    // Detect meal times
    const mealTimes: string[] = []
    if (/breakfast|morning|brunch|opens? (at )?(6|7|8|9)/i.test(cleanText)) {
      mealTimes.push('breakfast')
    }
    if (/brunch|weekend breakfast|sunday/i.test(cleanText)) {
      if (!mealTimes.includes('breakfast')) mealTimes.push('breakfast')
    }
    if (/lunch|midday|noon|11|12/i.test(cleanText)) {
      mealTimes.push('lunch')
    }
    if (/dinner|evening|night|supper/i.test(cleanText)) {
      mealTimes.push('dinner')
    }
    
    // If fine dining or $$$+, likely dinner-only
    if (result.venue_type === 'fine_dining' && mealTimes.length === 0) {
      mealTimes.push('dinner')
    }
    
    // Default to lunch & dinner if nothing detected
    if (mealTimes.length === 0) {
      mealTimes.push('lunch', 'dinner')
    }
    
    result.meal_times = mealTimes
    
    // Detect cuisine type
    const cuisinePatterns: [RegExp, string][] = [
      [/korean|bulgogi|bibimbap|kimchi|korean bbq|kbbq/i, 'Korean'],
      [/japanese|sushi|ramen|izakaya|omakase|kaiseki/i, 'Japanese'],
      [/italian|pasta|pizza|trattoria|risotto/i, 'Italian'],
      [/chinese|dim sum|szechuan|cantonese|dumpling/i, 'Chinese'],
      [/mexican|tacos|burrito|taqueria/i, 'Mexican'],
      [/thai|pad thai|curry|bangkok/i, 'Thai'],
      [/indian|curry|tandoori|masala/i, 'Indian'],
      [/french|bistro|brasserie|parisian/i, 'French'],
      [/american|burger|steakhouse|bbq|barbecue/i, 'American'],
      [/mediterranean|greek|hummus|falafel/i, 'Mediterranean'],
      [/vietnamese|pho|banh mi/i, 'Vietnamese'],
      [/spanish|tapas|paella/i, 'Spanish'],
    ]
    
    for (const [pattern, cuisine] of cuisinePatterns) {
      if (pattern.test(cleanText)) {
        result.cuisine_type = cuisine
        break
      }
    }
    
    // Extract price per person
    const pricePatterns = [
      /\$(\d{2,3})\s*(per person|pp|\/person|a head|each)/i,
      /(\d{2,3})\s*dollars?\s*(per person|each)/i,
      /expect to (pay|spend)[^$]*\$(\d{2,3})/i,
      /averag(e|ing)[^$]*\$(\d{2,3})/i,
      /cost[^$]*\$(\d{2,3})/i,
    ]
    
    for (const pattern of pricePatterns) {
      const match = cleanText.match(pattern)
      if (match) {
        const priceStr = match[1] || match[2]
        const price = parseInt(priceStr, 10)
        if (price >= 10 && price <= 500) {
          result.estimated_price_per_person = price
          break
        }
      }
    }
    
    // If no price found, estimate based on venue type
    if (!result.estimated_price_per_person) {
      if (result.venue_type === 'fine_dining') {
        result.estimated_price_per_person = 150
      } else if (result.venue_type === 'fast_casual') {
        result.estimated_price_per_person = 18
      } else if (result.venue_type === 'cafe') {
        result.estimated_price_per_person = 15
      } else if (result.venue_type === 'bar') {
        result.estimated_price_per_person = 40
      }
      // casual defaults to null - will use price_range if available
    }
    
    // Generate AI summary from collected data
    result.ai_summary = generateSummary(
      businessName,
      category,
      result.venue_type,
      result.cuisine_type,
      result.meal_times,
      result.estimated_price_per_person,
      cleanText
    )
    
  } catch (error) {
    console.error('Enrichment error:', error)
  }
  
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
  const [yelpResult] = await Promise.all([
    searchYelp(businessName, location),
  ])
  
  if (yelpResult.rating) {
    return {
      rating: yelpResult.rating,
      review_count: yelpResult.review_count,
      price_range: yelpResult.price_range,
      source: 'Yelp',
      image_url: yelpResult.image_url,
    }
  }
  
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
    
    const isYelp = hostname.includes('yelp.com')
    const isTripAdvisor = hostname.includes('tripadvisor.com')
    const isOpenTable = hostname.includes('opentable.com')
    
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
    
    // Get title
    let title = tags['og:title'] || tags['twitter:title'] || tags['title'] || ''
    
    title = title
      .replace(/\s*[|\\-–—]\s*(Yelp|TripAdvisor|OpenTable|Google Maps|Resy|Eater).*$/i, '')
      .replace(/\s*-\s*(Restaurant|Menu|Reservations)\s*$/i, '')
      .trim()
    
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
    
    // Extract location from URL for searches
    let location = 'New York'
    if (urlObj.pathname.includes('new-york') || urlObj.hostname.includes('nyc')) {
      location = 'New York'
    }
    
    // Search for ratings if not found
    if (!reviewData.rating && title.length >= 3) {
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
    
    // *** NEW: Enrich venue data via web search ***
    const enrichment = await enrichVenueData(title, location, category)
    
    // Get image
    let imageUrl = tags['og:image'] || tags['twitter:image'] || foundImage || null
    
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = imageUrl.startsWith('/')
        ? `${urlObj.origin}${imageUrl}`
        : `${urlObj.origin}/${imageUrl}`
    }
    
    if (!imageUrl && category === 'food') {
      const yelpSearch = await searchYelp(title, location)
      if (yelpSearch.image_url) {
        imageUrl = yelpSearch.image_url
      }
    }
    
    // If we have a price_range but no estimated price, convert it
    let estimatedPrice = enrichment.estimated_price_per_person
    if (!estimatedPrice && reviewData.price_range) {
      const dollarCount = (reviewData.price_range.match(/\$/g) || []).length
      const priceMap: Record<number, number> = { 1: 20, 2: 45, 3: 85, 4: 175 }
      estimatedPrice = priceMap[dollarCount] || null
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
      // Enrichment fields
      venue_type: enrichment.venue_type,
      meal_times: enrichment.meal_times.length > 0 ? enrichment.meal_times : null,
      estimated_price_per_person: estimatedPrice,
      cuisine_type: enrichment.cuisine_type,
      ai_summary: enrichment.ai_summary,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Unfurl error:', error)
    return NextResponse.json({ error: 'Failed to unfurl URL' }, { status: 500 })
  }
}
