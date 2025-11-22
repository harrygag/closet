import { defineConfig } from 'cypress';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  projectId: "2pe6km",
  e2e: {
    baseUrl: 'http://localhost:3002',
    setupNodeEvents(on, config) {
      // File system tasks
      on('task', {
        fileExists(filename) {
          const filePath = path.join(__dirname, filename);
          return fs.existsSync(filePath);
        },
        readJson(filename) {
          const filePath = path.join(__dirname, filename);
          if (!fs.existsSync(filePath)) {
            return null;
          }
          return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      });
      
      return config;
    },
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
  },
  env: {
    recordKey: '79b6b242-7610-47d0-b1a6-430738a87697'
  }
});

