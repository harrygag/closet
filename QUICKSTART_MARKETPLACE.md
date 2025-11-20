# Quick Start Guide - Marketplace Integration

## 🚀 Get Started in 5 Minutes

### Step 1: Run Database Migrations

Connect to your Supabase project and run:

```bash
# Using Supabase CLI
supabase db push

# OR manually via psql
psql postgresql://postgres:[PASSWORD]@db.hqmujfbifgpcyqmpuwil.supabase.co:5432/postgres -f supabase/migrations/005_add_marketplace_urls.sql
psql postgresql://postgres:[PASSWORD]@db.hqmujfbifgpcyqmpuwil.supabase.co:5432/postgres -f supabase/migrations/006_add_marketplace_credentials.sql
```

### Step 2: Set Environment Variable

In Vercel dashboard, add environment variable:

```
Key: CREDENTIALS_ENCRYPTION_KEY
Value: [Generate a 32-character random string]
```

To generate a secure key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Deploy

```bash
git add .
git commit -m "feat: Add marketplace integration"
git push
```

Vercel will automatically deploy.

### Step 4: Test It Out!

1. Open your app
2. Click the **"Markets"** button (blue shopping cart icon)
3. Select **eBay** tab
4. Choose **"Fill Links Only"** action
5. Enter your eBay credentials
6. Click **"Start Scraping eBay"**
7. Wait 30-60 seconds
8. Review results!

## 📱 How to Use

### Fill Links Mode (Recommended First)

**Best for**: Adding marketplace URLs to existing inventory

1. Click "Markets" button
2. Select marketplace (eBay, Poshmark, or Depop)
3. Choose "Fill Links Only"
4. Enter credentials
5. Click "Start Scraping"
6. Review matched items with similarity percentages
7. Check your items - URLs are now filled in!

### Import Mode

**Best for**: Bulk importing new items from marketplace

1. Click "Markets" button
2. Select marketplace
3. Choose "Import New Items"
4. Enter credentials
5. Check "Save credentials securely" (optional)
6. Click "Start Scraping"
7. New items appear in your inventory!

## 🎯 Quick Tips

### For eBay
- Use your eBay Seller Hub credentials
- Scrapes from: `ebay.com/sh/lst/active`
- Extracts: title, price, URL, image, status

### For Poshmark
- Use your Poshmark login
- Scrapes from: Your closet page
- Extracts: title, price, brand, size, sold status

### For Depop
- Option 1: Enter credentials
- Option 2: Just paste your shop URL (no login needed!)
- Scrapes from: Your shop page

## 🔧 Manual URL Entry

Don't want to scrape? Add URLs manually:

1. Edit any item
2. Click "Show Advanced Options"
3. Scroll to marketplace URLs
4. Paste URLs directly
5. Save!

## ❓ Troubleshooting

### "Credentials not found"
→ Re-enter your credentials or click "Save credentials securely"

### "No items matched"
→ Your item titles may be too different. Try import mode instead.

### "Scraping timeout"
→ Too many items. Try again or contact support.

### "Browser launch failed"
→ Vercel issue. Check that you're on Pro plan.

## 📊 What Gets Scraped?

| Marketplace | Title | Price | Image | Brand | Size | Status |
|-------------|-------|-------|-------|-------|------|--------|
| eBay        | ✅    | ✅    | ✅    | ❌    | ❌   | ✅     |
| Poshmark    | ✅    | ✅    | ✅    | ✅    | ✅   | ✅     |
| Depop       | ✅    | ✅    | ✅    | ✅    | ✅   | ✅     |

## 🔒 Security

- Passwords encrypted with AES-256
- Credentials never leave your account
- Row Level Security enforced
- You can delete credentials anytime

## 🎉 That's It!

You're ready to start scraping marketplaces and automating your inventory management!

For detailed documentation, see:
- `docs/MARKETPLACE_INTEGRATION.md` - Full technical docs
- `IMPLEMENTATION_SUMMARY.md` - Implementation details

---

**Need Help?** Check Vercel logs or file an issue in Linear.







