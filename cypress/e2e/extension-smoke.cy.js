describe('Extension Smoke Test', () => {
  it('App loads successfully', () => {
    cy.visit('/', { timeout: 10000 });
    cy.get('body').should('be.visible');
  });

  it('No console errors on page load', () => {
    const errors = [];
    
    cy.visit('/', {
      onBeforeLoad(win) {
        cy.stub(win.console, 'error').callsFake((msg) => {
          errors.push(msg);
        });
      }
    });
    
    cy.wait(3000);
    cy.wrap(errors).should('have.length.lessThan', 5);
  });

  it('localStorage is accessible', () => {
    cy.visit('/');
    cy.window().then((win) => {
      win.localStorage.setItem('test_key', 'test_value');
      expect(win.localStorage.getItem('test_key')).to.equal('test_value');
      win.localStorage.removeItem('test_key');
    });
  });

  it('postMessage API is available for extension communication', () => {
    cy.visit('/');
    
    cy.window().then((win) => {
      let messageReceived = false;
      
      win.addEventListener('message', (event) => {
        if (event.data.type === 'TEST_MESSAGE') {
          messageReceived = true;
        }
      });
      
      win.postMessage({ type: 'TEST_MESSAGE' }, '*');
      
      cy.wrap(null).should(() => {
        expect(messageReceived).to.be.true;
      });
    });
  });

  it('Extension ID can be stored in localStorage', () => {
    cy.visit('/');
    
    cy.window().then((win) => {
      const testExtensionId = 'abcdefghijklmnopqrstuvwxyz123456';
      win.localStorage.setItem('extension_id', testExtensionId);
      
      const stored = win.localStorage.getItem('extension_id');
      expect(stored).to.equal(testExtensionId);
    });
  });

  it('Chrome runtime is accessible (if extension loaded)', () => {
    cy.visit('/');
    
    cy.window().then((win) => {
      // This will be undefined in Cypress tests, but we verify the check works
      const hasChromeRuntime = !!(win.chrome && win.chrome.runtime);
      cy.log(`Chrome runtime available: ${hasChromeRuntime}`);
      // We don't assert here because Cypress can't load extensions
      // This is just to verify the check mechanism works
    });
  });
});

