import { NextRequest, NextResponse } from 'next/server'

interface PriceEstimate {
  estimatedCost: number
  confidence: 'high' | 'medium' | 'low'
  source: string
  explanation: string
}

// Search DuckDuckGo for price info
async function searchPriceInfo(query: string): Promise<string> {
  try {
    const searchQuery = encodeURIComponent(query)
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${searchQuery}`, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
    })
    
    if (!response.ok) return ''
    return await response.text()
  } catch {
    return ''
  }
}

// Extract price from search results
function extractPriceFromText(text: string, venueType: 'restaurant' | 'hotel' | 'activity'): number | null {
  // Clean HTML
  const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  
  if (venueType === 'restaurant') {
    // Look for "per person" prices
    const perPersonMatch = cleanText.match(/\$(\d{2,3})\s*(per person|pp|\/person)/i)
    if (perPersonMatch) {
      return parseInt(perPersonMatch[1], 10)
    }
    
    // Look for tasting menu prices
    const tastingMatch = cleanText.match(/tasting menu[^$]*\$(\d{2,4})/i) ||
                         cleanText.match(/\$(\d{2,4})[^$]*tasting menu/i)
    if (tastingMatch) {
      return parseInt(tastingMatch[1], 10)
    }
    
    // Look for price ranges like "$150-$250" and take midpoint
    const rangeMatch = cleanText.match(/\$(\d{2,3})\s*[-–]\s*\$?(\d{2,3})/i)
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1], 10)
      const high = parseInt(rangeMatch[2], 10)
      return Math.round((low + high) / 2)
    }
    
    // Look for standalone prices in reasonable restaurant range
    const priceMatches = cleanText.matchAll(/\$(\d{2,3})(?!\d)/g)
    const prices: number[] = []
    for (const match of priceMatches) {
      const p = parseInt(match[1], 10)
      // Restaurant meal typically $20-$400
      if (p >= 20 && p <= 400) {
        prices.push(p)
      }
    }
    if (prices.length > 0) {
      // Return median price
      prices.sort((a, b) => a - b)
      return prices[Math.floor(prices.length / 2)]
    }
  }
  
  if (venueType === 'hotel') {
    // Look for nightly rates
    const nightlyMatch = cleanText.match(/\$(\d{2,4})\s*(\/night|per night|a night|nightly)/i)
    if (nightlyMatch) {
      return parseInt(nightlyMatch[1], 10)
    }
    
    // Look for "from $X" patterns
    const fromMatch = cleanText.match(/(?:from|starting at|rates? from)\s*\$(\d{2,4})/i)
    if (fromMatch) {
      return parseInt(fromMatch[1], 10)
    }
    
    // Look for price ranges
    const rangeMatch = cleanText.match(/\$(\d{3,4})\s*[-–]\s*\$?(\d{3,4})/i)
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1], 10)
      const high = parseInt(rangeMatch[2], 10)
      return Math.round((low + high) / 2)
    }
    
    // Standalone hotel prices ($100-$2000 range)
    const priceMatches = cleanText.matchAll(/\$(\d{3,4})(?!\d)/g)
    const prices: number[] = []
    for (const match of priceMatches) {
      const p = parseInt(match[1], 10)
      if (p >= 100 && p <= 2000) {
        prices.push(p)
      }
    }
    if (prices.length > 0) {
      prices.sort((a, b) => a - b)
      return prices[Math.floor(prices.length / 2)]
    }
  }
  
  if (venueType === 'activity') {
    // Look for ticket/admission prices
    const ticketMatch = cleanText.match(/(?:tickets?|admission|entry)[^$]*\$(\d{1,3})/i) ||
                        cleanText.match(/\$(\d{1,3})[^$]*(?:tickets?|admission|entry)/i)
    if (ticketMatch) {
      return parseInt(ticketMatch[1], 10)
    }
    
    // Look for "from $X" patterns
    const fromMatch = cleanText.match(/(?:from|starting at)\s*\$(\d{1,3})/i)
    if (fromMatch) {
      return parseInt(fromMatch[1], 10)
    }
    
    // Activity prices ($10-$200 range)
    const priceMatches = cleanText.matchAll(/\$(\d{1,3})(?!\d)/g)
    const prices: number[] = []
    for (const match of priceMatches) {
      const p = parseInt(match[1], 10)
      if (p >= 10 && p <= 200) {
        prices.push(p)
      }
    }
    if (prices.length > 0) {
      prices.sort((a, b) => a - b)
      return prices[Math.floor(prices.length / 2)]
    }
  }
  
  return null
}

// Detect if restaurant is fine dining
function isFineDining(title: string, description?: string): boolean {
  const text = `${title} ${description || ''}`.toLowerCase()
  
  const fineDiningIndicators = [
    'michelin',
    'tasting menu',
    'omakase',
    'fine dining',
    'chef\'s table',
    'james beard',
    'starred',
    'haute cuisine',
    'eleven madison',
    'per se',
    'le bernardin',
    'masa',
    'chef',
    'kaiseki',
    'prix fixe'
  ]
  
  return fineDiningIndicators.some(indicator => text.includes(indicator))
}

// Detect hotel tier based on brand name
function getHotelTier(title: string): { tier: string; estimate: number } {
  const name = title.toLowerCase()
  
  // Luxury ($800-1200/night in NYC)
  const luxuryBrands = [
    'four seasons', 'fourseasons', 'ritz carlton', 'ritz-carlton', 'st. regis', 'st regis',
    'mandarin oriental', 'peninsula', 'waldorf astoria', 'waldorf', 'aman', 'rosewood',
    'park hyatt', 'baccarat', 'the mark', 'the carlyle', 'carlyle', 'the plaza', 'plaza hotel',
    'the pierre', 'pierre hotel', 'the langham', 'langham', 'the greenwich', 'equinox hotel',
    'one hotel', 'edition', 'the edition', 'nomad hotel', 'gramercy park hotel'
  ]
  if (luxuryBrands.some(brand => name.includes(brand))) {
    return { tier: 'luxury', estimate: 950 }
  }
  
  // Upscale ($400-600/night in NYC)
  const upscaleBrands = [
    'marriott', 'hilton', 'hyatt', 'westin', 'sheraton', 'w hotel', 'w new york',
    'conrad', 'intercontinental', 'kimpton', 'thompson', 'dream hotel', 'sixty hotels',
    'soho grand', 'tribeca grand', 'the standard', 'standard hotel', 'ace hotel',
    'the dominick', 'dominick', 'lotte', 'jw marriott', 'the whitby', 'the william',
    'the beekman', 'refinery hotel', 'gansevoort', 'the james', 'viceroy'
  ]
  if (upscaleBrands.some(brand => name.includes(brand))) {
    return { tier: 'upscale', estimate: 450 }
  }
  
  // Mid-range ($200-350/night in NYC)
  const midrangeBrands = [
    'holiday inn', 'courtyard', 'residence inn', 'hampton inn', 'hampton', 'doubletree',
    'crowne plaza', 'radisson', 'wyndham', 'best western', 'hyatt place', 'hyatt house',
    'even hotel', 'cambria', 'hotel indigo', 'aloft', 'element', 'fairfield',
    'springhill', 'towneplace', 'homewood suites', 'embassy suites'
  ]
  if (midrangeBrands.some(brand => name.includes(brand))) {
    return { tier: 'midrange', estimate: 275 }
  }
  
  // Budget ($120-200/night in NYC)
  const budgetBrands = [
    'pod', 'moxy', 'citizenm', 'citizen m', 'yotel', 'freehand', 'hi hostel',
    'hostelling', 'la quinta', 'red roof', 'motel 6', 'super 8', 'days inn',
    'microtel', 'travelodge', 'howard johnson', 'econo lodge', 'sleep inn',
    'arlo', 'made hotel', 'the jane'
  ]
  if (budgetBrands.some(brand => name.includes(brand))) {
    return { tier: 'budget', estimate: 175 }
  }
  
  // Airbnb / vacation rental indicators
  if (name.includes('airbnb') || name.includes('vrbo') || name.includes('apartment') || name.includes('loft')) {
    return { tier: 'rental', estimate: 250 }
  }
  
  // Default: assume mid-upscale for unknown NYC hotels
  return { tier: 'unknown', estimate: 350 }
}

// Get fallback estimate based on category and signals
function getFallbackEstimate(
  category: string,
  title: string,
  priceRange?: string | null
): PriceEstimate {
  // If we have $ symbols, use them with better multipliers
  if (priceRange) {
    const dollarCount = (priceRange.match(/\$/g) || []).length
    
    if (category === 'food') {
      // For NYC fine dining, $ symbols mean:
      // $ = $15-25, $$ = $25-50, $$$ = $50-100, $$$$ = $100-200+
      const costMap: Record<number, number> = { 1: 20, 2: 40, 3: 75, 4: 175 }
      return {
        estimatedCost: costMap[dollarCount] || 50,
        confidence: 'medium',
        source: 'price_range',
        explanation: `Based on ${priceRange} price indicator`
      }
    }
  }
  
  // Hotel tier detection
  if (category === 'hotel') {
    const { tier, estimate } = getHotelTier(title)
    return {
      estimatedCost: estimate,
      confidence: tier === 'unknown' ? 'low' : 'medium',
      source: `hotel_tier_${tier}`,
      explanation: `${tier.charAt(0).toUpperCase() + tier.slice(1)} hotel - estimated $${estimate}/night`
    }
  }
  
  // Fine dining detection
  if (category === 'food' && isFineDining(title)) {
    return {
      estimatedCost: 200,
      confidence: 'medium',
      source: 'fine_dining_heuristic',
      explanation: 'Fine dining restaurant - estimated $200/person'
    }
  }
  
  // Category-based defaults
  const defaults: Record<string, PriceEstimate> = {
    food: {
      estimatedCost: 50,
      confidence: 'low', 
      source: 'category_default',
      explanation: 'Default restaurant estimate - suggest adding actual cost'
    },
    activity: {
      estimatedCost: 35,
      confidence: 'low',
      source: 'category_default',
      explanation: 'Default activity estimate'
    },
    other: {
      estimatedCost: 25,
      confidence: 'low',
      source: 'category_default',
      explanation: 'Default estimate'
    }
  }
  
  return defaults[category] || defaults.other
}

export async function POST(request: NextRequest) {
  try {
    const { title, category, location, priceRange, description } = await request.json()
    
    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    
    const venueType: 'restaurant' | 'hotel' | 'activity' = 
      category === 'food' ? 'restaurant' :
      category === 'hotel' ? 'hotel' : 'activity'
    
    const searchLocation = location || 'New York'
    
    // Build search queries based on venue type
    let searchQueries: string[] = []
    
    if (venueType === 'restaurant') {
      searchQueries = [
        `"${title}" ${searchLocation} price per person`,
        `"${title}" ${searchLocation} menu prices how much`,
        `"${title}" restaurant cost dinner`
      ]
    } else if (venueType === 'hotel') {
      searchQueries = [
        `"${title}" ${searchLocation} room rate per night`,
        `"${title}" hotel nightly rate price`,
        `"${title}" ${searchLocation} hotel cost`
      ]
    } else {
      searchQueries = [
        `"${title}" ${searchLocation} ticket price admission`,
        `"${title}" cost how much`
      ]
    }
    
    // Try each search query
    for (const query of searchQueries) {
      const searchResults = await searchPriceInfo(query)
      if (searchResults) {
        const extractedPrice = extractPriceFromText(searchResults, venueType)
        if (extractedPrice) {
          return NextResponse.json({
            estimatedCost: extractedPrice,
            confidence: 'high',
            source: 'web_search',
            explanation: `Found price from web search: ~$${extractedPrice}`
          } as PriceEstimate)
        }
      }
    }
    
    // Fallback to heuristics
    const fallback = getFallbackEstimate(category || 'other', title, priceRange)
    return NextResponse.json(fallback)
    
  } catch (error) {
    console.error('Price estimate error:', error)
    return NextResponse.json({
      estimatedCost: 50,
      confidence: 'low',
      source: 'error_fallback',
      explanation: 'Could not estimate price'
    } as PriceEstimate)
  }
}
