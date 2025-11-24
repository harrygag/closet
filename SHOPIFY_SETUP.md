# Shopify Integration Setup Guide

This guide will help you set up your Shopify store to work with your inventory management system.

## Prerequisites

- A Shopify account (you can start with a free trial at https://www.shopify.com)
- Access to your Shopify admin panel
- Your inventory management system deployed on Vercel

## Step 1: Create a Shopify Store

1. Go to https://www.shopify.com and click "Start free trial"
2. Follow the setup wizard to create your store
3. Note your store's domain (e.g., `your-store.myshopify.com`)

## Step 2: Create a Custom App

1. In your Shopify admin, go to **Settings** → **Apps and sales channels**
2. Click **Develop apps**
3. Click **Create an app**
4. Name your app (e.g., "Closet BV Sync")
5. Click **Create app**

### Configure Admin API Scopes

1. Click **Configure Admin API scopes**
2. Enable the following scopes:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`
   - `read_orders`
   - `write_orders`
3. Click **Save**

### Install the App

1. Click **Install app**
2. Click **Install** to confirm
3. Copy the **Admin API access token** (starts with `shpat_`)
   - Save this as `SHOPIFY_ADMIN_ACCESS_TOKEN` in your Vercel environment variables

### Configure Storefront API

1. Go to the **API credentials** tab
2. Scroll to **Storefront API access tokens**
3. Click **Create storefront access token**
4. Enable the following scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_product_inventory`
   - `unauthenticated_write_checkouts`
   - `unauthenticated_read_checkouts`
5. Click **Save**
6. Copy the **Storefront access token**
   - Save this as `SHOPIFY_STOREFRONT_ACCESS_TOKEN` in your Vercel environment variables

## Step 3: Set Up Webhooks

1. In your Shopify admin, go to **Settings** → **Notifications**
2. Scroll to **Webhooks**
3. Click **Create webhook**
4. Configure the webhook:
   - **Event**: `Order creation`
   - **Format**: `JSON`
   - **URL**: `https://your-deployment.vercel.app/api/shopify/webhook-order-created`
   - **API version**: `2024-01`
5. Click **Save webhook**
6. Copy the **Webhook signing secret**
   - Save this as `SHOPIFY_WEBHOOK_SECRET` in your Vercel environment variables

## Step 4: Configure Vercel Environment Variables

Go to your Vercel project settings and add the following environment variables:

```bash
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
SHOPIFY_STOREFRONT_ACCESS_TOKEN=xxxxxxxxxxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxxxxxxxxxx
```

Make sure to set these for **Production**, **Preview**, and **Development** environments.

## Step 5: Deploy and Test

1. Commit and push your changes to trigger a Vercel deployment
2. Log in to your inventory management system
3. Go to **Shopify Store** in the navigation
4. Click **Sync All Unsynced Items** to push your inventory to Shopify
5. Visit `/shop` on your deployment URL to see your public storefront

## Step 6: Configure Your Storefront

### Customize Your Store Theme

1. In Shopify admin, go to **Online Store** → **Themes**
2. Click **Customize** on your active theme
3. Update your store colors, logo, and branding to match your style

### Set Up Payment Providers

1. Go to **Settings** → **Payments**
2. Add payment providers (Shopify Payments, PayPal, etc.)
3. Complete the required verification steps

### Configure Shipping

1. Go to **Settings** → **Shipping and delivery**
2. Add shipping zones and rates
3. Configure handling times

## How It Works

### Product Sync Flow

1. You add/update items in your inventory management system
2. Items with "Active" status can be synced to Shopify
3. The sync creates/updates products in your Shopify store
4. Your custom storefront at `/shop` displays these products

### Order Flow

1. Customer browses your storefront at `/shop`
2. Customer adds items to cart and clicks "Proceed to Checkout"
3. Customer is redirected to Shopify's secure checkout
4. After purchase, Shopify sends a webhook to your system
5. Your system automatically marks the item as "SOLD" in your database

### Inventory Management

- **Active items** in your system = Available for sync to Shopify
- **Sold items** are automatically updated when orders are placed
- **Inactive items** are not synced to Shopify

## API Endpoints

Your system provides these endpoints:

- `POST /api/shopify/sync-product` - Sync a single item to Shopify
- `POST /api/shopify/sync-all-products` - Sync all unsynced items
- `GET /api/shopify/get-products` - Fetch products from Shopify for storefront
- `POST /api/shopify/create-checkout` - Create a Shopify checkout session
- `POST /api/shopify/webhook-order-created` - Handle order webhooks

## Troubleshooting

### Products not appearing in storefront

1. Check that items are marked as "Active" in your inventory
2. Verify the items have been synced (check Shopify Admin → Products)
3. Check Vercel function logs for errors

### Webhook not working

1. Verify the webhook URL is correct in Shopify settings
2. Test the webhook from Shopify admin
3. Check Vercel function logs for webhook processing errors

### Sync failures

1. Verify all Shopify environment variables are set correctly
2. Check that your Shopify app has the required API scopes
3. Review Vercel function logs for specific error messages

## Support

For issues or questions:
- Check Vercel function logs for errors
- Review Shopify API documentation: https://shopify.dev/docs
- Check your Shopify app's API credentials

## Next Steps

- Customize your storefront design in `src/pages/ShopifyStorefront.tsx`
- Add product detail pages for better UX
- Set up email notifications for new orders
- Configure SEO settings in Shopify
- Add Google Analytics tracking

