# Supabase Setup for TaiNecklace

## Quick Setup (5 minutes)

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Choose organization and enter:
   - **Name**: `tainecklace` 
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to you
4. Click "Create new project" (takes ~2 minutes)

### 2. Get Your Credentials
1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy these two values:
   - **Project URL** (looks like: `https://abcdefgh.supabase.co`)
   - **anon public key** (long string starting with `eyJhbGc...`)

### 3. Update Your App
1. Open `src/services/supabaseClient.js`
2. Replace the placeholder values:

```javascript
const SUPABASE_URL = 'https://your-actual-project-url.supabase.co'
const SUPABASE_ANON_KEY = 'your-actual-anon-key-here'
```

### 4. Create Database Table
1. In Supabase dashboard, go to **SQL Editor**
2. Run this SQL:

```sql
-- Create transcriptions table
CREATE TABLE transcriptions (
  id BIGINT PRIMARY KEY,
  text TEXT NOT NULL,
  confidence REAL,
  timestamp TIMESTAMPTZ NOT NULL,
  duration REAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI summaries table
CREATE TABLE ai_summaries (
  id BIGINT PRIMARY KEY,
  summary TEXT NOT NULL,
  transcription_count INTEGER DEFAULT 0,
  summary_type TEXT DEFAULT 'conversation',
  transcription_ids JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS (Row Level Security) - optional but recommended
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (you can add auth later)
CREATE POLICY "Allow public access" ON transcriptions
  FOR ALL USING (true);
  
CREATE POLICY "Allow public access" ON ai_summaries
  FOR ALL USING (true);
```

3. Click "Run" to execute

## That's It! 🎉

Your app will now:
- ✅ Store first 50 transcriptions locally (fast access)
- ✅ Auto-sync to cloud when you hit 50+ transcriptions  
- ✅ Show storage status in the UI
- ✅ Work offline (queue syncs for later)

## Verify It's Working

1. Record some transcriptions
2. Check the UI for storage status:
   - `📱 X local` - shows local count
   - `☁️ cloud sync` - appears when Supabase connected
   - `🔄 auto-sync enabled` - appears at 50+ transcriptions

## Optional Enhancements

### Add Authentication (Later)
If you want user accounts and private data:
```javascript
// Enable auth in Supabase dashboard
// Update RLS policies to use auth.uid()
```

### Add Search (Later)
```sql
-- Add full-text search
ALTER TABLE transcriptions ADD COLUMN search_vector tsvector;
```

## Troubleshooting

### "Supabase not configured or offline"
- Check your URL and key in `supabaseClient.js`
- Verify internet connection
- Check Supabase dashboard is accessible

### No cloud sync showing
- App will show local-only mode until Supabase connects
- Check browser console for connection errors

### Want to reset?
```sql
-- Clear all transcriptions
DELETE FROM transcriptions;
```

---

💡 **Pro tip**: The app works great locally-only too! Supabase just adds backup and sync across devices.