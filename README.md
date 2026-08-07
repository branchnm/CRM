# JobFlow CRM

JobFlow CRM is a weather-aware scheduling and customer management app for lawn care and outdoor service businesses. It combines route planning, job scheduling, customer communication, and multi-tenant Supabase data storage in a single workflow.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS 4
- Supabase for auth, Postgres, RLS, and Edge Functions
- shadcn/ui components
- PWA support

## Local Development

```powershell
npm install
npm run dev
```

Production verification:

```powershell
npm run build
npm run lint
```

## Environment

Create `.env.local` in the project root:

```env
VITE_DEMO_MODE=true
VITE_OPENWEATHER_API_KEY=your_key
VITE_GOOGLE_MAPS_API_KEY=your_key
```

## Core Product Areas

- Weather-aware scheduling with drag-and-drop rescheduling
- Route optimization backed by drive-time estimates
- Customer communications for schedule changes and updates
- Multi-tenant data isolation through `user_id` and Supabase RLS
- Demo mode for product walkthroughs without login

## Recent Major Changes

- WeatherForecast scheduling capacity now uses a shared minute-based helper across forecast, calendar, and day planning surfaces.
- Job sizing now includes inbound drive time plus work time, with drive time rounded up to 5-minute increments for more realistic slot usage.
- Forecast job cards and drag previews now reflect the same estimated total minutes used for actual slot placement.
- Route and schedule surfaces emphasize total estimated minutes instead of only raw service duration.
- Capacity decisions are time-based, not fixed by job count, which improves rainy-day rescheduling and overflow suggestions.

## Project Structure

- `src/components/` UI and workflow surfaces such as Daily Schedule, Weather Forecast, and customer management
- `src/services/` Supabase, weather, SMS, maps, and route optimization integrations
- `src/utils/` shared scheduling and capacity helpers
- `public/` landing page and legal pages
- `supabase/` functions and migrations

## Notes For GitHub

If you are preparing a release summary or commit description, the main scheduling update in this branch is:

> Schedule block size now reflects rounded travel time plus service time, so route-aware capacity matches what crews can actually complete in a day.
