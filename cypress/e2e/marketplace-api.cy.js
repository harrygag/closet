describe('Marketplace API Tests', () => {
  const API_URL = Cypress.env('API_URL') || 'http://localhost:3001';
  
  before(() => {
    // Verify API is running
    cy.request(`${API_URL}/health`)
      .its('status')
      .should('eq', 200);
  });

  describe('Health Check', () => {
    it('should return server status', () => {
      cy.request(`${API_URL}/health`).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('status', 'ok');
        expect(response.body).to.have.property('timestamp');
      });
    });
  });

  describe('Save Marketplace Credentials', () => {
    let authToken;

    before(() => {
      // Get auth token from Supabase login
      cy.visit('/');
      cy.window().then((win) => {
        // Assuming user is logged in, get token
        return win.supabase.auth.getSession();
      }).then((result) => {
        authToken = result.data.session?.access_token;
        expect(authToken).to.exist;
      });
    });

    it('should reject requests without auth token', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/marketplace/save-credentials`,
        body: {
          marketplace: 'ebay',
          cookies: [{ name: 'test', value: 'test' }],
          email: 'test@example.com'
        },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body.error).to.include('authorization');
      });
    });

    it('should save marketplace credentials with valid auth', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/marketplace/save-credentials`,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          marketplace: 'ebay',
          cookies: [
            { name: 'test_cookie', value: 'test_value', domain: '.ebay.com' },
            { name: 'session_id', value: 'abc123', domain: '.ebay.com' }
          ],
          email: 'test@ebay.com',
          autoSynced: true
        }
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.success).to.be.true;
        expect(response.body.action).to.eq('saved');
      });
    });

    it('should reject invalid marketplace names', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/marketplace/save-credentials`,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          marketplace: 'invalid_marketplace',
          cookies: [{ name: 'test', value: 'test' }],
          email: 'test@example.com'
        },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body.error).to.include('Invalid marketplace');
      });
    });

    it('should reject empty cookies array', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/marketplace/save-credentials`,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          marketplace: 'ebay',
          cookies: [],
          email: 'test@example.com'
        },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(400);
      });
    });
  });

  describe('eBay OAuth Flow', () => {
    let authToken;

    before(() => {
      cy.visit('/');
      cy.window().then((win) => {
        return win.supabase.auth.getSession();
      }).then((result) => {
        authToken = result.data.session?.access_token;
      });
    });

    it('should generate eBay OAuth URL', () => {
      // This tests server/index.js OAuth endpoints
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/ebay/oauth-url`,
        body: {
          userId: 'test-user-id'
        }
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.url).to.include('auth.ebay.com');
        expect(response.body.url).to.include('oauth2/authorize');
        expect(response.body.sessionId).to.eq('test-user-id');
      });
    });

    it('should check eBay connection status', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/api/ebay/check-connection`,
        body: {
          userId: 'test-user-id'
        }
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('connected');
      });
    });
  });
});

