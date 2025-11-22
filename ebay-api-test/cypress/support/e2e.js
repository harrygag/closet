// Cypress support file

// Import commands
import './commands';

// Custom logging
Cypress.on('test:before:run', (test) => {
  console.log(`\n🧪 Starting: ${test.title}\n`);
});

Cypress.on('test:after:run', (test, runnable) => {
  console.log(`\n${test.state === 'passed' ? '✅' : '❌'} ${test.title}\n`);
});

