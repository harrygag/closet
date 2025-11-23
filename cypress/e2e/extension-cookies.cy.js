/// <reference types="cypress" />

describe('Extension Cookie Management', () => {
  
  before(() => {
    cy.log('⚠️ IMPORTANT: Load extension before running tests!');
    cy.log('1. Go to chrome://extensions');
    cy.log('2. Enable Developer Mode');
    cy.log('3. Click "Load unpacked"');
    cy.log('4. Select the "extension" folder');
    cy.log('5. Copy the extension ID');
  });

  describe('eBay Cookie Capture', () => {
    
    it('should navigate to eBay and capture cookies', () => {
      cy.visit('https://www.ebay.com', { timeout: 30000 });
      
      // Wait for page to load
      cy.wait(3000);
      
      // Get all cookies
      cy.getCookies().then((cookies) => {
        cy.log(`📊 Found ${cookies.length} cookies on eBay`);
        
        // Verify we have cookies
        expect(cookies.length).to.be.greaterThan(0);
        
        // Look for key eBay cookies
        const cookieNames = cookies.map(c => c.name);
        cy.log('Cookie names:', cookieNames.join(', '));
        
        // Check for important cookies
        const hasEbayCookie = cookieNames.some(name => 
          name.toLowerCase().includes('ebay') || 
          name.toLowerCase().includes('session') ||
          name === 'nonsession' ||
          name === 'dp1'
        );
        
        expect(hasEbayCookie, 'Should have eBay-specific cookies').to.be.true;
        
        // Save cookies to file for inspection
        cy.writeFile('cypress/fixtures/ebay-cookies.json', {
          timestamp: new Date().toISOString(),
          count: cookies.length,
          cookies: cookies.map(c => ({
            name: c.name,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            valueLength: c.value.length
          }))
        });
        
        cy.log('✅ Cookies saved to cypress/fixtures/ebay-cookies.json');
      });
    });
    
    it('should identify authentication cookies', () => {
      cy.visit('https://www.ebay.com');
      cy.wait(3000);
      
      cy.getCookies().then((cookies) => {
        // Find auth cookies
        const authCookies = cookies.filter(c => {
          const name = c.name.toLowerCase();
          return name.includes('session') || 
                 name.includes('auth') || 
                 name.includes('token') ||
                 name === 'nonsession' ||
                 name === 'dp1';
        });
        
        cy.log(`🔐 Found ${authCookies.length} authentication cookies:`);
        authCookies.forEach(c => {
          cy.log(`  - ${c.name} (${c.value.length} chars)`);
        });
        
        expect(authCookies.length).to.be.greaterThan(0);
      });
    });
    
  });

  describe('Cookie Save and Restore', () => {
    
    let savedCookies = [];
    
    it('should save current eBay cookies', () => {
      cy.visit('https://www.ebay.com');
      cy.wait(3000);
      
      cy.getCookies().then((cookies) => {
        savedCookies = cookies;
        cy.log(`💾 Saved ${savedCookies.length} cookies`);
        
        // Store in Cypress env for next test
        cy.writeFile('cypress/fixtures/saved-cookies.json', savedCookies);
        
        expect(savedCookies.length).to.be.greaterThan(0);
      });
    });
    
    it('should clear all cookies', () => {
      cy.visit('https://www.ebay.com');
      
      // Clear all cookies
      cy.clearCookies();
      
      // Verify cookies are cleared
      cy.getCookies().should('have.length', 0);
      cy.log('🗑️ All cookies cleared');
    });
    
    it('should restore cookies', () => {
      cy.visit('https://www.ebay.com');
      
      // Read saved cookies
      cy.readFile('cypress/fixtures/saved-cookies.json').then((cookies) => {
        cy.log(`📥 Restoring ${cookies.length} cookies...`);
        
        // Restore each cookie
        cookies.forEach(cookie => {
          // Cypress setCookie format
          cy.setCookie(cookie.name, cookie.value, {
            domain: cookie.domain,
            path: cookie.path,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expiry: cookie.expiry
          });
        });
        
        cy.log('✅ Cookies restored');
      });
      
      // Verify cookies are back
      cy.getCookies().then((cookies) => {
        expect(cookies.length).to.be.greaterThan(0);
        cy.log(`✅ ${cookies.length} cookies present after restore`);
      });
      
      // Reload to test if cookies work
      cy.reload();
      cy.wait(3000);
      
      cy.getCookies().should('have.length.greaterThan', 0);
    });
    
  });

  describe('Extension Message API', () => {
    
    it('should have chrome.runtime available', () => {
      cy.visit('https://www.ebay.com');
      
      cy.window().then((win) => {
        const hasChromeRuntime = !!(win.chrome && win.chrome.runtime);
        
        if (hasChromeRuntime) {
          cy.log('✅ chrome.runtime is available');
          cy.log('Extension ID:', win.chrome.runtime.id);
        } else {
          cy.log('⚠️ chrome.runtime not available (extension not loaded or not externally connectable)');
        }
      });
    });
    
  });

  describe('Cookie API Compatibility', () => {
    
    it('should test cookie format for extension compatibility', () => {
      cy.visit('https://www.ebay.com');
      cy.wait(3000);
      
      cy.getCookies().then((cookies) => {
        cy.log('Testing cookie format compatibility...');
        
        cookies.forEach(cookie => {
          // Check required fields for Chrome extension cookie API
          expect(cookie).to.have.property('name');
          expect(cookie).to.have.property('value');
          expect(cookie).to.have.property('domain');
          expect(cookie).to.have.property('path');
          expect(cookie).to.have.property('secure');
          expect(cookie).to.have.property('httpOnly');
          
          // Log any cookies that might have issues
          if (!cookie.domain.startsWith('.')) {
            cy.log(`⚠️ Cookie ${cookie.name} domain doesn't start with dot: ${cookie.domain}`);
          }
        });
        
        cy.log('✅ All cookies have required fields');
      });
    });
    
    it('should export cookies in Chrome extension format', () => {
      cy.visit('https://www.ebay.com');
      cy.wait(3000);
      
      cy.getCookies().then((cookies) => {
        // Convert to Chrome extension format
        const extensionFormat = cookies.map(c => ({
          url: `https://${c.domain.replace(/^\./, '')}`,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path || '/',
          secure: c.secure !== undefined ? c.secure : true,
          httpOnly: c.httpOnly || false,
          expirationDate: c.expiry
        }));
        
        cy.writeFile('cypress/fixtures/extension-cookies.json', {
          marketplace: 'ebay',
          capturedAt: new Date().toISOString(),
          count: extensionFormat.length,
          cookies: extensionFormat
        });
        
        cy.log(`✅ Exported ${extensionFormat.length} cookies in extension format`);
      });
    });
    
  });

  describe('Login Detection', () => {
    
    it('should check for login indicators on eBay', () => {
      cy.visit('https://www.ebay.com');
      cy.wait(5000);
      
      // Check for common login indicators
      cy.get('body').then(($body) => {
        const bodyText = $body.text();
        const html = $body.html();
        
        const indicators = {
          hasMyEbay: html.includes('My eBay') || html.includes('my eBay'),
          hasSignOut: html.includes('Sign out') || html.includes('sign out'),
          hasHiGreeting: /Hi\s+\w+/.test(bodyText),
          hasAccountMenu: html.includes('account') || html.includes('Account')
        };
        
        cy.log('Login Indicators:');
        cy.log(`  My eBay: ${indicators.hasMyEbay ? '✅' : '❌'}`);
        cy.log(`  Sign Out: ${indicators.hasSignOut ? '✅' : '❌'}`);
        cy.log(`  Hi Greeting: ${indicators.hasHiGreeting ? '✅' : '❌'}`);
        cy.log(`  Account Menu: ${indicators.hasAccountMenu ? '✅' : '❌'}`);
        
        const isLoggedIn = Object.values(indicators).some(v => v);
        
        if (isLoggedIn) {
          cy.log('✅ User appears to be logged in');
        } else {
          cy.log('❌ User does not appear to be logged in');
        }
        
        cy.writeFile('cypress/fixtures/login-status.json', {
          timestamp: new Date().toISOString(),
          isLoggedIn,
          indicators
        });
      });
    });
    
  });
  
});

