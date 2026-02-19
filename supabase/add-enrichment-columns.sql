-- Add enrichment columns to links table for smarter scheduling
ALTER TABLE links ADD COLUMN IF NOT EXISTS venue_type TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS meal_times TEXT[]; -- Array: ['lunch', 'dinner']
ALTER TABLE links ADD COLUMN IF NOT EXISTS estimated_price_per_person INTEGER;
ALTER TABLE links ADD COLUMN IF NOT EXISTS cuisine_type TEXT;

-- Comments for documentation
COMMENT ON COLUMN links.venue_type IS 'fine_dining, casual, fast_casual, cafe, bar, etc.';
COMMENT ON COLUMN links.meal_times IS 'Array of meal times: breakfast, brunch, lunch, dinner';
COMMENT ON COLUMN links.estimated_price_per_person IS 'Estimated cost per person in USD';
COMMENT ON COLUMN links.cuisine_type IS 'Cuisine type: Korean, Italian, Japanese, etc.';
