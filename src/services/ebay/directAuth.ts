// Direct eBay OAuth implementation for development/testing
// This bypasses the backend API routes and uses direct eBay authorization

export interface EbayAuthConfig {
  clientId: string;
  runame: string;
  scopes: string[];
}

const EBAY_AUTH_CONFIG: EbayAuthConfig = {
  clientId: 'JamesKen-eba-PRD-4c56c7b0c-90f1e045',
  runame: 'James_Kennedy-JamesKen-eba-PR-jwqknyy',
  scopes: [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.marketing.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.account',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
    'https://api.ebay.com/oauth/api_scope/sell.payment.dispute',
    'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.reputation',
    'https://api.ebay.com/oauth/api_scope/sell.reputation.readonly',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription',
    'https://api.ebay.com/oauth/api_scope/commerce.notification.subscription.readonly',
    'https://api.ebay.com/oauth/api_scope/sell.stores',
    'https://api.ebay.com/oauth/api_scope/sell.stores.readonly',
    'https://api.ebay.com/oauth/scope/sell.edelivery',
    'https://api.ebay.com/oauth/api_scope/commerce.vero',
    'https://api.ebay.com/oauth/api_scope/sell.inventory.mapping',
    'https://api.ebay.com/oauth/api_scope/commerce.message',
    'https://api.ebay.com/oauth/api_scope/commerce.feedback',
  ],
};

export function generateEbayAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: EBAY_AUTH_CONFIG.clientId,
    response_type: 'code',
    redirect_uri: EBAY_AUTH_CONFIG.runame,
    scope: EBAY_AUTH_CONFIG.scopes.join(' '),
    ...(state && { state }),
  });

  return `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
}

export function initiateDirectEbayAuth(userId: string): void {
  const authUrl = generateEbayAuthUrl(userId);
  
  // Open in popup for better UX
  const width = 600;
  const height = 700;
  const left = window.screen.width / 2 - width / 2;
  const top = window.screen.height / 2 - height / 2;
  
  window.open(
    authUrl,
    'eBay Authorization',
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );
}



