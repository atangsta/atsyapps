import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface Link {
  id: string
  url: string
  title: string | null
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

// Convert price_range to estimated cost
function estimateCost(priceRange: string | null): number {
  if (!priceRange) return 0
  const dollarCount = (priceRange.match(/\$/g) || []).length
  // Rough estimates: $ = $15, $$ = $35, $$$ = $75, $$$$ = $150
  const costMap: Record<number, number> = { 1: 15, 2: 35, 3: 75, 4: 150 }
  return costMap[dollarCount] || 0
}

// Get typical time for activity type
function getTypicalTime(category: string | null, slot: 'morning' | 'afternoon' | 'evening'): string {
  const times: Record<string, Record<string, string>> = {
    food: { morning: '9:00 AM', afternoon: '12:30 PM', evening: '7:00 PM' },
    activity: { morning: '10:00 AM', afternoon: '2:00 PM', evening: '6:00 PM' },
    hotel: { morning: '11:00 AM', afternoon: '3:00 PM', evening: '3:00 PM' },
    other: { morning: '10:00 AM', afternoon: '2:00 PM', evening: '6:00 PM' },
  }
  return times[category || 'other']?.[slot] || '12:00 PM'
}

// Generate itinerary from confirmed links
function generateItinerary(
  links: Link[],
  startDate: string,
  endDate: string,
  destination: string
): { days: DayPlan[]; totalCost: number; summary: string } {
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
    
    // First day: add arrival/hotel check-in
    if (i === 0 && hotels.length > 0) {
      const hotel = hotels[0]
      const cost = estimateCost(hotel.price_range) * tripDays // Hotel cost for full stay
      totalCost += cost
      dayPlan.items.push({
        id: `${dateStr}-checkin`,
        date: dateStr,
        time: '3:00 PM',
        timeSlot: 'afternoon',
        type: 'hotel_checkin',
        title: `Check in at ${hotel.title || 'Hotel'}`,
        subtitle: hotel.price_range ? `${hotel.price_range} per night` : undefined,
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
  
  // Distribute meals across days
  const mealSlots: ('morning' | 'afternoon' | 'evening')[] = ['morning', 'afternoon', 'evening']
  let mealIndex = 0
  
  for (const meal of meals) {
    const dayIndex = mealIndex % tripDays
    const slotIndex = Math.floor(mealIndex / tripDays) % 3
    const slot = mealSlots[slotIndex]
    const date = days[dayIndex].date
    const cost = estimateCost(meal.price_range)
    totalCost += cost
    
    const mealType = slot === 'morning' ? 'Breakfast' : slot === 'afternoon' ? 'Lunch' : 'Dinner'
    
    days[dayIndex].items.push({
      id: `${date}-meal-${mealIndex}`,
      date,
      time: getTypicalTime('food', slot),
      timeSlot: slot,
      type: 'meal',
      title: `${mealType} at ${meal.title || 'Restaurant'}`,
      subtitle: meal.price_range || undefined,
      link: meal,
      estimatedCost: cost,
    })
    
    mealIndex++
  }
  
  // Distribute activities across days
  let activityIndex = 0
  for (const activity of activities) {
    const dayIndex = activityIndex % tripDays
    const date = days[dayIndex].date
    const slot = activityIndex % 2 === 0 ? 'morning' : 'afternoon'
    const cost = estimateCost(activity.price_range)
    totalCost += cost
    
    days[dayIndex].items.push({
      id: `${date}-activity-${activityIndex}`,
      date,
      time: getTypicalTime('activity', slot),
      timeSlot: slot,
      type: 'activity',
      title: activity.title || 'Activity',
      subtitle: activity.price_range || undefined,
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
    const cost = estimateCost(other.price_range)
    totalCost += cost
    
    days[dayIndex].items.push({
      id: `${date}-other-${otherIndex}`,
      date,
      time: '2:00 PM',
      timeSlot: 'afternoon',
      type: 'other',
      title: other.title || 'Activity',
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
    
    const itinerary = generateItinerary(
      trip.links || [],
      trip.start_date,
      trip.end_date,
      trip.destination || 'your destination'
    )
    
    return NextResponse.json(itinerary)
  } catch (error) {
    console.error('Generate itinerary error:', error)
    return NextResponse.json({ error: 'Failed to generate itinerary' }, { status: 500 })
  }
}
