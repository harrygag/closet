// Custom Cypress commands

// Login command for Supabase auth
Cypress.Commands.add('login', (email, password) => {
  cy.session([email, password], () => {
    cy.visit('/');
    // Wait for Supabase to load
    cy.window().its('supabase').should('exist');
    
    cy.window().then(async (win) => {
      const { data, error } = await win.supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      expect(data.session).to.exist;
      expect(data.session.access_token).to.exist;
    });
  });
});

// Bypass auth for testing (mock authenticated state)
Cypress.Commands.add('bypassAuth', () => {
  cy.intercept('POST', '**/auth/v1/token*', {
    statusCode: 200,
    body: {
      access_token: 'mock-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      user: {
        id: 'test-user-123',
        email: 'test@example.com',
        aud: 'authenticated',
        role: 'authenticated'
      }
    }
  });
  
  cy.intercept('GET', '**/auth/v1/user*', {
    statusCode: 200,
    body: {
      id: 'test-user-123',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated'
    }
  });
});

// Get auth token
Cypress.Commands.add('getAuthToken', () => {
  cy.window().then(async (win) => {
    const { data } = await win.supabase.auth.getSession();
    return data.session?.access_token;
  });
});

// Mock extension connection
Cypress.Commands.add('mockExtension', (extensionId = 'test-extension-id-123') => {
  cy.window().then((win) => {
    // Mock postMessage to simulate extension
    win.postMessage({ 
      type: 'CLOSET_EXTENSION_ID', 
      extensionId 
    }, '*');
    
    // Mock chrome.runtime for extension messages
    if (!win.chrome) {
      win.chrome = {};
    }
    if (!win.chrome.runtime) {
      win.chrome.runtime = {
        sendMessage: (id, message, callback) => {
          // Simulate extension responses
          setTimeout(() => {
            if (message.type === 'PING') {
              callback({ success: true, message: 'PONG', version: '1.0.2' });
            } else if (message.type === 'GET_STATUS') {
              callback({ 
                success: true, 
                extensionId: id,
                isAuthenticated: true,
                marketplaces: {}
              });
            } else {
              callback({ success: true });
            }
          }, 100);
        }
      };
    }
  });
});

// Intercept API calls
Cypress.Commands.add('interceptMarketplaceAPI', () => {
  cy.intercept('POST', '**/api/marketplace/save-credentials').as('saveCreds');
  cy.intercept('POST', '**/api/ebay/import').as('importItems');
  cy.intercept('POST', '**/api/ebay/oauth-url').as('getOAuthUrl');
});

