import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!;

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          description
          vendor
          productType
          tags
          images(first: 5) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 1) {
            edges {
              node {
                id
                price {
                  amount
                  currencyCode
                }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50 } = req.query;

    const response = await fetch(
      `https://${SHOPIFY_STORE}/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_ACCESS_TOKEN
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: {
            first: parseInt(limit as string)
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify Storefront API Error:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch products from Shopify',
        details: errorText
      });
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      return res.status(400).json({ error: 'GraphQL query failed', details: data.errors });
    }

    // Transform the response to a simpler format
    const products = data.data.products.edges.map((edge: any) => ({
      id: edge.node.id,
      title: edge.node.title,
      description: edge.node.description,
      vendor: edge.node.vendor,
      productType: edge.node.productType,
      tags: edge.node.tags,
      images: edge.node.images.edges.map((img: any) => ({
        url: img.node.url,
        altText: img.node.altText
      })),
      variants: edge.node.variants.edges.map((variant: any) => ({
        id: variant.node.id,
        price: variant.node.price,
        availableForSale: variant.node.availableForSale
      }))
    }));

    return res.status(200).json({ products });

  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

