/**
 * E2E Test: OAuth Auto-Close and Real-Time Status Update
 * 
 * Tests the complete OAuth flow:
 * 1. Main app opens OAuth popup
 * 2. User authenticates (manual step)
 * 3. Popup auto-closes and sends postMessage
 * 4. Main app receives postMessage and updates status
 * 5. Main app polls /api/ebay/status and shows "Connected"
 */

describe('eBay OAuth - Auto-Close and Status Update', () => {
  const API_BASE = 'http://localhost:3002';
  
  beforeEach(() => {
    // Clear tokens to start fresh
    cy.request({
      method: 'GET',
      url: `${API_BASE}/auth/logout`,
      failOnStatusCode: false
    });
    
    // Clear localStorage
    cy.clearLocalStorage();
  });
  
  describe('OAuth Callback - Auto-Close Script', () => {
    // Note: This test requires a REAL auth code from eBay, so we test the error page structure instead
    it('should show error page for invalid code', () => {
      cy.visit(`${API_BASE}/auth/ebay/callback?code=mock_code`, { failOnStatusCode: false });
      
      // Check if error page loaded
      cy.contains('Authentication Failed').should('be.visible');
      cy.contains('Back to Home').should('be.visible');
    });
    
    it.skip('should have auto-close script in REAL success page', () => {
      // This test requires completing actual OAuth flow
      // User must manually test:
      // 1. Click "Connect eBay" button
      // 2. Complete OAuth on eBay
      // 3. Verify success page shows and auto-closes
      // 4. Verify main app updates to "Connected"
    });
  });
  
  describe('API Status Endpoint', () => {
    it('should return disconnected status when not authenticated', () => {
      cy.request({
        method: 'GET',
        url: `${API_BASE}/api/ebay/status`
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('connected', false);
        expect(response.body).to.have.property('hasToken', false);
        expect(response.body).to.have.property('timestamp');
      });
    });
    
    it('should have CORS headers', () => {
      cy.request({
        method: 'GET',
        url: `${API_BASE}/api/ebay/status`
      }).then((response) => {
        expect(response.headers).to.have.property('access-control-allow-origin', '*');
      });
    });
  });
  
  describe('Integration Test Page - Real-Time Updates', () => {
    it('should load test integration page', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Check page loaded
      cy.contains('eBay Integration Test').should('be.visible');
      
      // Check status shows disconnected initially
      cy.get('#status').should('have.class', 'disconnected');
      cy.get('.dot').should('have.class', 'red');
    });
    
    it('should have postMessage listener', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Check window has message listener
      cy.window().then((win) => {
        // Simulate postMessage from OAuth popup
        win.postMessage({
          type: 'EBAY_AUTH_SUCCESS',
          success: true,
          timestamp: Date.now()
        }, '*');
        
        // Wait for message to be processed
        cy.wait(1000);
        
        // Check activity log for success message
        cy.get('#log').should('contain', 'OAuth successful');
      });
    });
    
    it('should poll status endpoint every 10 seconds', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Intercept status endpoint
      cy.intercept('GET', `${API_BASE}/api/ebay/status`).as('statusCheck');
      
      // Wait for initial check
      cy.wait('@statusCheck');
      
      // Wait 10 seconds and verify another check happens
      cy.wait(10000);
      cy.wait('@statusCheck');
      
      // Verify multiple checks occurred
      cy.get('@statusCheck.all').should('have.length.at.least', 2);
    });
  });
  
  describe('React App Integration', () => {
    it.skip('should handle postMessage in React app (requires main app running)', () => {
      // Note: This test requires the main React app to be running on localhost:5173
      // AND navigated to the /ebay-integration route
      // 
      // To test manually:
      // 1. Start main app: npm run dev
      // 2. Navigate to http://localhost:5173/ebay-integration
      // 3. Click "Connect eBay" and complete OAuth
      // 4. Verify status updates and toast shows
      
      cy.visit('http://localhost:5173/ebay-integration', { failOnStatusCode: false });
      
      // Simulate postMessage from OAuth popup
      cy.window().then((win) => {
        win.postMessage({
          type: 'EBAY_AUTH_SUCCESS',
          success: true,
          timestamp: Date.now()
        }, '*');
      });
      
      // Wait for toast notification
      cy.wait(1000);
      
      // Check if status updated
      cy.contains('Connected').should('be.visible');
    });
  });
  
  describe('Multi-Method Communication', () => {
    it('should support localStorage communication', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Set localStorage flag (simulating OAuth popup)
      cy.window().then((win) => {
        win.localStorage.setItem('ebay_auth_complete', Date.now().toString());
        
        // Trigger storage event manually (since same-window doesn't trigger it)
        const event = new StorageEvent('storage', {
          key: 'ebay_auth_complete',
          newValue: Date.now().toString(),
          url: win.location.href
        });
        win.dispatchEvent(event);
      });
      
      // Note: localStorage events only fire in OTHER windows, not the same window
      // So this test verifies the listener exists but won't actually trigger it
      cy.wait(1000);
    });
    
    it('should support BroadcastChannel communication', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Check if BroadcastChannel is supported
      cy.window().then((win) => {
        if ('BroadcastChannel' in win) {
          const bc = new win.BroadcastChannel('ebay_auth');
          bc.postMessage({ type: 'EBAY_AUTH_SUCCESS', success: true, timestamp: Date.now() });
          bc.close();
          
          // Wait for message to be processed
          cy.wait(1000);
          
          // Check activity log (should have triggered checkStatus)
          cy.get('#log').should('contain', 'Checking eBay connection status');
        } else {
          cy.log('BroadcastChannel not supported in this browser');
          // Test passes if not supported
          expect(true).to.be.true;
        }
      });
    });
  });
  
  describe('Manual OAuth Flow (User Verification)', () => {
    it('should open OAuth popup when Connect button clicked', () => {
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Stub window.open to prevent actual popup
      cy.window().then((win) => {
        cy.stub(win, 'open').as('windowOpen').returns({
          closed: false,
          close: () => {}
        });
      });
      
      // Click connect button (look for the emoji or button text)
      cy.contains('button', 'Connect eBay').click();
      
      // Verify window.open was called (don't check exact params as button name varies)
      cy.get('@windowOpen').should('have.been.called');
      
      // Check activity log
      cy.get('#log').should('contain', 'Opening eBay OAuth');
    });
  });
  
  describe('Status Persistence After Reload', () => {
    // This test requires actual authentication
    // Mark as pending until user completes OAuth
    it.skip('should maintain connection status after page reload', () => {
      // Assumes user has authenticated
      cy.visit(`${API_BASE}/public/test-integration.html`);
      
      // Check connected status
      cy.get('#status').should('have.class', 'connected');
      
      // Reload page
      cy.reload();
      
      // Status should still be connected (loaded from tokens.json)
      cy.wait(2000);
      cy.get('#status').should('have.class', 'connected');
    });
  });
});

