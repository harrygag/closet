/**
 * Depop Page Diagnostic Tool
 *
 * Run this in the console on your Depop profile page to see what data is available
 */

console.log('=== DEPOP PAGE DIAGNOSTIC ===\n');

// 1. Check current page URL
console.log('1. Current URL:', window.location.href);
console.log('   Path:', window.location.pathname);

// 2. Check if logged in by looking for common indicators
console.log('\n2. Login Status:');
const loggedInIndicators = {
  'Has user cookie': document.cookie.includes('user'),
  'Has auth cookie': document.cookie.includes('auth'),
  'Has session cookie': document.cookie.includes('session'),
  'Has __NEXT_DATA__': !!document.getElementById('__NEXT_DATA__'),
};
console.table(loggedInIndicators);

// 3. Check __NEXT_DATA__
console.log('\n3. __NEXT_DATA__ content:');
const nextData = document.getElementById('__NEXT_DATA__');
if (nextData) {
  try {
    const data = JSON.parse(nextData.textContent);
    console.log('   Props keys:', Object.keys(data?.props || {}));
    console.log('   PageProps keys:', Object.keys(data?.props?.pageProps || {}));

    // Look for user
    const user1 = data?.props?.pageProps?.initialReduxState?.user?.user;
    const user2 = data?.props?.pageProps?.user;

    if (user1) console.log('   ✅ User found at: props.pageProps.initialReduxState.user.user');
    if (user2) console.log('   ✅ User found at: props.pageProps.user');

    if (user1 || user2) {
      const user = user1 || user2;
      console.log('   Username:', user.username);
      console.log('   User ID:', user.id);
    }

    // Look for products
    const products = data?.props?.pageProps?.products ||
                    data?.props?.pageProps?.initialReduxState?.products?.products;
    if (products) {
      console.log('   ✅ Found', products.length, 'products in __NEXT_DATA__');
    }
  } catch (e) {
    console.error('   ❌ Failed to parse __NEXT_DATA__:', e.message);
  }
} else {
  console.log('   ❌ No __NEXT_DATA__ element found');
}

// 4. Try to make a test API call
console.log('\n4. Testing API access:');
async function testAPI() {
  // Extract username from URL
  const urlMatch = window.location.pathname.match(/^\/([^\/]+)/);
  const username = urlMatch ? urlMatch[1] : null;

  if (!username) {
    console.log('   ❌ Could not extract username from URL');
    return;
  }

  console.log('   Testing with username:', username);

  try {
    const testUrl = `https://webapi.depop.com/api/v2/user/${username}/products/?limit=1`;
    console.log('   Calling:', testUrl);

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });

    console.log('   Response status:', response.status);
    console.log('   Response ok:', response.ok);

    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ API works! Got', data?.products?.length || 0, 'products');
    } else {
      const text = await response.text();
      console.log('   ❌ API error:', text.substring(0, 100));
    }
  } catch (error) {
    console.log('   ❌ Fetch failed:', error.message);
    console.log('   This usually means:');
    console.log('      - You are not logged in to Depop');
    console.log('      - You are on the wrong page');
    console.log('      - Network connectivity issue');
  }
}

testAPI();

// 5. Check for product cards in DOM
console.log('\n5. Checking DOM for products:');
setTimeout(() => {
  const selectors = [
    '[data-testid="product-card"]',
    'article[class*="product"]',
    '[class*="ProductCard"]',
    'a[href*="/products/"]'
  ];

  selectors.forEach(selector => {
    const count = document.querySelectorAll(selector).length;
    console.log(`   ${selector}: ${count} found`);
  });

  console.log('\n=== END DIAGNOSTIC ===');
  console.log('\nTo fix "Failed to fetch" errors:');
  console.log('1. Make sure you are logged in to Depop');
  console.log('2. Navigate to your profile page: https://www.depop.com/@yourusername');
  console.log('3. Wait for the page to fully load');
  console.log('4. Then try the extension again');
}, 1000);
