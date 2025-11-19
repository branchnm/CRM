# Offline Mode Guide

## What is Offline Mode?

Offline mode allows the app to work with mock data stored in your browser's localStorage when Supabase is unavailable (due to SSL errors, network issues, or service outages).

## Quick Start

### Enable Offline Mode

1. Open `.env.local` in your project root
2. Set `VITE_OFFLINE_MODE=true`
3. Restart your dev server (`npm run dev`)

```env
# In .env.local
VITE_OFFLINE_MODE=true
```

### Disable Offline Mode

When Supabase is back online:

1. Set `VITE_OFFLINE_MODE=false` in `.env.local`
2. Restart your dev server

## How It Works

### Data Storage
- **Online Mode** (default): All data stored in Supabase database
- **Offline Mode**: All data stored in browser's localStorage
  - Customers → `offline_customers`
  - Jobs → `offline_jobs`
  - Groups → `offline_groups`

### Sample Data
When you first enable offline mode, the app automatically creates sample customers:
- John Smith (123 Main St, Homewood, AL) - scheduled for today
- Jane Doe (456 Oak Ave, Homewood, AL) - scheduled for today  
- Bob Johnson (789 Pine Dr, Homewood, AL) - scheduled for tomorrow

### What Works in Offline Mode
✅ Add/edit/delete customers
✅ Create/update/delete jobs
✅ Create/manage customer groups
✅ Drag-and-drop job scheduling
✅ Route optimization (uses cached data)
✅ All UI functionality

### What Doesn't Work in Offline Mode
❌ Weather data (requires OpenWeather API)
❌ Google Maps distance calculations
❌ SMS sending
❌ Multi-user data isolation (everyone shares same localStorage)
❌ Data sync between devices

## Clearing Offline Data

To start fresh with sample data:

1. Open browser DevTools (F12)
2. Go to **Application** → **Local Storage** → `http://localhost:5173` (or your dev server URL)
3. Delete keys: `offline_customers`, `offline_jobs`, `offline_groups`
4. Refresh the page

Or programmatically:
```javascript
// In browser console
localStorage.removeItem('offline_customers');
localStorage.removeItem('offline_jobs');
localStorage.removeItem('offline_groups');
location.reload();
```

## Switching Between Modes

### From Online to Offline
1. Set `VITE_OFFLINE_MODE=true`
2. Restart dev server
3. **Your Supabase data is NOT copied** - you start with sample data

### From Offline to Online
1. Set `VITE_OFFLINE_MODE=false`
2. Restart dev server
3. **Your offline data is NOT synced** - you're back to Supabase data

**Warning:** Offline and online data are completely separate. Changes made offline are NOT synced to Supabase.

## Use Cases

### Development Without Internet
Work on UI features and route optimization logic without needing Supabase connection.

### Supabase Outage
Continue testing your sync functionality (forecast ↔ route sections) even when Supabase is down.

### Demo/Presentation
Show the app to clients without worrying about network issues.

## Troubleshooting

### "No customers found"
- Check `.env.local` has `VITE_OFFLINE_MODE=true`
- Clear browser cache and reload
- Check browser console for `📴 OFFLINE MODE` messages

### Data Not Persisting
- localStorage might be full (5-10MB limit)
- Browser might be in private/incognito mode with localStorage disabled
- Check DevTools → Application → Local Storage to verify data is there

### Offline Mode Not Activating
1. Verify `.env.local` exists in project root (not `src/`)
2. Restart dev server after changing `.env.local`
3. Check browser console for `📴 OFFLINE MODE: Fetching...` messages
4. Make sure variable name is exactly `VITE_OFFLINE_MODE` (must start with `VITE_`)

## Implementation Details

### Service Files Modified
- `src/services/customers.ts` - Checks `isOfflineMode()` before Supabase calls
- `src/services/jobs.ts` - Falls back to localStorage operations
- `src/services/groups.ts` - Uses offline storage when enabled

### Offline Storage Service
- **File:** `src/services/offlineStorage.ts`
- **Functions:**
  - `isOfflineMode()` - Checks if `VITE_OFFLINE_MODE=true`
  - `getOfflineCustomers/Jobs/Groups()` - Fetch from localStorage
  - `saveOffline...()` - Upsert to localStorage
  - `deleteOffline...()` - Remove from localStorage
  - `clearOfflineData()` - Wipe all offline data

### Console Logging
Look for `📴 OFFLINE MODE:` prefix in browser console to confirm offline mode is active.

## Differences from Demo Mode

| Feature | Demo Mode | Offline Mode |
|---------|-----------|--------------|
| Authentication | Skipped (uses demo user) | Same as demo mode |
| Data Source | Supabase | localStorage |
| Multi-User | Shared demo user in DB | All users share localStorage |
| Requires Network | Yes (for Supabase) | No |
| Enable Via | `VITE_DEMO_MODE=true` | `VITE_OFFLINE_MODE=true` |

**Both can be enabled together:**
```env
VITE_DEMO_MODE=true      # Skip authentication
VITE_OFFLINE_MODE=true   # Use localStorage instead of Supabase
```
