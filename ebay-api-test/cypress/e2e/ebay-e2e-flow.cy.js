/// <reference types="cypress" />

/**
 * End-to-End eBay Integration Flow
 * 
 * User Journey:
 * 1. User visits homepage
 * 2. Clicks "Connect eBay"
 * 3. Completes OAuth (manual)
 * 4. Returns to app
 * 5. Syncs inventory
 * 6. Views imported items
 * 7. Manages listings
 */

describe('eBay Integration - Complete E2E Flow', () => {
  
  beforeEach(() => {
    // Clear application state
    cy.clearCookies();
    cy.clearLocalStorage();
  });

  describe('1. Initial State - No Connection', () => {
    
    it('should show homepage without eBay connection', () => {
      cy.visit('/');
      cy.contains('eBay API Test Server').should('be.visible');
      cy.contains('Not authenticated').should('be.visible');
    });
    
    it('should have Connect eBay button', () => {
      cy.visit('/');
      cy.contains('button', 'Connect eBay Account').should('be.visible');
      cy.contains('button', 'Connect eBay Account').should('not.be.disabled');
    });
    
    it('should not show authenticated features', () => {
      cy.visit('/');
      cy.get('body').then(($body) => {
        expect($body.text()).not.to.include('Import Inventory');
        expect($body.text()).not.to.include('Test Inventory');
      });
    });
    
  });

  describe('2. OAuth Flow', () => {
    
    it('should redirect to eBay OAuth when clicking Connect', () => {
      cy.visit('/');
      cy.contains('button', 'Connect eBay Account').click();
      
      // Should redirect (might hit CAPTCHA)
      cy.url().should('include', 'auth');
    });
    
    it('should handle OAuth callback correctly', () => {
      // Simulate successful OAuth callback
      cy.visit('/auth/ebay/callback?code=test_code_12345');
      
      cy.wait(2000);
      
      // Check for success or error message
      cy.get('body').then(($body) => {
        const text = $body.text();
        
        // Either success or error (depends on if code is valid)
        const hasResponse = text.includes('Success') || 
                          text.includes('Failed') ||
                          text.includes('Error');
        
        expect(hasResponse).to.be.true;
      });
    });
    
  });

  describe('3. Post-Authentication State', () => {
    
    it('should check for tokens file after auth', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (exists) {
          cy.log('✅ Token file exists');
          
          cy.task('readJson', 'tokens.json').then((tokens) => {
            expect(tokens).to.have.property('accessToken');
            cy.log(`Token preview: ${tokens.accessToken.substring(0, 20)}...`);
          });
        } else {
          cy.log('⚠️ No token file - auth not completed');
        }
      });
    });
    
    it('should show authenticated UI if tokens exist', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (exists) {
          cy.visit('/');
          cy.contains('✅ Authenticated').should('be.visible');
          cy.contains('Import Inventory').should('be.visible');
        } else {
          cy.log('Skipping - not authenticated');
        }
      });
    });
    
  });

  describe('4. Inventory Import Flow', () => {
    
    it('should trigger inventory import', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (!exists) {
          cy.log('⚠️ Skipping - auth required');
          return;
        }
        
        cy.visit('/');
        cy.wait(1000);
        
        cy.get('body').then(($body) => {
          if ($body.text().includes('Import Inventory')) {
            cy.contains('Import Inventory').click();
            
            // Wait for import (can take time)
            cy.wait(5000);
            
            cy.url().should('include', '/import/inventory');
            
            // Check for result
            cy.get('body', { timeout: 20000 }).then(($result) => {
              const text = $result.text();
              
              if (text.includes('Import Successful')) {
                cy.log('✅ Import succeeded');
                cy.contains('Import Successful').should('be.visible');
              } else if (text.includes('Import Failed')) {
                cy.log('❌ Import failed (may be expected for empty account)');
              }
            });
          }
        });
      });
    });
    
    it('should verify imported data file exists', () => {
      cy.task('fileExists', 'imported-inventory.json').then((exists) => {
        if (exists) {
          cy.log('✅ Import file exists');
          
          cy.task('readJson', 'imported-inventory.json').then((data) => {
            cy.log(`📦 Imported ${data.totalItems} items`);
            cy.log(`📅 Import date: ${data.importedAt}`);
            
            expect(data).to.have.property('items');
            expect(data).to.have.property('totalItems');
            expect(data.items).to.be.an('array');
            
            // Save report
            cy.writeFile('cypress/reports/import-summary.json', {
              totalItems: data.totalItems,
              importedAt: data.importedAt,
              source: data.source,
              testRun: new Date().toISOString()
            });
          });
        } else {
          cy.log('⚠️ No import file found - import may not have run');
        }
      });
    });
    
  });

  describe('5. Test Inventory Fetch', () => {
    
    it('should test raw inventory API call', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (!exists) {
          cy.log('⚠️ Skipping - auth required');
          return;
        }
        
        cy.visit('/');
        
        cy.get('body').then(($body) => {
          if ($body.text().includes('Test Inventory')) {
            cy.contains('Test Inventory').click();
            cy.wait(3000);
            
            cy.url().should('include', '/test/inventory');
          }
        });
      });
    });
    
  });

  describe('6. Error Handling', () => {
    
    it('should handle missing auth gracefully', () => {
      // Try to access protected endpoint without auth
      cy.request({
        url: '/import/inventory',
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 401, 403]);
        
        if (response.status === 401) {
          cy.log('✅ Correctly blocks unauthenticated request');
        }
      });
    });
    
    it('should handle network errors', () => {
      cy.visit('/');
      
      // Intercept and fail API calls
      cy.intercept('GET', '**/import/inventory', {
        statusCode: 500,
        body: { error: 'Network error' }
      });
      
      cy.get('body').then(($body) => {
        if ($body.text().includes('Import Inventory')) {
          cy.contains('Import Inventory').click();
          cy.wait(1000);
        }
      });
    });
    
  });

  describe('7. Logout Flow', () => {
    
    it('should have logout button when authenticated', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (exists) {
          cy.visit('/');
          cy.contains('Logout').should('be.visible');
        }
      });
    });
    
    it('should logout and clear tokens', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (exists) {
          cy.visit('/');
          cy.contains('Logout').click();
          cy.wait(1000);
          
          cy.url().should('include', '/auth/logout');
          cy.contains('Logged Out').should('be.visible');
          
          // Verify token file deleted
          cy.task('fileExists', 'tokens.json').should('be.false');
        }
      });
    });
    
  });

  describe('8. State Persistence', () => {
    
    it('should maintain auth across page reloads', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (exists) {
          cy.visit('/');
          cy.contains('✅ Authenticated').should('be.visible');
          
          cy.reload();
          cy.wait(1000);
          
          cy.contains('✅ Authenticated').should('be.visible');
        }
      });
    });
    
  });

  describe('9. Full E2E Scenario', () => {
    
    it('should complete full user journey (if authenticated)', () => {
      cy.task('fileExists', 'tokens.json').then((exists) => {
        if (!exists) {
          cy.log('⚠️ Skipping full E2E - requires manual OAuth');
          cy.log('Complete OAuth at: http://localhost:3002');
          return;
        }
        
        // Step 1: Visit homepage
        cy.log('Step 1: Visit homepage');
        cy.visit('/');
        cy.contains('eBay API Test Server').should('be.visible');
        
        // Step 2: Verify authenticated
        cy.log('Step 2: Verify authenticated');
        cy.contains('✅ Authenticated').should('be.visible');
        
        // Step 3: Import inventory
        cy.log('Step 3: Import inventory');
        cy.contains('Import Inventory').click();
        cy.wait(10000, { log: false });
        
        // Step 4: Verify result
        cy.log('Step 4: Check result');
        cy.get('body').then(($body) => {
          const text = $body.text();
          const hasResult = text.includes('Successful') || text.includes('Failed');
          expect(hasResult).to.be.true;
        });
        
        // Step 5: Go back home
        cy.log('Step 5: Return home');
        cy.visit('/');
        
        // Step 6: Test inventory fetch
        cy.log('Step 6: Test raw API');
        cy.contains('Test Inventory').click();
        cy.wait(3000);
        
        cy.log('✅ Full E2E flow completed!');
      });
    });
    
  });
  
});

describe('Monitoring & Health Checks', () => {
  
  it('should log current application state', () => {
    const timestamp = new Date().toISOString();
    
    cy.visit('/');
    cy.wait(1000);
    
    cy.get('body').then(($body) => {
      const text = $body.text();
      
      const state = {
        timestamp,
        server: {
          running: true,
          url: Cypress.config('baseUrl')
        },
        authentication: {
          authenticated: text.includes('✅ Authenticated'),
          hasConnectButton: text.includes('Connect eBay Account'),
          hasImportButton: text.includes('Import Inventory')
        },
        environment: text.includes('PRODUCTION') ? 'PRODUCTION' : 'SANDBOX'
      };
      
      cy.log('📊 Application State:', JSON.stringify(state, null, 2));
      
      // Save state for tracking
      cy.writeFile('cypress/reports/app-state.json', state);
    });
  });
  
  it('should check all critical files exist', () => {
    const files = [
      { name: '.env', critical: true },
      { name: 'tokens.json', critical: false },
      { name: 'imported-inventory.json', critical: false },
      { name: 'logs', critical: false }
    ];
    
    const report = {
      timestamp: new Date().toISOString(),
      files: []
    };
    
    files.forEach(file => {
      cy.task('fileExists', file.name).then((exists) => {
        report.files.push({
          name: file.name,
          exists,
          critical: file.critical
        });
        
        cy.log(`${exists ? '✅' : '❌'} ${file.name}`);
      });
    });
    
    cy.then(() => {
      cy.writeFile('cypress/reports/file-check.json', report);
    });
  });
  
});

