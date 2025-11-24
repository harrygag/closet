# 🚀 Quick Shopify Setup (5 Minutes)

Your interactive storefront is **ALREADY DEPLOYED** to Vercel at:
**https://closetbv.vercel.app/shop**

You just need to add Shopify environment variables to make it work!

## Step 1: Create Shopify Store (2 min)

1. Go to https://www.shopify.com/free-trial
2. Create your store (choose any name like "closet-bv")
3. Skip the setup wizard (we'll configure via API)

## Step 2: Get Your Shopify Credentials (2 min)

### A. Get Store Domain
Your store domain is: `your-store-name.myshopify.com`

### B. Create a Custom App
1. In Shopify admin, go to **Settings** → **Apps and sales channels**
2. Click **Develop apps** → **Create an app**
3. Name it "Closet BV Storefront"

### C. Configure Admin API Access
1. Click **Configure Admin API scopes**
2. Enable these permissions:
   - ✅ `read_products`
   - ✅ `write_products`
   - ✅ `read_inventory`
   - ✅ `write_inventory`
   - ✅ `read_orders`
   - ✅ `write_orders`
3. Click **Save**
4. Click **Install app**
5. **COPY** the Admin API access token (starts with `shpat_`)

### D. Create Storefront API Token
1. Go to **API credentials** tab
2. Scroll to **Storefront API access tokens**
3. Click **Create storefront access token**
4. Enable:
   - ✅ `unauthenticated_read_product_listings`
   - ✅ `unauthenticated_read_product_inventory`
   - ✅ `unauthenticated_write_checkouts`
   - ✅ `unauthenticated_read_checkouts`
5. Click **Save**
6. **COPY** the Storefront access token

### E. Create Webhook Secret
1. Go to **Settings** → **Notifications**
2. Scroll to **Webhooks**
3. Click **Create webhook**
4. Event: `Order creation`
5. Format: `JSON`
6. URL: `https://closetbv.vercel.app/api/shopify/webhook-order-created`
7. API version: `2024-01`
8. Click **Save**
9. **COPY** the webhook signing secret

## Step 3: Add to Vercel (1 min)

Go to: https://vercel.com/harrygags-projects/closetbv/settings/environment-variables

Add these 4 environment variables:

```
Name: SHOPIFY_STORE_DOMAIN
Value: your-store-name.myshopify.com

Name: SHOPIFY_ADMIN_ACCESS_TOKEN
Value: shpat_xxxxxxxxxxxxx (paste your Admin API token)

Name: SHOPIFY_STOREFRONT_ACCESS_TOKEN
Value: xxxxxxxxxxxxx (paste your Storefront token)

Name: SHOPIFY_WEBHOOK_SECRET
Value: xxxxxxxxxxxxx (paste your webhook secret)
```

Click **Save** for each one.

## Step 4: Redeploy Vercel

After adding the variables:
1. Go to https://vercel.com/harrygags-projects/closetbv
2. Click the **latest deployment**
3. Click the **⋮** menu → **Redeploy**

## Step 5: Test It! 🎉

1. **Sync your inventory:**
   - Go to https://closetbv.vercel.app/shopify
   - Click "Sync All Unsynced Items"
   - Watch your items upload to Shopify!

2. **View your storefront:**
   - Go to https://closetbv.vercel.app/shop
   - See your products with amazing 3D effects!
   - Add items to cart (confetti will explode 🎊)
   - Try checkout!

---

## Troubleshooting

**Products not showing?**
- Make sure you clicked "Sync All" in the `/shopify` admin page
- Check Vercel function logs for errors

**Checkout not working?**
- Verify all 4 environment variables are set correctly
- Make sure you redeployed after adding them

**Webhook not working?**
- Check the webhook URL matches your Vercel deployment
- Test the webhook from Shopify admin

---

## What You Get

✅ **Interactive 3D product cards** with mouse tracking  
✅ **Confetti animations** on every add-to-cart  
✅ **Smooth Framer Motion** animations everywhere  
✅ **Auto-inventory sync** - items marked SOLD when purchased  
✅ **Secure Shopify checkout** - fully PCI compliant  
✅ **Mobile responsive** - works on all devices  

**Your storefront is LIVE at:** https://closetbv.vercel.app/shop

Just add those 4 environment variables and you're ready to sell! 🚀

