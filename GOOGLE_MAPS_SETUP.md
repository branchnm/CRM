# Google Maps Distance Matrix API Setup

## Overview
The app now uses Google Maps Distance Matrix API to calculate accurate drive times between customer addresses, with an intelligent fallback estimation when the API is unavailable.

## Setup Instructions

### 1. Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Distance Matrix API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Distance Matrix API"
   - Click "Enable"
4. Create an API key:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy your new API key

### 2. Configure the API Key

1. Open the `.env.local` file in the `frontend` folder
2. Replace `your_api_key_here` with your actual API key:

```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyA...your_actual_key_here
```

3. Restart your development server:
```bash
npm run dev
```

### 3. Secure Your API Key (Recommended)

1. In Google Cloud Console, go to your API key settings
2. Add "Application restrictions":
   - For development: Choose "HTTP referrers"
   - Add: `http://localhost:*` and `http://127.0.0.1:*`
   - For production: Add your deployed domain
3. Add "API restrictions":
   - Select "Restrict key"
   - Check only "Distance Matrix API"

### 4. Set Up Billing (Required)

⚠️ **Important**: Google Maps APIs require a billing account, but you get **$200 free credit per month**.

- Distance Matrix API costs: $0.005-0.010 per element
- With $200/month free credit, you get approximately 20,000-40,000 API calls free
- For a small lawn care business, this is usually more than enough

1. Go to "Billing" in Google Cloud Console
2. Link a payment method
3. The free tier covers most small business usage

## How It Works

### Automatic Background Fetching
- When jobs load, the app automatically fetches real drive times from Google Maps
- Drive times are cached to avoid redundant API calls
- The UI updates automatically when real times are available

### Intelligent Fallback
- If API key is not configured, the app uses improved estimation
- If API fails (network issues, rate limits), fallback estimation is used
- You can use the app immediately while real times load in background

### Features
- ✅ Real-time traffic-aware drive times
- ✅ Accurate distance and duration
- ✅ Caching to minimize API calls
- ✅ Automatic fallback estimation
- ✅ Works offline with estimation

## Monitoring Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" > "Dashboard"
3. Click on "Distance Matrix API" to see usage statistics

## Troubleshooting

### "Google Maps API key not configured" in console
- Make sure `.env.local` file exists in the `frontend` folder
- Verify the API key starts with `VITE_` prefix
- Restart the dev server after changing `.env.local`

### API calls failing
- Check that Distance Matrix API is enabled in Google Cloud Console
- Verify billing is set up
- Check API key restrictions aren't too strict
- Look for error messages in browser console

### Still seeing estimated times
- Real times load in background, may take a few seconds
- Check browser console for any errors
- Verify internet connection
- Make sure API key is valid

## Cost Optimization Tips

1. **Caching**: The app caches all drive times to avoid repeat calls
2. **Batch Loading**: Drive times are fetched when jobs load, not on every render
3. **Selective Use**: Only calculates times for today's route
4. **Route Optimization**: Optimize route to minimize total API calls

## Alternative: Use Estimation Only

If you prefer not to use Google Maps API, simply don't configure the API key. The app will work perfectly with the improved estimation algorithm.
