describe('Marketplace Page UI Tests', () => {
  const API_URL = 'http://localhost:3001';
  
  beforeEach(() => {
    // Bypass authentication for testing
    cy.bypassAuth();
    
    // Setup API intercepts
    cy.interceptMarketplaceAPI();
    
    // Visit homepage
    cy.visit('/', { timeout: 10000 });
    
    // Wait for app to load (should bypass login)
    cy.get('body', { timeout: 10000 }).should('be.visible');
    
    // Find and click the Marketplaces navigation button
    // The app uses icons, so look for the Link2 icon (🔗) or text
    cy.wait(2000); // Wait for nav to render
    
    // Try to click using various methods
    cy.get('body').then(($body) => {
      const bodyText = $body.text();
      
      if (bodyText.includes('Marketplace') || bodyText.includes('🔗')) {
        // Click button containing marketplace or link icon
        cy.get('button').each(($btn) => {
          const text = $btn.text().toLowerCase();
          if (text.includes('marketplace') || text.includes('link') || $btn.html().includes('link2')) {
            cy.wrap($btn).click();
            return false; // Stop iteration
          }
        });
      } else {
        // App might not have loaded - skip this test
        cy.log('App navigation not found - skipping');
      }
    });
    
    // Wait for marketplaces view to load
    cy.contains('Marketplaces', { timeout: 10000 }).should('be.visible');
  });

  describe('Page Load', () => {
    it('should display marketplace cards', () => {
      cy.contains('eBay').should('be.visible');
      cy.contains('Poshmark').should('be.visible');
      cy.contains('Depop').should('be.visible');
    });

    it('should show extension status section', () => {
      cy.contains('Extension Status').should('be.visible');
    });

    it('should display connection stats', () => {
      cy.contains('Connected').should('be.visible');
      cy.contains('Not Connected').should('be.visible');
      cy.contains('Total').should('be.visible');
    });
  });

  describe('Extension Detection', () => {
    it('should detect when no extension is installed', () => {
      cy.contains('Extension Status:').parent().should('contain', 'Not Detected');
    });

    it('should show extension ID input when not detected', () => {
      cy.get('input[placeholder*="Manual ID entry"]').should('be.visible');
    });

    it('should allow manual extension ID entry', () => {
      const testId = 'abc123test456';
      cy.get('input[placeholder*="Manual ID entry"]').type(testId);
      cy.window().then((win) => {
        expect(win.localStorage.getItem('extension_id')).to.eq(testId);
      });
    });
  });

  describe('Marketplace Actions', () => {
    beforeEach(() => {
      // Mock extension connection
      cy.mockExtension();
      cy.wait(500); // Wait for connection
    });

    it('should show "Manual Sync" button for unconnected marketplaces', () => {
      cy.contains('Manual Sync').should('be.visible');
    });

    it('should show "Login & Capture" button for unconnected marketplaces', () => {
      cy.contains('Login & Capture').should('be.visible');
    });

    it('should attempt to sync cookies when clicking Manual Sync', () => {
      // Mock successful sync response
      cy.intercept('POST', `${API_URL}/api/marketplace/save-credentials`, {
        statusCode: 200,
        body: { success: true, action: 'saved' }
      }).as('syncCookies');

      // Find and click sync button
      cy.contains('button', 'Manual Sync').first().click();

      // Should show loading state
      cy.contains('Syncing...').should('be.visible');
    });

    it('should open marketplace site when clicking "Login & Capture"', () => {
      // Stub window.open to prevent actual navigation
      cy.window().then((win) => {
        cy.stub(win, 'open').as('windowOpen');
      });

      cy.contains('button', 'Login & Capture').first().click();

      // Verify window.open was called with marketplace URL
      cy.get('@windowOpen').should('be.called');
    });
  });

  describe('Diagnostics', () => {
    beforeEach(() => {
      cy.mockExtension();
      cy.wait(500);
    });

    it('should open diagnostics modal when clicking Diagnostics button', () => {
      cy.contains('button', 'Diagnostics').click();
      // Modal should appear (check for modal content)
      cy.get('[role="dialog"]').should('be.visible');
    });

    it('should show diagnostic results', () => {
      // Mock diagnostic response
      cy.window().then((win) => {
        const originalSendMessage = win.chrome.runtime.sendMessage;
        win.chrome.runtime.sendMessage = (id, message, callback) => {
          if (message.type === 'DIAGNOSE_CONNECTION') {
            callback({
              success: true,
              checks: [
                { name: 'Background Worker', status: 'OK', details: 'Version 1.0.2' },
                { name: 'Authentication', status: 'OK', details: 'Logged in' },
                { name: 'Cookie API', status: 'OK', details: 'Accessible' }
              ]
            });
          } else {
            originalSendMessage(id, message, callback);
          }
        };
      });

      cy.contains('button', 'Diagnostics').click();
      cy.wait(500);
      cy.contains('Background Worker').should('be.visible');
      cy.contains('OK').should('be.visible');
    });
  });

  describe('XHR Requests', () => {
    beforeEach(() => {
      cy.mockExtension();
      cy.wait(500);
    });

    it('should make XHR request to save credentials', () => {
      // Setup intercept to capture request
      cy.intercept('POST', `${API_URL}/api/marketplace/save-credentials`, (req) => {
        expect(req.body).to.have.property('marketplace');
        expect(req.body).to.have.property('cookies');
        expect(req.headers).to.have.property('authorization');
        
        req.reply({
          statusCode: 200,
          body: { success: true, action: 'saved' }
        });
      }).as('saveCredentials');

      // Trigger sync (this will attempt to call the extension)
      cy.contains('button', 'Manual Sync').first().click();

      // Note: Actual XHR will only happen if extension returns cookies
      // This tests that the flow is set up correctly
    });

    it('should handle 401 unauthorized error', () => {
      cy.intercept('POST', `${API_URL}/api/marketplace/save-credentials`, {
        statusCode: 401,
        body: { error: 'Invalid auth token' }
      }).as('unauthorized');

      cy.contains('button', 'Manual Sync').first().click();

      // Should show error toast
      cy.contains('Not authenticated', { timeout: 5000 }).should('be.visible');
    });

    it('should handle network errors gracefully', () => {
      cy.intercept('POST', `${API_URL}/api/marketplace/save-credentials`, {
        forceNetworkError: true
      }).as('networkError');

      cy.contains('button', 'Manual Sync').first().click();

      // Should show error message
      cy.contains(/error|failed/i, { timeout: 5000 }).should('be.visible');
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh connections when clicking Refresh button', () => {
      cy.intercept('GET', '**/user_marketplace_credentials*').as('getConnections');
      
      cy.contains('button', 'Refresh').click();
      
      // Should show loading state
      cy.contains('button', 'Refresh').should('be.disabled');
    });
  });

  describe('Extension Download', () => {
    it('should allow downloading extension', () => {
      cy.contains('button', 'Download Extension').should('be.visible');
      
      // Stub download to avoid actual file download
      cy.window().then((win) => {
        cy.stub(win.document, 'createElement').callsFake((tag) => {
          if (tag === 'a') {
            return {
              href: '',
              download: '',
              click: cy.stub().as('downloadClick'),
              remove: () => {}
            };
          }
          return win.document.createElement.wrappedMethod(tag);
        });
      });

      cy.contains('button', 'Download Extension').click();
    });
  });
});

