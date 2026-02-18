import { NextRequest, NextResponse } from 'next/server'

interface WeatherData {
  temp_f: number
  temp_c: number
  condition: string
  icon: string
  humidity: number
  feels_like_f: number
}

function getWeatherIcon(condition: string): string {
  const c = condition.toLowerCase()
  if (c.includes('sun') || c.includes('clear')) return '☀️'
  if (c.includes('cloud') || c.includes('overcast')) return '☁️'
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️'
  if (c.includes('snow')) return '❄️'
  if (c.includes('thunder') || c.includes('storm')) return '⛈️'
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return '🌫️'
  if (c.includes('wind')) return '💨'
  return '🌤️'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const location = searchParams.get('location')
  
  if (!location) {
    return NextResponse.json({ error: 'Location is required' }, { status: 400 })
  }
  
  try {
    const encodedLocation = encodeURIComponent(location)
    const response = await fetch(`https://wttr.in/${encodedLocation}?format=j1`, {
      headers: {
        'User-Agent': 'Roamly/1.0',
      },
    })
    
    if (!response.ok) {
      throw new Error('Weather API error')
    }
    
    const data = await response.json()
    const current = data.current_condition?.[0]
    
    if (!current) {
      throw new Error('No weather data')
    }
    
    const condition = current.weatherDesc?.[0]?.value || 'Unknown'
    
    const weather: WeatherData = {
      temp_f: parseInt(current.temp_F, 10),
      temp_c: parseInt(current.temp_C, 10),
      condition,
      icon: getWeatherIcon(condition),
      humidity: parseInt(current.humidity, 10),
      feels_like_f: parseInt(current.FeelsLikeF, 10),
    }
    
    return NextResponse.json(weather)
  } catch (error) {
    console.error('Weather fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch weather' },
      { status: 500 }
    )
  }
}
