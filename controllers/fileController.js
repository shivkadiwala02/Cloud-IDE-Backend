const path = require('path');
const fs = require('fs-extra');

/**
 * Get list of files in a project
 */
exports.getFiles = async (req, res) => {
  try {
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const { path: relativePath = '' } = req.query;
    
    // Calculate the full path to scan
    const fullPath = path.join(projectPath, relativePath);
    
    // Check if path exists and is within the project directory
    if (!fullPath.startsWith(projectPath)) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    
    try {
      await fs.access(fullPath);
    } catch (err) {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    // Read directory contents
    const items = await fs.readdir(fullPath);
    
    // Get detailed info for each item
    const fileList = await Promise.all(
      items.map(async (item) => {
        const itemPath = path.join(fullPath, item);
        const stats = await fs.stat(itemPath);
        const relativePath = path.relative(projectPath, itemPath);
        
        return {
          name: item,
          path: relativePath.replace(/\\/g, '/'),  // Normalize path separators for frontend
          isDirectory: stats.isDirectory(),
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
    );
    
    res.json(fileList);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Error retrieving files' });
  }
};

/**
 * Get recursive directory structure (file tree)
 */
exports.getFileTree = async (req, res) => {
  try {
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    
    // Function to recursively scan directories
    const scanDirectory = async (dirPath) => {
      const items = await fs.readdir(dirPath);
      
      const result = await Promise.all(
        items.map(async (item) => {
          const itemPath = path.join(dirPath, item);
          const stats = await fs.stat(itemPath);
          const relativePath = path.relative(projectPath, itemPath);
          
          if (stats.isDirectory()) {
            const children = await scanDirectory(itemPath);
            return {
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              isDirectory: true,
              children
            };
          } else {
            return {
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              isDirectory: false,
              size: stats.size,
              modifiedAt: stats.mtime
            };
          }
        })
      );
      
      return result;
    };
    
    const fileTree = await scanDirectory(projectPath);
    res.json(fileTree);
  } catch (error) {
    console.error('Get file tree error:', error);
    res.status(500).json({ error: 'Error retrieving file tree' });
  }
};

/**
 * Get content of a specific file
 */
exports.getFileContent = async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const filePath = path.join(projectPath, file);
    
    // Security check: ensure the resolved path is within the project directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedProjectPath = path.normalize(projectPath);
    if (!normalizedFilePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }
    
    console.log('Reading file content:', { file, filePath });
    
    // Check if path exists and is a file
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, not a file' });
    }
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf8');
    
    res.json({ content });
  } catch (error) {
    console.error('Get file content error:', error);
    
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.status(500).json({ error: 'Error reading file' });
  }
};

/**
 * Save content to a file
 */
exports.saveFile = async (req, res) => {
  try {
    const { file } = req.query;
    const { content } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const filePath = path.join(projectPath, file);
    
    // Security check: ensure the resolved path is within the project directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedProjectPath = path.normalize(projectPath);
    if (!normalizedFilePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }
    
    console.log('Saving file content:', { file, filePath });
    
    // Create directory if needed
    const dirPath = path.dirname(filePath);
    await fs.ensureDir(dirPath);
    
    // Write content to file
    await fs.writeFile(filePath, content);
    
    res.json({ 
      success: true, 
      message: 'File saved successfully',
      file: file
    });
  } catch (error) {
    console.error('Save file error:', error);
    res.status(500).json({ error: 'Error saving file' });
  }
};

/**
 * Create a new file
 */
exports.createFile = async (req, res) => {
  try {
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const { name } = req.body;
    const { content = '' } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'File name is required' });
    }
    
    const filePath = path.join(projectPath, name);
    
    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'File already exists' });
    } catch {
      // File doesn't exist, proceed with creation
      await fs.writeFile(filePath, content);
      
      res.status(201).json({ 
        success: true, 
        message: 'File created successfully',
        file: name
      });
    }
  } catch (error) {
    console.error('Create file error:', error);
    res.status(500).json({ error: 'Error creating file' });
  }
};

/**
 * Delete a file
 */
exports.deleteFile = async (req, res) => {
  try {
    const { file } = req.query;
    
    if (!file) {
      return res.status(400).json({ error: 'File path is required' });
    }
    
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const filePath = path.join(projectPath, file);
    
    // Security check: ensure the resolved path is within the project directory
    const normalizedFilePath = path.normalize(filePath);
    const normalizedProjectPath = path.normalize(projectPath);
    if (!normalizedFilePath.startsWith(normalizedProjectPath)) {
      return res.status(403).json({ error: 'Invalid file path' });
    }
    
    console.log('Deleting file:', { file, filePath });
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the file
    await fs.unlink(filePath);
    
    res.json({ 
      success: true, 
      message: 'File deleted successfully',
      file: file
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Error deleting file' });
  }
};

/**
 * Create a new directory
 */
exports.createDirectory = async (req, res) => {
  try {
    // Project path is already resolved by middleware
    const projectPath = req.projectPath;
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Directory name is required' });
    }
    
    const dirPath = path.join(projectPath, name);
    
    // Check if directory already exists
    try {
      await fs.access(dirPath);
      return res.status(409).json({ error: 'Directory already exists' });
    } catch {
      // Directory doesn't exist, proceed with creation
      await fs.mkdir(dirPath);
      
      res.status(201).json({ 
        success: true, 
        message: 'Directory created successfully',
        directory: name
      });
    }
  } catch (error) {
    console.error('Create directory error:', error);
    res.status(500).json({ error: 'Error creating directory' });
  }
};
