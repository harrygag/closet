import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const reset = '\x1b[0m';

console.log(`${cyan}Starting Virtual Closet Development Environment...${reset}\n`);

// Start Backend Server
console.log(`${green}► Starting Backend Server (Port 3000)...${reset}`);
const server = spawn('node', ['server/api.js'], { 
  stdio: 'inherit',
  shell: true 
});

// Start Frontend (Vite)
console.log(`${green}► Starting Frontend (Port 5173)...${reset}`);
const vite = spawn('npm', ['run', 'dev:vite'], { 
  stdio: 'inherit', 
  shell: true 
});

// Handle cleanup
const cleanup = () => {
  console.log(`\n${cyan}Shutting down services...${reset}`);
  server.kill();
  vite.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

