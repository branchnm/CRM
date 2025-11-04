# Pre-Deployment Checklist

Use this checklist before pushing to GitHub and deploying your CRM.

## ✅ Local Setup Complete

- [x] React app running locally (`npm run dev`)
- [x] Supabase configured (info.ts has project ID)
- [x] Weather API working (VITE_OPENWEATHER_API_KEY in `.env.local`)
- [x] All features tested (drag-and-drop, time bars, job creation)

## 📋 Before Pushing to GitHub

### 1. Environment Variables Check
```bash
# Verify .env.local exists and has:
VITE_OPENWEATHER_API_KEY=your_api_key_here
```

**IMPORTANT**: `.env.local` should be in `.gitignore` (never commit API keys!)

### 2. Create `.env.example` Template
Create this file so you remember what env vars are needed:
```bash
# Copy your .env.local structure (without actual keys)
VITE_OPENWEATHER_API_KEY=
```

### 3. Verify Build Works Locally
```powershell
npm run build
```

Should complete without errors and create `dist/` folder.

### 4. Test Production Build Locally
```powershell
npm run preview
```

Navigate to the URL shown (usually http://localhost:4173) and test all features.

## 🚀 GitHub Setup

### 1. Create New Repository
1. Go to https://github.com/new
2. Name: `outside-ai-crm` (or your preferred name)
3. Description: "CRM for outdoor service businesses with weather-aware scheduling"
4. Visibility: Private (recommended) or Public
5. **DO NOT** initialize with README (you already have one)
6. Click "Create repository"

### 2. Push Your Code
```powershell
# Navigate to project directory
cd "c:\Users\branc\Desktop\CRM-backup"

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - CRM with weather-based scheduling"

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/outside-ai-crm.git

# Push
git branch -M main
git push -u origin main
```

## 🌐 Domain Purchase

### Recommended Registrars (from DEPLOYMENT_GUIDE.md)
1. **Cloudflare** - $8-15/year (best DNS, free SSL)
2. **Namecheap** - $8-13/year (popular, easy)
3. **Porkbun** - $7-11/year (cheapest, good UX)
4. **Google Domains** - $12/year (simple, reliable)

### Domain Naming Tips
- Keep it short and memorable
- Use .com if available (most trusted)
- Avoid hyphens and numbers
- Consider: `yourcompanyname-crm.com`, `yourservices.io`, etc.

## 📝 Info You'll Need

### For Hosting Platform (Vercel/Netlify)
- GitHub account credentials
- Repository name (from step above)
- Environment variables:
  - `VITE_OPENWEATHER_API_KEY` = (copy from .env.local)

### For Twilio Toll-Free Verification
- **Website URL**: https://yourdomain.com (after deployment)
- **Business Name**: Your business legal name
- **Business Address**: Full street address
- **Business Phone**: Your business phone number
- **Use Case**: "Customer relationship management system for outdoor lawn care and landscaping services. Used for scheduling, customer communications, and route optimization."
- **Messaging Volume**: "Estimated 50-200 SMS per month for appointment confirmations and weather alerts"

## ⏱️ Timeline

1. **Domain Purchase**: 5-10 minutes
2. **GitHub Setup**: 5 minutes
3. **Vercel Deployment**: 10 minutes
4. **DNS Configuration**: 5 minutes
5. **DNS Propagation**: 5-60 minutes (wait time)
6. **Twilio Verification Submit**: 10 minutes
7. **Twilio Approval**: 1-3 business days

**Total Active Time**: ~45 minutes  
**Total Wait Time**: ~1-3 days

## 🔍 Quick Verification Steps

After deployment, test these URLs:

```
✅ https://yourdomain.com - Homepage loads
✅ https://yourdomain.com/favicon.ico - Icon loads
✅ Browser console has no errors
✅ Supabase connection works (create test customer)
✅ Weather data loads (check forecast tab)
✅ HTTPS certificate shows (green padlock in browser)
```

## 🎯 Ready to Deploy?

Once you've:
- [x] Tested local build
- [x] Pushed to GitHub
- [x] Purchased domain
- [x] Have OpenWeather API key ready

→ **Follow DEPLOYMENT_GUIDE.md** for step-by-step deployment instructions!

---

## 📞 Twilio Toll-Free Verification Template

When submitting Twilio verification, use this template:

**Company/Organization Name**: [Your Business Name]

**Website**: https://[yourdomain.com]

**Business Type**: Lawn Care & Landscaping Services

**Use Case Description**:
```
We operate a lawn care and landscaping business serving residential and commercial 
customers. This CRM system is used internally to:

1. Schedule and track service appointments
2. Send appointment confirmations to customers via SMS
3. Notify customers of weather-related schedule changes
4. Provide service completion updates

Messages are transactional only (confirmations, reminders, updates) and sent to 
customers who have provided explicit consent as part of our service agreements.

Estimated monthly volume: 50-200 messages
All messages are one-to-one customer communications, not marketing.
```

**Sample Message Templates** (from your CRM):
```
1. "Hi [Name], your lawn service is scheduled for [Date] at [Time]. Reply STOP to opt out."
2. "Weather update: We've rescheduled your service to [New Date] due to rain. Reply STOP to opt out."
3. "Service complete! Your lawn has been mowed. Thank you for choosing [Business Name]. Reply STOP to opt out."
```

---

## ⚠️ Common Issues

### Build Fails
- Run `npm install` to ensure all dependencies installed
- Check `package.json` has all required packages
- Verify TypeScript has no errors: `npm run lint`

### Environment Variables Not Working
- Must start with `VITE_` prefix
- Set in hosting platform dashboard (not in code)
- Redeploy after adding env vars

### Domain Not Connecting
- DNS can take up to 60 minutes
- Use https://whatsmydns.net to check propagation
- Verify DNS records match hosting platform instructions

### Supabase Not Connecting
- Check `src/utils/supabase/info.ts` has correct project ID
- Verify Supabase project is active (not paused)
- Check browser console for CORS errors

---

**Next Step**: See **DEPLOYMENT_GUIDE.md** for detailed deployment instructions!
