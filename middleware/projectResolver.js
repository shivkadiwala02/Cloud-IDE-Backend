const path = require('path');
const fs = require('fs-extra');
const Project = require('../models/Project');

/**
 * Middleware to validate and resolve project paths
 * Ensures users can only access their own projects
 */
const projectResolver = async (req, res, next) => {
  try {
    // Check for project name in both query params and request body
    const projectName = req.query.project || (req.body && req.body.project);
    
    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // Log where we found the project name
    console.log(`Project name '${projectName}' found in ${req.query.project ? 'query params' : 'request body'}`);
    
    // Find the project in the database
    const project = await Project.findOne({ 
      userId: req.userId,
      name: projectName 
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Verify the project path exists
    await fs.ensureDir(project.path);
    
    // Add project to request object
    req.project = project;
    req.projectPath = project.path;
    
    // If a file is specified, validate it's within the project directory
    if (req.params.name || req.query.file) {
      // Handle file path, which might be nested (e.g., 'src/components/main.jsx')
      const fileName = req.params.name || req.query.file;
      // Make sure to use the actual file path format that's coming from the client
      const filePath = path.join(project.path, fileName);
      
      console.log('Resolving file path:', { fileName, filePath, projectPath: project.path });
      
      // Security check: ensure the resolved path is within the project directory
      const normalizedFilePath = path.normalize(filePath);
      const normalizedProjectPath = path.normalize(project.path);
      
      if (!normalizedFilePath.startsWith(normalizedProjectPath)) {
        return res.status(403).json({ error: 'Invalid file path' });
      }
      
      req.filePath = filePath;
    }
    
    // Update last accessed timestamp
    project.lastAccessed = Date.now();
    await project.save();
    
    next();
  } catch (error) {
    console.error('Project resolver error:', error);
    res.status(500).json({ error: 'Error resolving project' });
  }
};

module.exports = projectResolver;
