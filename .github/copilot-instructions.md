# Copilot Instructions for Job Flow 

## Project Overview
React + TypeScript (Vite) frontend with Supabase backend. CRM for outdoor service businesses with weather-aware scheduling, route optimization, and automated customer communications.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS 4, Supabase (Postgres + Edge Functions), Vite with Rolldown, shadcn/ui components

## Architecture & Key Patterns

### State Management Pattern
- **Customer/Job data:** Managed via Supabase in `src/services/{customers,jobs}.ts`
- **Refresh pattern:** Components call `onRefreshCustomers()` and `onRefreshJobs()` after mutations to sync with DB
- **Race condition handling:** Use `creatingJobsRef` (see `DailySchedule.tsx` line 48) to prevent duplicate job creation during auto-scheduling
- **Local state:** Message templates and equipment stored in `localStorage` (not in DB yet)

### Data Flow for Job Scheduling
1. **Auto-job creation:** `DailySchedule.tsx` auto-creates jobs for customers with `nextCutDate === today` (lines 87-126)
2. **Order tracking:** Jobs have an `order` field (1-indexed) that persists across drag-and-drop reordering
3. **Database sync:** ALL job updates MUST call `updateJob()` from `services/jobs.ts` - the `order` field is CRITICAL and must be included in updates (see comments in `jobs.ts` lines 144, 168)

### Route Optimization Pattern
- **Entry point:** `DailySchedule.tsx` "Optimize Route" button → calls `optimizeRouteWithGoogleMaps()` from `services/routeOptimizer.ts`
- **Batch API calls:** Uses `getBatchDriveTimes()` to fetch all drive times in parallel (batched into groups of 25)
- **Algorithm:** Greedy nearest-neighbor with 2-opt improvement, prioritizes time but considers distance for close alternatives
- **Caching:** Drive times cached in component state to avoid redundant API calls
- **Order persistence:** Updates job `order` field (1, 2, 3...) and persists to DB via `updateJob()`

### Weather-Driven Scheduling
- **Component:** `WeatherForecast.tsx` - drag-and-drop jobs across 5-day forecast grid
- **Time slots:** Each day divided into 12 hourly slots (6am-6pm), tracked via `jobTimeSlots` Map
- **Persistence:** Uses callback `onRescheduleJob(jobId, newDate, timeSlot)` to update parent state
- **Weather API:** OpenWeather API via `services/weather.ts` - requires `VITE_OPENWEATHER_API_KEY` in `.env.local`

### Service Layer Pattern
All external integrations abstracted in `src/services/`:
- **Supabase client:** `lib/supabase.ts` - uses `projectId` and `publicAnonKey` from `utils/supabase/info.ts` (auto-generated, don't edit)
- **SMS:** `services/sms.ts` - falls back to MockSMS in dev, uses Supabase Edge Function in prod
- **Google Maps:** `services/googleMaps.ts` - calls `supabase/functions/get-drive-time` Edge Function (which uses `GOOGLE_MAPS_API_KEY` server secret) - **Note:** This function needs to be created/deployed separately
- **Weather:** `services/weather.ts` - direct OpenWeather API calls from frontend

## Developer Workflows

### Frontend Commands (run in project root)
```powershell
npm run dev     # Start Vite dev server (uses Rolldown for faster builds)
npm run build   # TypeScript compile + production build
npm run lint    # ESLint with React Compiler support
```

### Environment Variables
Create `.env.local` in project root (never commit):
```env
VITE_OPENWEATHER_API_KEY=your_key_here          # For weather.ts
VITE_GOOGLE_MAPS_API_KEY=your_key_here          # Optional: frontend can call Google Maps directly (deprecated, use Edge Function)
```

### Supabase Commands
```powershell
supabase functions deploy send-sms --project-ref oqzhxfggzveuhaldjuay
supabase functions deploy get-drive-time --project-ref oqzhxfggzveuhaldjuay  # Need to create this function first
supabase secrets set GOOGLE_MAPS_API_KEY=your_key
supabase secrets set TWILIO_ACCOUNT_SID=your_sid TWILIO_AUTH_TOKEN=your_token TWILIO_FROM_NUMBER=+1234567890
supabase db push   # Apply migrations from supabase/migrations/
```

### Database Schema
- **customers:** `src/db/schema.sql` - includes `next_cut_date` (YYYY-MM-DD) for auto-scheduling
- **jobs:** `src/db/create_jobs_table.sql` - includes `order` field for drag-and-drop sequence
- **Migrations:** SQL files in `src/db/` are reference schemas - actual DB managed via Supabase dashboard/migrations

## Critical Implementation Details

### Job Order Field
**NEVER** update jobs without including the `order` field - it's how drag-and-drop sequence persists. See `services/jobs.ts`:
```typescript
// ✅ CORRECT - includes order field
const db = { ...otherFields, order: job.order || null };
```

### SMS Provider Fallback Chain
1. Development: `MockSMS` (console.log only)
2. Production: `SupabaseSMS` → calls `supabase/functions/send-sms` Edge Function
3. Alternative: Direct Twilio (if `VITE_TWILIO_*` env vars set)

### Google Maps Drive Time
- **Frontend calls:** `services/googleMaps.ts` → Supabase Edge Function → Google Distance Matrix API
- **Why Edge Function?** Keeps `GOOGLE_MAPS_API_KEY` secret, enables rate limiting/caching server-side
- **Fallback:** If API key missing, uses distance-based estimation (see `routeOptimization.ts`)

### React Compiler
Enabled via `babel-plugin-react-compiler` in `vite.config.ts` - automatically memoizes components. Avoid manual `useMemo`/`useCallback` unless profiling shows benefit.

## Common Gotchas

1. **Job auto-creation races:** When adding customers with `nextCutDate`, jobs auto-create on mount. Use `creatingJobsRef` pattern to prevent duplicates
2. **Order field required:** ALL job updates must include `order` - it's not auto-populated
3. **Date format:** Use `'en-CA'` locale for YYYY-MM-DD (e.g., `new Date().toLocaleDateString('en-CA')`)
4. **Supabase info.ts:** Auto-generated file - if you need to change project, regenerate via `supabase init`
5. **Vite env vars:** Must start with `VITE_` to be exposed to frontend

## Integration Setup Docs
- Weather API: `WEATHER_SETUP.md` (if exists)
- Google Maps: `GOOGLE_MAPS_SETUP.md`
- SMS/Twilio: `SUPABASE_SMS_SETUP.md`
- Route Optimization: `ROUTE_OPTIMIZATION_TESTING.md`

## UI Conventions
- Use `components/ui/*` primitives (shadcn/ui) - don't install new UI libraries
- Tailwind 4 syntax (linear gradients use `bg-linear-to-br`, etc.)
- Icons from `lucide-react`
- Toasts via `sonner` library (import `toast` from `'sonner'`)

## Examples

### Add a new service
```typescript
// src/services/myservice.ts
import { supabase } from '../lib/supabase';

export async function fetchData() {
  const { data, error } = await supabase.from('table').select();
  if (error) throw new Error(`Failed: ${error.message}`);
  return data;
}
```

### Add a new Edge Function
```bash
# Create function
mkdir supabase/functions/my-function
# Add index.ts with Deno.serve() handler
# Deploy
supabase functions deploy my-function --project-ref oqzhxfggzveuhaldjuay
```

### Update job order after drag-and-drop
```typescript
const updatedJob = { ...job, order: newOrder };
await updateJob(updatedJob);  // MUST include order field
await onRefreshJobs();  // Sync with DB
```
