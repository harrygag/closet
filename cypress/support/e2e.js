// Import commands.js using ES2015 syntax:
import './commands'

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Prevent uncaught exceptions from failing tests
Cypress.on('uncaught:exception', (err, runnable) => {
  // returning false here prevents Cypress from failing the test
  // we handle extension context loss gracefully
  if (err.message.includes('Extension context')) {
    return false
  }
  if (err.message.includes('Receiving end does not exist')) {
    return false
  }
  return true
})

