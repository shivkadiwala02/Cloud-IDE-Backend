const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Base path for project files
const projectPath = path.join(__dirname, '..', 'projects', 'default');

// Get list of all files
router.get('/', async (req, res) => {
  try {
    const files = await fs.readdir(projectPath);
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const stats = await fs.stat(path.join(projectPath, file));
        return {
          name: file,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime
        };
      })
    );
    
    res.json(fileStats);
  } catch (err) {
    console.error('Error reading files:', err);
    res.status(500).json({ error: 'Failed to read files' });
  }
});

// Get content of a specific file
router.get('/:name', async (req, res) => {
  try {
    const filePath = path.join(projectPath, req.params.name);
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ content });
  } catch (err) {
    console.error(`Error reading file ${req.params.name}:`, err);
    res.status(404).json({ error: 'File not found' });
  }
});

// Save content to a file
router.post('/:name', async (req, res) => {
  try {
    const filePath = path.join(projectPath, req.params.name);
    const { content } = req.body;
    
    if (!content && content !== '') {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    await fs.writeFile(filePath, content);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (err) {
    console.error(`Error saving file ${req.params.name}:`, err);
    res.status(500).json({ error: 'Failed to save file' });
  }
});

// Delete a file
router.delete('/:name', async (req, res) => {
  try {
    const filePath = path.join(projectPath, req.params.name);
    await fs.unlink(filePath);
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (err) {
    console.error(`Error deleting file ${req.params.name}:`, err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Create a new file
router.put('/:name', async (req, res) => {
  try {
    const filePath = path.join(projectPath, req.params.name);
    
    // Check if file already exists
    try {
      await fs.access(filePath);
      return res.status(409).json({ error: 'File already exists' });
    } catch {
      // File doesn't exist, proceed with creation
      const { content = '' } = req.body;
      await fs.writeFile(filePath, content);
      res.json({ success: true, message: 'File created successfully' });
    }
  } catch (err) {
    console.error(`Error creating file ${req.params.name}:`, err);
    res.status(500).json({ error: 'Failed to create file' });
  }
});

module.exports = router;
