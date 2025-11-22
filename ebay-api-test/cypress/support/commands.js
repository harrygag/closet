// Custom Cypress commands for eBay API testing

Cypress.Commands.add('checkAuthStatus', () => {
  cy.get('body').then(($body) => {
    return $body.text().includes('✅ Authenticated');
  });
});

Cypress.Commands.add('waitForImport', (timeout = 15000) => {
  cy.wait(timeout);
  cy.get('body').should('be.visible');
});

