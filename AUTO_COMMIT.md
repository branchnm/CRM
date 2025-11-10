# Auto-Commit Workflow

This project includes scripts to automatically commit and push changes to GitHub, which triggers Vercel deployments.

## Quick Start

### Option 1: PowerShell Script (Recommended for Windows)

```powershell
# Commit and push with a custom message
.\auto-commit.ps1 "Your commit message here"

# Or use the default message
.\auto-commit.ps1
```

### Option 2: npm Script

```bash
# Commit and push with default message
npm run deploy

# For custom messages, use the PowerShell script above
```

### Option 3: Git Alias (One-time setup)

Set up a Git alias for quick commits:

```powershell
git config alias.save '!git add . && git commit -m "Auto-save: $(Get-Date -Format \"yyyy-MM-dd HH:mm\")" && git push origin main'
```

Then use it:
```bash
git save
```

## How It Works

1. **Auto-commit.ps1**: PowerShell script that stages all changes, commits with your message, and pushes to GitHub
2. **Vercel Integration**: GitHub pushes automatically trigger Vercel rebuilds
3. **Build Verification**: TypeScript and Vite build process ensures code quality before deployment

## Vercel Deployment

Once you push to GitHub:
- Vercel automatically detects the push
- Runs `npm run build` 
- Deploys to production if build succeeds
- Typically takes 1-2 minutes

Check deployment status at: https://vercel.com/dashboard

## Troubleshooting

### Build Fails on Vercel
- Run `npm run build` locally first to catch TypeScript errors
- Check the build log in Vercel dashboard
- Ensure all dependencies are in package.json

### Permission Denied on PowerShell Script
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Git Push Rejected
```bash
# Pull latest changes first
git pull origin main
# Then try pushing again
git push origin main
```

## Environment Variables

Make sure these are set in Vercel dashboard:
- `VITE_OPENWEATHER_API_KEY`
- `VITE_GOOGLE_MAPS_API_KEY` (optional)

Supabase Edge Functions need these secrets:
- `GOOGLE_MAPS_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
