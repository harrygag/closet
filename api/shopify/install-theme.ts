import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN } = process.env;

  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    return res.status(500).json({ 
      error: 'Missing environment variables',
      details: 'SHOPIFY_STORE_DOMAIN or SHOPIFY_ADMIN_ACCESS_TOKEN not set' 
    });
  }

  // The URL of the zip file we just deployed
  const themeSrc = `https://${req.headers.host}/debut-vintage-theme.zip`;

  try {
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/themes.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN
      },
      body: JSON.stringify({
        theme: {
          name: "Debut Vintage (React)",
          src: themeSrc,
          role: "unpublished"
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(JSON.stringify(data));
    }

    return res.status(200).json({
      success: true,
      message: 'Theme installation started!',
      theme: data.theme,
      next_steps: 'Go to Shopify Admin > Online Store > Themes to publish "Debut Vintage (React)"'
    });

  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to install theme',
      details: error.message
    });
  }
}

