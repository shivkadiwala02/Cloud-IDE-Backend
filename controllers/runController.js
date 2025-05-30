const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const Project = require('../models/Project');

// Store active processes
const activeProcesses = new Map();

/**
 * Run code file and stream output via Socket.IO
 */
exports.runCode = async (req, res) => {
  try {
    // Get project and file information
    const projectPath = req.projectPath;
    const fileName = req.query.file;
    
    // Build the correct absolute file path
    const filePath = path.join(projectPath, fileName);
    
    console.log('Running code for file:', { filePath, projectPath, fileName });
    
    const { language = 'javascript' } = req.body;
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Set up a reference to the Socket.IO instance
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({ error: 'Socket.IO not available' });
    }
    
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
    const childProcess = spawn(command, args, {
      cwd: path.dirname(filePath), // Run in the file's directory
      env: { ...process.env, NODE_OPTIONS: '--no-warnings' } // Suppress Node.js warnings like punycode deprecation
    });
    
    // Send initial info message
    io.to(req.userId.toString()).emit('process_output', {
      id: executionId,
      type: 'info',
      data: `Running ${path.basename(filePath)} with Node.js...\n`
    });
    
    // Send process started event to the user's room
    io.to(req.userId.toString()).emit('execution_started', { 
      id: executionId, 
      filename: path.basename(filePath),
      project: req.project.name
    });
    
    // Set up event handlers for process output
    childProcess.stdout.on('data', (data) => {
      io.to(req.userId.toString()).emit('process_output', {
        id: executionId,
        type: 'stdout',
        data: data.toString()
      });
    });
    
    childProcess.stderr.on('data', (data) => {
      io.to(req.userId.toString()).emit('process_output', {
        id: executionId,
        type: 'stderr',
        data: data.toString()
      });
    });
    
    // Handle process completion
    childProcess.on('close', (code) => {
      io.to(req.userId.toString()).emit('execution_completed', {
        id: executionId,
        exitCode: code,
        success: code === 0
      });
    });
    
    // Respond with execution ID
    res.json({
      success: true,
      executionId,
      message: 'Code execution started'
    });
    
  } catch (error) {
    console.error('Run code error:', error);
    res.status(500).json({ error: 'Error executing code' });
  }
};

/**
 * Run npm command (start, build, dev, etc.) for frontend or backend
 */
exports.runCommand = async (req, res) => {
  try {
    const { project: projectName, command, type = 'both' } = req.body;
    
    if (!projectName || !command) {
      return res.status(400).json({ error: 'Project name and command are required' });
    }
    
    // Find the project
    const project = await Project.findOne({ 
      userId: req.userId,
      name: projectName 
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Determine the working directory based on the command type
    let workingDir;
    
    if (type === 'frontend') {
      // For frontend commands, assume the project has a client directory
      workingDir = path.join(project.path, 'client');
    } else if (type === 'backend') {
      // For backend commands, use the project root or server directory if it exists
      const serverDir = path.join(project.path, 'server');
      try {
        await fs.access(serverDir);
        workingDir = serverDir;
      } catch {
        workingDir = project.path;
      }
    } else {
      // Default to project root
      workingDir = project.path;
    }
    
    // Verify directory exists
    try {
      await fs.access(workingDir);
    } catch {
      return res.status(404).json({ 
        error: `Directory not found: ${workingDir}. Make sure your project has the correct structure.` 
      });
    }
    
    // Parse the command and arguments
    const [cmd, ...args] = command.split(' ');
    
    // Get Socket.IO instance
    const io = req.app.get('io');
    
    if (!io) {
      return res.status(500).json({ error: 'Socket.IO not available' });
    }
    
    // Create a unique execution ID
    const executionId = Date.now().toString();
    
    // Spawn the process
    const childProcess = spawn(cmd, args, {
      cwd: workingDir,
      shell: true // This is important for npm commands
    });
    
    // Store the process
    activeProcesses.set(executionId, {
      process: childProcess,
      projectId: project._id,
      userId: req.userId,
      command,
      type
    });
    
    // Send terminal output to the client via Socket.IO
    childProcess.stdout.on('data', (data) => {
      io.to(req.userId.toString()).emit('terminal_output', {
        id: executionId,
        type: 'stdout',
        data: data.toString()
      });
    });
    
    childProcess.stderr.on('data', (data) => {
      io.to(req.userId.toString()).emit('terminal_output', {
        id: executionId,
        type: 'stderr',
        data: data.toString()
      });
    });
    
    // Handle process completion
    childProcess.on('close', (code) => {
      io.to(req.userId.toString()).emit('execution_completed', {
        id: executionId,
        exitCode: code,
        success: code === 0
      });
      
      // Remove from active processes
      activeProcesses.delete(executionId);
    });
    
    // Respond with execution ID
    res.json({
      success: true,
      executionId,
      message: `Command execution started: ${command}`,
      workingDirectory: workingDir
    });
  } catch (error) {
    console.error('Run command error:', error);
    res.status(500).json({ error: 'Error executing command' });
  }
};

/**
 * Stop a running process
 */
exports.stopCommand = async (req, res) => {
  try {
    const { executionId } = req.body;
    
    if (!executionId) {
      return res.status(400).json({ error: 'Execution ID is required' });
    }
    
    // Check if process exists and belongs to this user
    const processInfo = activeProcesses.get(executionId);
    
    if (!processInfo) {
      return res.status(404).json({ error: 'Process not found' });
    }
    
    if (processInfo.userId.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Not authorized to stop this process' });
    }
    
    // Kill the process
    if (processInfo.process) {
      processInfo.process.kill();
      activeProcesses.delete(executionId);
      
      // Notify client
      const io = req.app.get('io');
      if (io) {
        io.to(req.userId.toString()).emit('execution_completed', {
          id: executionId,
          exitCode: -1, // Special code for terminated
          success: false,
          terminated: true
        });
      }
      
      res.json({
        success: true,
        message: 'Process terminated'
      });
    } else {
      activeProcesses.delete(executionId);
      res.status(400).json({ error: 'Invalid process' });
    }
  } catch (error) {
    console.error('Stop command error:', error);
    res.status(500).json({ error: 'Error stopping command' });
  }
};
