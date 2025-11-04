# CRM Deployment Guide

This guide will help you deploy your Job Flow to a real domain for Twilio verification and production use.

## Prerequisites

- Domain name (purchase from Namecheap, Google Domains, Cloudflare, etc.)
- GitHub account (for easy deployment)
- Your Supabase project is already set up ✅

## Recommended Hosting Option: Vercel (Easiest & Free)

Vercel is perfect for React/Vite apps and offers:
- ✅ Free hosting with custom domains
- ✅ Automatic HTTPS
- ✅ Zero configuration needed
- ✅ Auto-deploys from GitHub
- ✅ Global CDN

### Step 1: Prepare Your Project

1. **Create a `.gitignore` file** (if not already present):
```
node_modules/
dist/
.env.local
.DS_Store
*.log
```

2. **Push to GitHub:**
```powershell
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - CRM app"

# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Vercel

1. **Sign up at [vercel.com](https://vercel.com)** using your GitHub account

2. **Import your repository:**
   - Click "Add New..." → "Project"
   - Select your CRM repository
   - Vercel will auto-detect Vite configuration

3. **Configure Build Settings:**
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

4. **Add Environment Variables:**
   Click "Environment Variables" and add:
   ```
   VITE_OPENWEATHER_API_KEY=your_openweather_key
   ```
   
   **Note:** Your Supabase keys are already in `src/utils/supabase/info.ts`, so they'll be included in the build. If you want to use environment variables instead:
   ```
   VITE_SUPABASE_URL=https://oqzhxfggzveuhaldjuay.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

5. **Deploy:**
   - Click "Deploy"
   - Wait 2-3 minutes for the build
   - You'll get a URL like: `your-app.vercel.app`

### Step 3: Add Your Custom Domain

1. **In Vercel Dashboard:**
   - Go to your project → "Settings" → "Domains"
   - Click "Add Domain"
   - Enter your domain (e.g., `outsideai-crm.com`)

2. **Configure DNS (at your domain registrar):**
   
   **Option A - Using A Record (recommended):**
   ```
   Type: A
   Name: @ (or leave blank for root domain)
   Value: 76.76.21.21
   ```

   **Option B - Using CNAME (for subdomain like www):**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   ```

3. **Wait for DNS propagation** (5-60 minutes)
4. **Vercel automatically provisions SSL certificate** ✅

---

## Alternative Option: Netlify

Similar to Vercel, also free and easy:

1. **Sign up at [netlify.com](https://netlify.com)**
2. **Deploy from GitHub:**
   - Click "Add new site" → "Import an existing project"
   - Connect to GitHub and select your repo
   
3. **Build Settings:**
   ```
   Build command: npm run build
   Publish directory: dist
   ```

4. **Environment Variables:**
   - Settings → Environment → Environment variables
   - Add `VITE_OPENWEATHER_API_KEY`

5. **Custom Domain:**
   - Domain management → Add custom domain
   - Follow DNS configuration instructions

---

## Alternative Option: Cloudflare Pages (Best Performance)

Cloudflare offers the fastest CDN globally:

1. **Sign up at [pages.cloudflare.com](https://pages.cloudflare.com)**
2. **Connect GitHub repository**
3. **Build Settings:**
   ```
   Framework preset: Vite
   Build command: npm run build
   Build output directory: dist
   ```

4. **Environment Variables:**
   - Add `VITE_OPENWEATHER_API_KEY`

5. **Custom Domain:**
   - If you buy your domain through Cloudflare, it's automatic
   - Otherwise, change your domain's nameservers to Cloudflare

---

## For Twilio Toll-Free Verification

Once deployed, you'll need:

1. **Your Website URL:**
   - Example: `https://outsideai-crm.com`
   - Or: `https://your-app.vercel.app`

2. **Business Information for Twilio:**
   - Business name: "Job Flow" (or your business name)
   - Website: Your deployed URL
   - Business type: Technology/Software
   - Use case: "Customer relationship management for outdoor service businesses"

3. **Submit Toll-Free Verification:**
   - Go to Twilio Console → Phone Numbers → Regulatory Compliance
   - Fill out "Toll-Free Verification" form
   - Include your website domain
   - Approval usually takes 1-3 business days

---

## Environment Variables Reference

### Frontend (.env.local - for local development only)
```env
VITE_OPENWEATHER_API_KEY=your_key_here
# Optional: Override Supabase config
VITE_SUPABASE_URL=https://oqzhxfggzveuhaldjuay.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### Supabase Edge Functions (already set up)
```bash
# SMS function
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=+1234567890

# Google Maps function (when you create it)
GOOGLE_MAPS_API_KEY=your_key
```

---

## Post-Deployment Checklist

- [ ] Domain points to hosting platform
- [ ] HTTPS certificate is active (automatic on Vercel/Netlify/Cloudflare)
- [ ] Environment variables are set
- [ ] App loads correctly at your domain
- [ ] Supabase connection works
- [ ] Weather API works
- [ ] Test SMS functionality (once Twilio toll-free is approved)
- [ ] Submit Twilio toll-free verification with your domain

---

## Updating Your Deployed App

With Vercel/Netlify/Cloudflare Pages:
1. Push changes to GitHub: `git push`
2. Automatic deployment triggers
3. New version live in 2-3 minutes ✅

---

## Troubleshooting

### Build Fails
- Check build logs in hosting platform dashboard
- Run `npm run build` locally to test
- Ensure all dependencies are in `package.json`

### Environment Variables Not Working
- Must start with `VITE_` to be exposed to frontend
- Redeploy after adding/changing variables
- Check they're set in hosting platform settings

### Domain Not Connecting
- DNS changes take 5-60 minutes to propagate
- Use [whatsmydns.net](https://whatsmydns.net) to check propagation
- Ensure you're using the correct DNS records

### Supabase Connection Issues
- Verify Supabase URL and anon key in code
- Check Supabase project is active
- Check browser console for CORS errors

---

## Recommended Domain Registrars

1. **Cloudflare** - $8-15/year, best DNS performance
2. **Namecheap** - $8-13/year, good privacy protection
3. **Google Domains** - $12/year, simple interface
4. **Porkbun** - $7-11/year, cheapest option

---

## Quick Start (TL;DR)

1. Buy domain (Cloudflare, Namecheap, etc.)
2. Push code to GitHub
3. Deploy to Vercel (connect GitHub repo)
4. Add custom domain in Vercel settings
5. Update DNS at domain registrar
6. Use your domain for Twilio verification
7. Wait for toll-free approval (1-3 days)

**Total time:** ~30 minutes + DNS propagation time

---

## Need Help?

- **Vercel Docs:** https://vercel.com/docs
- **Netlify Docs:** https://docs.netlify.com
- **Cloudflare Pages Docs:** https://developers.cloudflare.com/pages
- **Twilio Toll-Free Verification:** https://www.twilio.com/docs/sms/a2p-10dlc

