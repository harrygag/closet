describe('Navigation Tests', () => {
  beforeEach(() => {
    // Mock Supabase getSession
    cy.intercept('GET', '**hqmujfbifgpcyqmpuwil.supabase.co/auth/v1/session*', {
      statusCode: 200,
      body: {
        access_token: 'mock-token',
        user: {
          id: 'test-user-123',
          email: 'test@example.com',
          created_at: new Date().toISOString()
        }
      }
    });
    
    cy.visit('/closet');
    // Wait for app to initialize
    cy.get('nav', { timeout: 10000 }).should('exist');
  });

  it('should show navigation bar with all links', () => {
    cy.contains('Virtual Closet').should('be.visible');
    cy.contains('Inventory').should('be.visible');
    cy.contains('eBay').should('be.visible');
    cy.contains('Sign Out').should('be.visible');
  });

  it('should navigate to Inventory page', () => {
    cy.contains('Inventory').click();
    cy.url().should('include', '/closet');
  });

  it('should navigate to eBay page', () => {
    cy.contains('eBay').click();
    cy.url().should('include', '/ebay');
    cy.contains('eBay Integration').should('be.visible');
    cy.contains('Connect eBay Account').should('be.visible');
  });

  it('should highlight active route', () => {
    cy.contains('a', 'Inventory').should('have.class', 'bg-purple-600');
    
    cy.contains('eBay').click();
    cy.contains('a', 'eBay').should('have.class', 'bg-purple-600');
  });

  it('should show user email in navigation', () => {
    cy.get('nav').should('contain', '@');
  });
});

