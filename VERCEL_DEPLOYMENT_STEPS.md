# Vercel Deployment Steps for jobflowco.com

## ✅ Pre-Deployment Complete
- [x] `.env.local` configured with API keys
- [x] Build successful (`npm run build`)
- [x] Preview tested (`npm run preview` at http://localhost:4173/)
- [x] Domain purchased: **jobflowco.com**

---

## 🚀 Next Steps in Vercel

### Step 1: Configure Environment Variables
You mentioned you're in the environment variables section. Add these **TWO** variables:

```
VITE_OPENWEATHER_API_KEY = your_openweather_key_here
VITE_GOOGLE_MAPS_API_KEY = your_google_maps_key_here
```

**Important:** 
- Variable names must be EXACTLY as shown (with `VITE_` prefix)
- No quotes around the values
- Click "Add" after each one

### Step 2: Deploy
1. Click **"Deploy"** button in Vercel
2. Wait 2-3 minutes for build to complete
3. You'll get a temporary URL like: `your-project-name.vercel.app`
4. Test this URL to make sure everything works

### Step 3: Add Custom Domain
1. In your Vercel project dashboard, go to **"Settings"** tab
2. Click **"Domains"** in the left sidebar
3. Enter: `jobflowco.com`
4. Click "Add"
5. Vercel will show you DNS records to configure

---

## 🌐 DNS Configuration at Your Domain Registrar

### Where did you buy jobflowco.com?
Choose your registrar below for specific instructions:

#### **Option A: If using Vercel DNS (Recommended - Easiest)**
Vercel will give you nameserver addresses like:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

Go to your domain registrar and update nameservers to these values. **This is the easiest option.**

#### **Option B: If keeping your current DNS provider**
Add these records in your domain's DNS settings:

**For Root Domain (jobflowco.com):**
- Type: `A`
- Name: `@` (or leave blank)
- Value: `76.76.21.21`
- TTL: `3600` (or Auto)

**For WWW Subdomain (www.jobflowco.com):**
- Type: `CNAME`
- Name: `www`
- Value: `cname.vercel-dns.com`
- TTL: `3600` (or Auto)

### Common Registrars - Where to Find DNS Settings:

**Cloudflare:**
1. Log in to Cloudflare dashboard
2. Select your domain `jobflowco.com`
3. Click "DNS" tab
4. Add records or change nameservers

**Namecheap:**
1. Log in to Namecheap
2. Go to "Domain List"
3. Click "Manage" next to jobflowco.com
4. Go to "Advanced DNS" tab
5. Add records

**Google Domains:**
1. Log in to domains.google.com
2. Click jobflowco.com
3. Click "DNS" in left menu
4. Scroll to "Custom records"

**GoDaddy:**
1. Log in to GoDaddy
2. Go to "My Products"
3. Click "DNS" next to jobflowco.com
4. Add records

---

## ⏱️ Timeline

| Step | Time |
|------|------|
| Vercel Build | 2-3 minutes |
| Add Custom Domain in Vercel | 1 minute |
| Update DNS at Registrar | 2-5 minutes |
| **DNS Propagation Wait** | **5-60 minutes** |
| HTTPS Certificate Auto-Provision | 5-10 minutes (automatic) |
| **Total Time** | **~15-75 minutes** |

---

## 🔍 Verification Steps

### 1. Check Vercel Deployment
- Visit your temporary Vercel URL (something.vercel.app)
- Test these features:
  - ✅ Homepage loads
  - ✅ Can add a customer
  - ✅ Weather forecast shows
  - ✅ No console errors (F12 → Console tab)

### 2. Check DNS Propagation
Visit: https://whatsmydns.net
- Enter: `jobflowco.com`
- Check that it resolves to Vercel's IP or CNAME

### 3. Check Custom Domain
Once DNS propagates:
- Visit: https://jobflowco.com
- Should show your CRM
- Check for green padlock (HTTPS)
- Test same features as step 1

---

## 🎯 For Twilio Toll-Free Verification

Once **jobflowco.com** is live with HTTPS:

### Website Information
- **Website URL:** https://jobflowco.com
- **Business Name:** [Your business legal name]
- **Business Type:** Lawn Care & Landscaping Services

### Use Case Description (Copy/Paste Ready)
```
We operate a lawn care and landscaping business serving residential and commercial 
customers. Our CRM system at jobflowco.com is used internally to:

1. Schedule and track service appointments
2. Send appointment confirmations to customers via SMS
3. Notify customers of weather-related schedule changes
4. Provide service completion updates

Messages are transactional only (confirmations, reminders, updates) and sent to 
customers who have provided explicit consent as part of our service agreements.

Estimated monthly volume: 50-200 messages
All messages are one-to-one customer communications, not marketing.
```

### Sample Message Templates
```
1. "Hi [Name], your lawn service is scheduled for [Date] at [Time]. Reply STOP to opt out."

2. "Weather update: We've rescheduled your service to [New Date] due to rain. Reply STOP to opt out."

3. "Service complete! Your lawn has been mowed. Thank you for choosing [Business Name]. Reply STOP to opt out."
```

---

## 🆘 Troubleshooting

### "Build Failed" in Vercel
- Check build logs - should be similar to local build
- Verify environment variables are correct (check spelling)
- Make sure both `VITE_OPENWEATHER_API_KEY` and `VITE_GOOGLE_MAPS_API_KEY` are set

### "Domain Not Connecting"
- Wait full 60 minutes for DNS propagation
- Use https://whatsmydns.net to check propagation status
- Verify DNS records exactly match Vercel's instructions
- Make sure nameservers are correct if using Vercel DNS

### "HTTPS Certificate Not Working"
- Vercel auto-provisions HTTPS (Let's Encrypt)
- Can take 5-10 minutes after DNS propagates
- If still not working after 30 minutes, check Vercel domain settings

### "Website Loads but Features Don't Work"
- Check browser console (F12 → Console)
- Verify environment variables in Vercel dashboard
- Make sure Supabase project is active (not paused)
- Check that API keys are valid

---

## 📌 Current Status

**You are here:** 
- ✅ Build successful
- ✅ Preview tested locally
- ⏳ **NEXT: Click "Deploy" in Vercel**
- ⏳ Then add custom domain
- ⏳ Then configure DNS

**Expected completion:** ~1 hour from now (including DNS wait time)

---

## 🎉 Success Criteria

Your deployment is complete when:
1. ✅ https://jobflowco.com loads successfully
2. ✅ Green padlock (HTTPS) shows in browser
3. ✅ Can create customers and jobs
4. ✅ Weather forecast displays
5. ✅ No errors in browser console

**Once all 5 are complete, you can submit Twilio verification!**

Twilio approval typically takes 1-3 business days.
