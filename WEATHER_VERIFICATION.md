# Weather Implementation Verification Guide

## Overview
Your CRM app uses the **OpenWeather API** (free tier) to fetch weather data. This guide explains exactly how the weather system works, what to verify, and how to troubleshoot.

---

## 🔍 How Weather Data is Fetched

### 1. **Location Selection**
The app determines the weather location using this priority:
1. **Primary source**: First customer address with an upcoming job (next 7 days)
2. **Fallback**: Stored location from localStorage
3. **Manual**: User-entered address via the search box

**File**: `WeatherForecast.tsx` lines 628-673
```typescript
// Finds jobs scheduled for next 7 days
// Gets the first customer with a job
// Uses their address for weather location
```

### 2. **API Calls Made**
When fetching weather, the app makes 2 API calls:

**Call 1 - Current Weather:**
```
https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=imperial&appid={key}
```

**Call 2 - 5-Day Forecast:**
```
https://api.openweathermap.org/data/2.5/forecast?lat={lat}&lon={lon}&units=imperial&appid={key}
```

**File**: `src/services/weather.ts` lines 300-315

### 3. **Data Processing**
**File**: `src/services/weather.ts` lines 317-388

The forecast data comes in **3-hour intervals** (8 entries per day). The app:
- Groups forecasts by day
- Calculates daily min/max temps from all 3-hour intervals
- Determines rain chance from highest probability in the day
- Sums rain amounts across all intervals (shows total mm for the day)
- Keeps up to 4 hourly forecasts per day for detailed view

---

## ✅ Verification Checklist

### **Step 1: Test with the Verification Tool**
1. Open `test-weather.html` (should have opened in your browser)
2. Enter your OpenWeather API key
3. Enter a location (e.g., "Birmingham, Alabama")
4. Click "Test Weather Data"

**What to Check:**
- ✅ API key is accepted (no 401 error)
- ✅ Location coordinates are correct (verify on Google Maps)
- ✅ Current weather timestamp is recent (within last hour)
- ✅ Temperatures are in Fahrenheit
- ✅ Forecast times match your local timezone
- ✅ Rain amounts are showing (if any precipitation expected)

### **Step 2: Verify in Your App**
1. Run your CRM app: `npm run dev`
2. Navigate to Weather Forecast tab
3. Set an address (or let it use a customer address)

**What to Check:**
- ✅ Location shown at top matches your area
- ✅ Current temp matches reality (check weather.com or similar)
- ✅ Next 5 days show correct dates
- ✅ Rain percentages are reasonable
- ✅ Weather icons match descriptions

### **Step 3: Verify Time Accuracy**
The OpenWeather API returns times in **UTC (Unix timestamps)**. Your app converts these to local time.

**In the code:**
```typescript
// Converts UTC timestamp to local time
const date = new Date(forecast.dt * 1000);
const hour24 = forecastDate.getHours(); // Local hour (0-23)
```

**File**: `src/services/weather.ts` line 350

**To verify:**
- Check that forecast times in the app match your local timezone
- The `hour24` field should be 0-23 in YOUR timezone (not UTC)

### **Step 4: Verify Location Accuracy**

**Check in Console (Browser DevTools):**
```javascript
// Should see logs like:
"Loading weather for customer location: 123 Main St, Birmingham, AL"
"GPS Location acquired: {lat: 33.5186, lon: -86.8104}"
```

**Files to check:**
- `WeatherForecast.tsx` line 629: "Loading weather for customer location"
- `WeatherForecast.tsx` line 270: "GPS Location acquired"

---

## 🌡️ Data Accuracy Details

### **Temperature**
- **Units**: Fahrenheit (hardcoded in API calls)
- **Rounding**: `Math.round()` for display
- **Source**: `main.temp` from API response

### **Rain Data**
- **3-hour amounts**: `rain['3h']` in millimeters
- **Daily totals**: Sum of all 3-hour periods
- **Chance %**: `pop` field × 100 (Probability of Precipitation)

**Example:**
```json
{
  "rain": { "3h": 2.5 },  // 2.5mm in next 3 hours
  "pop": 0.75              // 75% chance
}
```

### **Time Zones**
- **API returns**: UTC timestamps (`dt` field)
- **App displays**: Your local timezone
- **Conversion**: `new Date(dt * 1000)` automatically converts to local

### **Forecast Range**
- **Hourly**: Next 24 hours (8 entries × 3-hour intervals)
- **Daily**: Next 5 days
- **Update frequency**: OpenWeather updates every ~10 minutes

---

## 🐛 Common Issues & Fixes

### **Issue 1: "API key not activated yet"**
**Symptom**: 401 error or "API key not activated" message
**Cause**: New API keys take up to 2 hours to activate
**Fix**: Wait or check your API key at https://home.openweathermap.org/api_keys

### **Issue 2: Wrong location showing**
**Symptom**: Weather for different city
**Cause**: App uses first customer address with upcoming job
**Fix**: 
- Manually set location using the search box
- Or verify customer addresses are correct

**File**: `WeatherForecast.tsx` line 628

### **Issue 3: Times are off by several hours**
**Symptom**: Forecast shows "3 AM" but it's actually 10 AM
**Cause**: Rare - would indicate timezone conversion bug
**Fix**: Check browser timezone settings
**Verify**: `new Date().toString()` in console should show correct local time

### **Issue 4: No rain data showing**
**Symptom**: Rain amounts always 0 even when rain expected
**Cause**: API only includes `rain` field when precipitation exists
**Fix**: This is normal - check rain chance % instead

**File**: `src/services/weather.ts` line 348
```typescript
rainAmount: forecast.rain?.['3h'] || 0  // Defaults to 0 if no rain
```

### **Issue 5: Location not found**
**Symptom**: "Location not found" error when entering address
**Cause**: Geocoding couldn't find the address
**Fix**: 
- Use city name instead of full address
- Try "Birmingham, AL" instead of full street address
- Verify address spelling

---

## 🔧 Debugging Commands

### **Check current API key:**
```javascript
// In browser console (while app is running)
import.meta.env.VITE_OPENWEATHER_API_KEY
```

### **Check stored location:**
```javascript
// In browser console
JSON.parse(localStorage.getItem('weatherLocation'))
localStorage.getItem('weatherLocationName')
```

### **Test API directly:**
```bash
# Replace {YOUR_KEY} and coordinates
curl "https://api.openweathermap.org/data/2.5/weather?lat=33.5186&lon=-86.8104&units=imperial&appid={YOUR_KEY}"
```

### **Check forecast data structure:**
Open browser DevTools → Network tab → filter for "openweathermap" → click response → view JSON

---

## 📊 Expected Data Flow

```
User enters address
       ↓
Geocoding API → Get coordinates (lat, lon)
       ↓
Current Weather API → Get current conditions
       ↓
Forecast API → Get 3-hour forecasts (40 entries)
       ↓
Group by day → Calculate daily summaries
       ↓
Display in UI (5 days, with hourly details)
```

---

## 🎯 Quick Verification Steps

1. **Open test page**: `test-weather.html`
2. **Enter API key** and location
3. **Verify**:
   - ✅ Location coordinates match Google Maps
   - ✅ Current temp matches real weather
   - ✅ Times are in your timezone
   - ✅ Rain data shows (if applicable)
   - ✅ 5-day forecast dates are correct

4. **In your app**:
   - ✅ Weather loads when you navigate to tab
   - ✅ Location matches your service area
   - ✅ Data updates when you change location
   - ✅ Jobs can be scheduled on forecast days

---

## 📝 API Usage Notes

**Free Tier Limits:**
- 1,000 API calls per day
- 60 calls per minute
- Updates every ~10 minutes

**App makes 2 calls per location load:**
- 1 × Current weather
- 1 × 5-day forecast
- = ~500 location loads per day max

**To reduce API calls:**
- Weather data is cached in component state
- Only reloads when location changes
- No automatic refresh polling

---

## 🔑 Environment Setup

**Required file**: `.env.local` (in project root)
```env
VITE_OPENWEATHER_API_KEY=your_api_key_here
```

**Get API key**: https://openweathermap.org/api
- Sign up (free)
- Navigate to API keys
- Generate new key
- Wait up to 2 hours for activation

---

## Summary

Your weather system:
- ✅ Uses OpenWeather free tier (correct)
- ✅ Fetches data in Fahrenheit
- ✅ Converts UTC times to local timezone
- ✅ Groups 3-hour forecasts into daily summaries
- ✅ Shows rain amounts and probabilities
- ✅ Automatically uses customer addresses for location

**To verify everything is working:**
1. Use `test-weather.html` to verify API is working
2. Check location coordinates are correct
3. Verify times match your timezone
4. Confirm temperatures match reality
5. Test in your app with real customer addresses
