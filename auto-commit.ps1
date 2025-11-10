# Auto-commit script for automatic Git commits
# Usage: .\auto-commit.ps1 "Your commit message"

param(
    [Parameter(Mandatory=$false)]
    [string]$Message = "Auto-commit: Update files"
)

Write-Host "🔍 Checking for changes..." -ForegroundColor Cyan

# Check if there are any changes
$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "✅ No changes to commit" -ForegroundColor Green
    exit 0
}

Write-Host "📝 Changes detected:" -ForegroundColor Yellow
git status --short

Write-Host "`n📦 Staging all changes..." -ForegroundColor Cyan
git add .

Write-Host "💾 Committing changes..." -ForegroundColor Cyan
git commit -m $Message

Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
git push origin main

Write-Host "`n✅ Done! Changes pushed to GitHub and Vercel will rebuild automatically." -ForegroundColor Green
