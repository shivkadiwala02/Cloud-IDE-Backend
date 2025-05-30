const Project = require('../models/Project');
const path = require('path');
const fs = require('fs-extra');
const simpleGit = require('simple-git');

/**
 * Create a new project
 */
exports.createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Input validation
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // Check if project with same name already exists for this user
    const existingProject = await Project.findOne({ 
      userId: req.userId, 
      name 
    });
    
    if (existingProject) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    
    // Create project directory
    const userDir = path.join(process.env.USER_DATA_PATH, req.userId.toString());
    const projectDir = path.join(userDir, name);
    
    // Ensure user directory exists
    await fs.ensureDir(userDir);
    
    // Check if directory already exists
    if (await fs.pathExists(projectDir)) {
      return res.status(400).json({ error: 'Project directory already exists' });
    }
    
    // Create project directory
    await fs.ensureDir(projectDir);
    
    // Create a default file
    const defaultFilePath = path.join(projectDir, 'index.js');
    const defaultContent = '// Welcome to your new project!\n\nconsole.log("Hello, world!");\n';
    await fs.writeFile(defaultFilePath, defaultContent);
    
    // Create project in database
    const project = new Project({
      userId: req.userId,
      name,
      description: description || `Project ${name}`,
      path: projectDir
    });
    
    await project.save();
    
    res.status(201).json({
      message: 'Project created successfully',
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt
      }
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Error creating project' });
  }
};

/**
 * Get all projects for the current user
 */
exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.userId })
      .sort({ lastAccessed: -1 })
      .select('name description isGitRepo gitUrl createdAt lastAccessed');
    
    res.json({ projects });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
};

/**
 * Get a single project by name
 */
exports.getProject = async (req, res) => {
  try {
    // The project is already loaded by the projectResolver middleware
    const project = req.project;
    
    res.json({
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        isGitRepo: project.isGitRepo,
        gitUrl: project.gitUrl,
        createdAt: project.createdAt,
        lastAccessed: project.lastAccessed
      }
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Error fetching project' });
  }
};

/**
 * Delete a project
 */
exports.deleteProject = async (req, res) => {
  try {
    const { projectName } = req.params;
    
    if (!projectName) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    // Find the project
    const project = await Project.findOne({ 
      userId: req.userId,
      name: projectName 
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Remove project directory
    await fs.remove(project.path);
    
    // Remove project from database
    await Project.deleteOne({ _id: project._id });
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Error deleting project' });
  }
};

/**
 * Clone a GitHub repository
 */
exports.cloneRepository = async (req, res) => {
  try {
    const { repoUrl, projectName } = req.body;
    
    // Input validation
    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }
    
    // Generate project name from repo URL if not provided
    let name = projectName;
    if (!name) {
      // Extract repo name from URL (e.g., 'repo-name' from 'https://github.com/user/repo-name.git')
      const match = repoUrl.match(/\/([^\/]+?)(\.git)?$/);
      if (match && match[1]) {
        name = match[1];
      } else {
        name = `github-repo-${Date.now()}`;
      }
    }
    
    // Check if project with same name already exists
    const existingProject = await Project.findOne({ 
      userId: req.userId, 
      name 
    });
    
    if (existingProject) {
      return res.status(400).json({ error: 'Project name already exists' });
    }
    
    // Create user directory if it doesn't exist
    const userDir = path.join(process.env.USER_DATA_PATH, req.userId.toString());
    await fs.ensureDir(userDir);
    
    // Define project directory
    const projectDir = path.join(userDir, name);
    
    // Clone the repository
    const git = simpleGit();
    
    // Emit progress via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      io.to(req.userId.toString()).emit('clone_started', { 
        repoUrl,
        projectName: name 
      });
    }
    
    // Clone the repository
    await git.clone(repoUrl, projectDir);
    
    // Create project in database
    const project = new Project({
      userId: req.userId,
      name,
      description: `Cloned from ${repoUrl}`,
      path: projectDir,
      isGitRepo: true,
      gitUrl: repoUrl
    });
    
    await project.save();
    
    // Notify client of completion
    if (io) {
      io.to(req.userId.toString()).emit('clone_completed', { 
        projectId: project._id,
        projectName: name
      });
    }
    
    res.status(201).json({
      message: 'Repository cloned successfully',
      project: {
        id: project._id,
        name: project.name,
        description: project.description,
        isGitRepo: project.isGitRepo,
        gitUrl: project.gitUrl,
        createdAt: project.createdAt
      }
    });
  } catch (error) {
    console.error('Clone repository error:', error);
    
    // Notify client of error
    const io = req.app.get('io');
    if (io) {
      io.to(req.userId.toString()).emit('clone_error', { 
        error: error.message || 'Error cloning repository'
      });
    }
    
    res.status(500).json({ error: 'Error cloning repository' });
  }
};
