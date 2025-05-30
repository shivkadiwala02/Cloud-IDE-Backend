// Development server script
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if nodemon is installed
try {
  require.resolve('nodemon');
  console.log('Starting server with nodemon for auto-reloading...');
  
  // Start server with nodemon
  const nodemon = spawn('npx', ['nodemon', 'server.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  nodemon.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
} catch (err) {
  console.log('Nodemon not found, starting server with node...');
  console.log('To enable auto-reloading, install nodemon: npm install -g nodemon');
  
  // Start server with regular node
  const node = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  node.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}
