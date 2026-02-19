import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Link {
  id: string
  url: string
  title: string | null
  description: string | null
  category: string | null
  price_range: string | null
  rating: number | null
  is_confirmed: boolean
}

interface ItineraryItem {
  id: string
  date: string
  time: string
  timeSlot: 'morning' | 'afternoon' | 'evening' | 'night'
  type: 'flight' | 'hotel_checkin' | 'hotel_checkout' | 'meal' | 'activity' | 'other'
  title: string
  subtitle?: string
  link?: Link
  estimatedCost?: number
}

interface DayPlan {
  date: string
  dayNumber: number
  dayLabel: string
  items: ItineraryItem[]
}

// Detect hotel tier and return nightly rate estimate
function getHotelNightlyRate(title: string): number {
  const name = title.toLowerCase()
  
  // Luxury ($800-1200/night in NYC)
  const luxuryBrands = [
    'four seasons', 'fourseasons', 'ritz carlton', 'ritz-carlton', 'st. regis', 'st regis',
    'mandarin oriental', 'peninsula', 'waldorf astoria', 'waldorf', 'aman', 'rosewood',
    'park hyatt', 'baccarat', 'the mark', 'the carlyle', 'carlyle', 'the plaza', 'plaza hotel',
    'the pierre', 'pierre hotel', 'the langham', 'langham', 'the greenwich', 'equinox hotel',
    'one hotel', 'edition', 'the edition', 'nomad hotel', 'gramercy park hotel'
  ]
  if (luxuryBrands.some(brand => name.includes(brand))) return 950
  
  // Upscale ($400-600/night in NYC)
  const upscaleBrands = [
    'marriott', 'hilton', 'hyatt', 'westin', 'sheraton', 'w hotel', 'w new york',
    'conrad', 'intercontinental', 'kimpton', 'thompson', 'dream hotel', 'sixty hotels',
    'soho grand', 'tribeca grand', 'the standard', 'standard hotel', 'ace hotel',
    'the dominick', 'dominick', 'lotte', 'jw marriott', 'the whitby', 'the william',
    'the beekman', 'refinery hotel', 'gansevoort', 'the james', 'viceroy'
  ]
  if (upscaleBrands.some(brand => name.includes(brand))) return 450
  
  // Mid-range ($200-350/night in NYC)
  const midrangeBrands = [
    'holiday inn', 'courtyard', 'residence inn', 'hampton inn', 'hampton', 'doubletree',
    'crowne plaza', 'radisson', 'wyndham', 'best western', 'hyatt place', 'hyatt house',
    'even hotel', 'cambria', 'hotel indigo', 'aloft', 'element', 'fairfield',
    'springhill', 'towneplace', 'homewood suites', 'embassy suites'
  ]
  if (midrangeBrands.some(brand => name.includes(brand))) return 275
  
  // Budget ($120-200/night in NYC)
  const budgetBrands = [
    'pod', 'moxy', 'citizenm', 'citizen m', 'yotel', 'freehand', 'hi hostel',
    'hostelling', 'la quinta', 'red roof', 'motel 6', 'super 8', 'days inn',
    'microtel', 'travelodge', 'howard johnson', 'econo lodge', 'sleep inn',
    'arlo', 'made hotel', 'the jane'
  ]
  if (budgetBrands.some(brand => name.includes(brand))) return 175
  
  // Default: assume mid-upscale for unknown NYC hotels
  return 350
}

// Detect if a restaurant is fine dining (dinner-only)
function isFineDining(title: string, description?: string | null, priceRange?: string | null): boolean {
  const text = `${title} ${description || ''}`.toLowerCase()
  
  // Price indicator: $$$$ almost always means fine dining
  const dollarCount = (priceRange?.match(/\$/g) || []).length
  if (dollarCount >= 4) return true
  
  // Name/description indicators
  const fineDiningIndicators = [
    'michelin',
    'tasting menu',
    'omakase',
    'kaiseki',
    'fine dining',
    'chef\'s table',
    'james beard',
    'starred',
    'prix fixe',
    // Famous fine dining restaurants
    'peter luger',
    'le bernardin',
    'eleven madison',
    'per se',
    'masa',
    'atomix',
    'don angie',
    'carbone',
    'rao\'s',
    'okdongsik',
    'cho dang gol',
    'jungsik',
    'jeju noodle',
    'korean bbq',
    'steakhouse'
  ]
  
  return fineDiningIndicators.some(indicator => text.includes(indicator))
}

// Detect if a place is a breakfast/brunch spot
function isBreakfastSpot(title: string, description?: string | null): boolean {
  const text = `${title} ${description || ''}`.toLowerCase()
  
  const breakfastIndicators = [
    'breakfast',
    'brunch',
    'cafe',
    'café',
    'coffee',
    'bakery',
    'bagel',
    'pancake',
    'waffle',
    'diner',
    'morning',
    'egg'
  ]
  
  return breakfastIndicators.some(indicator => text.includes(indicator))
}

// Detect if a place is casual lunch-appropriate
function isCasualLunch(title: string, description?: string | null, priceRange?: string | null): boolean {
  const text = `${title} ${description || ''}`.toLowerCase()
  const dollarCount = (priceRange?.match(/\$/g) || []).length
  
  // $ or $$ usually casual
  if (dollarCount <= 2) return true
  
  const casualIndicators = [
    'deli',
    'sandwich',
    'pizza',
    'burger',
    'fast',
    'casual',
    'quick',
    'counter',
    'food hall',
    'market',
    'takeout',
    'to-go'
  ]
  
  return casualIndicators.some(indicator => text.includes(indicator))
}

// Estimate price for a venue
async function estimateCost(
  link: Link,
  location: string,
  baseUrl: string
): Promise<number> {
  // If we have a $ price range, use smart mapping
  if (link.price_range) {
    const dollarCount = (link.price_range.match(/\$/g) || []).length
    
    if (link.category === 'food') {
      // NYC restaurant pricing per person
      const costMap: Record<number, number> = { 1: 20, 2: 45, 3: 85, 4: 200 }
      return costMap[dollarCount] || 50
    }
  }
  
  // For items without price range, try the estimate API
  try {
    const response = await fetch(`${baseUrl}/api/estimate-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: link.title,
        category: link.category,
        location,
        priceRange: link.price_range,
        description: link.description
      })
    })
    
    if (response.ok) {
      const data = await response.json()
      return data.estimatedCost || 50
    }
  } catch {
    // Fall through to defaults
  }
  
  // Fallbacks by category
  if (link.category === 'hotel') return getHotelNightlyRate(link.title || '')
  if (link.category === 'food') return isFineDining(link.title || '', link.description, link.price_range) ? 175 : 55
  if (link.category === 'activity') return 40
  return 30
}

// Determine best time slot for a restaurant
function getBestMealSlot(
  link: Link,
  availableSlots: { slot: 'breakfast' | 'lunch' | 'dinner'; dayIndex: number }[]
): { slot: 'breakfast' | 'lunch' | 'dinner'; dayIndex: number } | null {
  if (availableSlots.length === 0) return null
  
  const title = link.title || ''
  const description = link.description || ''
  const priceRange = link.price_range
  
  // Fine dining → prefer dinner
  if (isFineDining(title, description, priceRange)) {
    const dinnerSlot = availableSlots.find(s => s.slot === 'dinner')
    if (dinnerSlot) return dinnerSlot
    // Fine dining at lunch is unusual but possible
    const lunchSlot = availableSlots.find(s => s.slot === 'lunch')
    if (lunchSlot) return lunchSlot
  }
  
  // Breakfast spots → breakfast
  if (isBreakfastSpot(title, description)) {
    const breakfastSlot = availableSlots.find(s => s.slot === 'breakfast')
    if (breakfastSlot) return breakfastSlot
  }
  
  // Casual places → prefer lunch
  if (isCasualLunch(title, description, priceRange)) {
    const lunchSlot = availableSlots.find(s => s.slot === 'lunch')
    if (lunchSlot) return lunchSlot
  }
  
  // Default: prefer dinner, then lunch, then breakfast
  const preferenceOrder: ('dinner' | 'lunch' | 'breakfast')[] = ['dinner', 'lunch', 'breakfast']
  for (const preferred of preferenceOrder) {
    const slot = availableSlots.find(s => s.slot === preferred)
    if (slot) return slot
  }
  
  return availableSlots[0]
}

// Generate itinerary from confirmed links
async function generateItinerary(
  links: Link[],
  startDate: string,
  endDate: string,
  destination: string,
  baseUrl: string
): Promise<{ days: DayPlan[]; totalCost: number; summary: string }> {
  const confirmedLinks = links.filter(l => l.is_confirmed)
  
  // Categorize links
  const hotels = confirmedLinks.filter(l => l.category === 'hotel')
  const meals = confirmedLinks.filter(l => l.category === 'food')
  const activities = confirmedLinks.filter(l => l.category === 'activity')
  const others = confirmedLinks.filter(l => !l.category || l.category === 'other')
  
  // Calculate trip duration
  const start = new Date(startDate)
  const end = new Date(endDate)
  const tripDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  const days: DayPlan[] = []
  let totalCost = 0
  
  // Track available meal slots
  const mealSlots: { slot: 'breakfast' | 'lunch' | 'dinner'; dayIndex: number; used: boolean }[] = []
  for (let i = 0; i < tripDays; i++) {
    mealSlots.push({ slot: 'breakfast', dayIndex: i, used: false })
    mealSlots.push({ slot: 'lunch', dayIndex: i, used: false })
    mealSlots.push({ slot: 'dinner', dayIndex: i, used: false })
  }
  
  // Create day plans
  for (let i = 0; i < tripDays; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    
    const dayPlan: DayPlan = {
      date: dateStr,
      dayNumber: i + 1,
      dayLabel: `Day ${i + 1} - ${dayLabel}`,
      items: [],
    }
    
    // First day: add hotel check-in
    if (i === 0 && hotels.length > 0) {
      const hotel = hotels[0]
      const cost = await estimateCost(hotel, destination, baseUrl) * tripDays
      totalCost += cost
      dayPlan.items.push({
        id: `${dateStr}-checkin`,
        date: dateStr,
        time: '3:00 PM',
        timeSlot: 'afternoon',
        type: 'hotel_checkin',
        title: `Check in at ${hotel.title || 'Hotel'}`,
        subtitle: `$${Math.round(cost / tripDays)}/night • ${tripDays} nights`,
        link: hotel,
        estimatedCost: cost,
      })
    }
    
    // Last day: add checkout
    if (i === tripDays - 1 && hotels.length > 0) {
      dayPlan.items.push({
        id: `${dateStr}-checkout`,
        date: dateStr,
        time: '11:00 AM',
        timeSlot: 'morning',
        type: 'hotel_checkout',
        title: `Check out from ${hotels[0].title || 'Hotel'}`,
        link: hotels[0],
      })
    }
    
    days.push(dayPlan)
  }
  
  // Assign meals to appropriate slots
  const mealTimes: Record<string, string> = {
    breakfast: '9:30 AM',
    lunch: '12:30 PM',
    dinner: '7:30 PM'
  }
  
  for (const meal of meals) {
    const availableSlots = mealSlots.filter(s => !s.used)
    const bestSlot = getBestMealSlot(meal, availableSlots)
    
    if (bestSlot) {
      bestSlot.used = true
      const dayIndex = bestSlot.dayIndex
      const date = days[dayIndex].date
      const cost = await estimateCost(meal, destination, baseUrl)
      totalCost += cost
      
      // Capitalize slot name for display
      const mealType = bestSlot.slot.charAt(0).toUpperCase() + bestSlot.slot.slice(1)
      
      days[dayIndex].items.push({
        id: `${date}-meal-${meal.id}`,
        date,
        time: mealTimes[bestSlot.slot],
        timeSlot: bestSlot.slot === 'breakfast' ? 'morning' : bestSlot.slot === 'lunch' ? 'afternoon' : 'evening',
        type: 'meal',
        title: `${mealType} at ${meal.title || 'Restaurant'}`,
        subtitle: cost > 0 ? `~$${cost}/person` : undefined,
        link: meal,
        estimatedCost: cost,
      })
    }
  }
  
  // Distribute activities across days
  let activityIndex = 0
  const activityTimes = ['10:30 AM', '2:30 PM', '4:00 PM']
  
  for (const activity of activities) {
    const dayIndex = activityIndex % tripDays
    const date = days[dayIndex].date
    const timeIndex = Math.floor(activityIndex / tripDays) % activityTimes.length
    const cost = await estimateCost(activity, destination, baseUrl)
    totalCost += cost
    
    days[dayIndex].items.push({
      id: `${date}-activity-${activity.id}`,
      date,
      time: activityTimes[timeIndex],
      timeSlot: timeIndex === 0 ? 'morning' : 'afternoon',
      type: 'activity',
      title: activity.title || 'Activity',
      subtitle: cost > 0 ? `~$${cost}` : undefined,
      link: activity,
      estimatedCost: cost,
    })
    
    activityIndex++
  }
  
  // Add other items
  let otherIndex = 0
  for (const other of others) {
    const dayIndex = otherIndex % tripDays
    const date = days[dayIndex].date
    const cost = await estimateCost(other, destination, baseUrl)
    totalCost += cost
    
    days[dayIndex].items.push({
      id: `${date}-other-${other.id}`,
      date,
      time: '2:00 PM',
      timeSlot: 'afternoon',
      type: 'other',
      title: other.title || 'Item',
      subtitle: cost > 0 ? `~$${cost}` : undefined,
      link: other,
      estimatedCost: cost,
    })
    
    otherIndex++
  }
  
  // Sort each day's items by time
  for (const day of days) {
    day.items.sort((a, b) => {
      const timeA = new Date(`2000-01-01 ${a.time}`).getTime()
      const timeB = new Date(`2000-01-01 ${b.time}`).getTime()
      return timeA - timeB
    })
  }
  
  // Generate summary
  const summary = `${tripDays}-day trip to ${destination} with ${hotels.length} stay${hotels.length !== 1 ? 's' : ''}, ${meals.length} meal${meals.length !== 1 ? 's' : ''}, and ${activities.length + others.length} activit${activities.length + others.length !== 1 ? 'ies' : 'y'}.`
  
  return { days, totalCost, summary }
}

export async function POST(request: NextRequest) {
  try {
    const { tripId } = await request.json()
    
    if (!tripId) {
      return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Fetch trip with confirmed links
    const { data: trip, error } = await supabase
      .from('trips')
      .select(`
        *,
        links (*)
      `)
      .eq('id', tripId)
      .single()
    
    if (error || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }
    
    // Get base URL for internal API calls
    const baseUrl = request.nextUrl.origin
    
    const itinerary = await generateItinerary(
      trip.links || [],
      trip.start_date,
      trip.end_date,
      trip.destination || 'your destination',
      baseUrl
    )
    
    return NextResponse.json(itinerary)
  } catch (error) {
    console.error('Generate itinerary error:', error)
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 })
  }
}
