const { defineConfig } = require('cypress');

module.exports = defineConfig({
  projectId: "2pe6km",
  
  e2e: {
    baseUrl: 'http://localhost:5173',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    
    env: {
      API_URL: 'http://localhost:3001',
      SUPABASE_URL: 'https://hqmujfbifgpcyqmpuwil.supabase.co',
      // Add test credentials in cypress.env.json (not committed)
    },

    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },

  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite',
    },
  },
});

