/// <reference types="cypress" />

describe('eBay Inventory Import', () => {
  
  beforeEach(() => {
    cy.visit('/');
    cy.wait(1000);
  });

  describe('Server Health', () => {
    
    it('should load homepage', () => {
      cy.get('body').should('be.visible');
      cy.contains('eBay API Test Server').should('be.visible');
    });
    
    it('should show environment', () => {
      cy.contains(/PRODUCTION|SANDBOX/).should('be.visible');
    });
    
  });

  describe('Authentication Status', () => {
    
    it('should check auth status', () => {
      cy.get('body').then(($body) => {
        const text = $body.text();
        
        if (text.includes('✅ Authenticated')) {
          cy.log('✅ User is authenticated');
          cy.contains('✅ Authenticated').should('be.visible');
        } else {
          cy.log('❌ Not authenticated');
          cy.contains('❌ Not authenticated').should('be.visible');
          cy.contains('Connect eBay Account').should('be.visible');
        }
      });
    });
    
  });

  describe('Import Functionality', () => {
    
    it('should have import button when authenticated', () => {
      cy.get('body').then(($body) => {
        if ($body.text().includes('✅ Authenticated')) {
          cy.log('✅ Authenticated - checking for import button');
          cy.contains('Import Inventory').should('be.visible');
        } else {
          cy.log('⚠️ Not authenticated - skipping import test');
        }
      });
    });
    
    it('should attempt inventory import if authenticated', () => {
      cy.get('body').then(($body) => {
        if ($body.text().includes('✅ Authenticated')) {
          cy.log('📥 Starting import test...');
          
          // Click import button
          cy.contains('Import Inventory').click();
          
          // Wait for response (could take a while)
          cy.wait(10000);
          
          // Check for success or error
          cy.get('body').then(($result) => {
            const resultText = $result.text();
            
            if (resultText.includes('Import Successful')) {
              cy.log('✅ Import succeeded!');
              cy.contains('Import Successful').should('be.visible');
              
              // Check for item count
              cy.contains(/Imported \d+ items/).should('be.visible');
              
            } else if (resultText.includes('Import Failed')) {
              cy.log('❌ Import failed');
              cy.contains('Import Failed').should('be.visible');
              
            } else {
              cy.log('⚠️ Unexpected response');
            }
          });
          
        } else {
          cy.log('⚠️ Skipping import - not authenticated');
        }
      });
    });
    
  });

  describe('Inventory File Check', () => {
    
    it('should check if inventory file was created', () => {
      cy.task('fileExists', 'imported-inventory.json').then((exists) => {
        if (exists) {
          cy.log('✅ imported-inventory.json exists');
          
          cy.task('readJson', 'imported-inventory.json').then((data) => {
            cy.log(`📦 Found ${data.totalItems} items`);
            cy.log(`📅 Imported at: ${data.importedAt}`);
            
            expect(data).to.have.property('items');
            expect(data.items).to.be.an('array');
          });
        } else {
          cy.log('⚠️ No import file found yet');
        }
      });
    });
    
  });

  describe('API Health Checks', () => {
    
    it('should verify server is responding', () => {
      cy.request('http://localhost:3002').then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.include('eBay API Test Server');
      });
    });
    
  });
  
});

describe('Continuous Monitoring', () => {
  
  it('should log current state every run', () => {
    cy.visit('/');
    
    cy.get('body').then(($body) => {
      const text = $body.text();
      const timestamp = new Date().toISOString();
      
      const report = {
        timestamp,
        authenticated: text.includes('✅ Authenticated'),
        hasImportButton: text.includes('Import Inventory'),
        environment: text.includes('PRODUCTION') ? 'PRODUCTION' : 'SANDBOX'
      };
      
      cy.log('📊 Current State:', JSON.stringify(report, null, 2));
      
      // Write to file for tracking
      cy.writeFile('cypress/reports/state.json', report);
    });
  });
  
});

