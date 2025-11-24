import type { VercelRequest, VercelResponse } from '@vercel/node';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_STOREFRONT_ACCESS_TOKEN = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!;

const CREATE_CHECKOUT_MUTATION = `
  mutation CreateCheckout($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout {
        id
        webUrl
        totalPriceV2 {
          amount
          currencyCode
        }
      }
      checkoutUserErrors {
        code
        field
        message
      }
    }
  }
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lineItems } = req.body;

    if (!lineItems || !Array.isArray(lineItems)) {
      return res.status(400).json({ error: 'Invalid line items' });
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE}/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': SHOPIFY_STOREFRONT_ACCESS_TOKEN
        },
        body: JSON.stringify({
          query: CREATE_CHECKOUT_MUTATION,
          variables: {
            input: {
              lineItems: lineItems.map((item: any) => ({
                variantId: item.variantId,
                quantity: item.quantity
              }))
            }
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify Storefront API Error:', errorText);
      return res.status(response.status).json({ 
        error: 'Failed to create checkout',
        details: errorText
      });
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL Errors:', data.errors);
      return res.status(400).json({ error: 'GraphQL mutation failed', details: data.errors });
    }

    const { checkout, checkoutUserErrors } = data.data.checkoutCreate;

    if (checkoutUserErrors && checkoutUserErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Checkout creation failed', 
        details: checkoutUserErrors 
      });
    }

    return res.status(200).json({ 
      checkoutId: checkout.id,
      checkoutUrl: checkout.webUrl,
      totalPrice: checkout.totalPriceV2
    });

  } catch (error) {
    console.error('Error creating checkout:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

