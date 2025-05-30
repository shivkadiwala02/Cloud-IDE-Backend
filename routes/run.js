const express = require('express');
const router = express.Router();
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;

// Base path for project files
const projectPath = path.join(__dirname, '..', 'projects', 'default');

// Run code endpoint
router.post('/', async (req, res) => {
  const { filename, language = 'javascript' } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }
  
  const filePath = path.join(projectPath, filename);
  
  try {
    // Check if file exists
    await fs.access(filePath);
    
    // Set up a reference to the Socket.IO instance
    const io = req.app.get('io');
    
    // Determine command and arguments based on language
    let command, args;
    if (language === 'javascript') {
      command = 'node';
      args = [filePath];
    } else if (language === 'python') {
      command = 'python';
      args = [filePath];
    } else {
      return res.status(400).json({ error: 'Unsupported language' });
    }
    
    // Create a unique execution ID for this run
    const executionId = Date.now().toString();
    
    // Spawn child process to run the code
    const childProcess = spawn(command, args);
    
    // Send process started event
    if (io) {
      io.emit('execution_started', { id: executionId, filename });
    }
    
    // Set up event handlers for process output
    childProcess.stdout.on('data', (data) => {
      if (io) {
        io.emit('process_output', {
          id: executionId,
          type: 'stdout',
          data: data.toString()
        });
      }
    });
    
    childProcess.stderr.on('data', (data) => {
      if (io) {
        io.emit('process_output', {
          id: executionId,
          type: 'stderr',
          data: data.toString()
        });
      }
    });
    
    // Handle process completion
    childProcess.on('close', (code) => {
      if (io) {
        io.emit('execution_completed', {
          id: executionId,
          exitCode: code,
          success: code === 0
        });
      }
    });
    
    // Respond with execution ID
    res.json({
      success: true,
      executionId,
      message: 'Code execution started'
    });
    
  } catch (err) {
    console.error(`Error running file ${filename}:`, err);
    res.status(404).json({ error: 'File not found or could not be executed' });
  }
});

module.exports = router;
