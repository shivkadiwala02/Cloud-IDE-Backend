require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const morgan = require('morgan');

// Import middleware
const auth = require('./middleware/auth');
const projectResolver = require('./middleware/projectResolver');

// Import controllers
const authController = require('./controllers/authController');
const projectController = require('./controllers/projectController');
const fileController = require('./controllers/fileController');
const runController = require('./controllers/runController');

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Make the io instance available to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Request logging
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Create user_data directory if it doesn't exist
async function ensureUserDataDir() {
  try {
    const userDataPath = process.env.USER_DATA_PATH || path.join(__dirname, 'user_data');
    await fs.ensureDir(userDataPath);
    console.log(`User data directory ensured at ${userDataPath}`);
  } catch (err) {
    console.error('Error setting up user data directory:', err);
  }
}

// Authentication routes
app.post('/register', authController.register);
app.post('/login', authController.login);
app.get('/user', auth, authController.getCurrentUser);

// Project routes
app.post('/projects', auth, projectController.createProject);
app.get('/projects', auth, projectController.getProjects);
app.get('/projects/:projectName', auth, projectController.getProject);
app.delete('/projects/:projectName', auth, projectController.deleteProject);
app.post('/clone', auth, projectController.cloneRepository);

// File routes
app.get('/files', auth, projectResolver, fileController.getFiles);
app.get('/files/tree', auth, projectResolver, fileController.getFileTree);
// Use a query parameter for file paths instead of route parameter to support nested paths
app.get('/files/content', auth, projectResolver, fileController.getFileContent);
app.post('/files/save', auth, projectResolver, fileController.saveFile);
app.put('/files', auth, projectResolver, fileController.createFile);
app.delete('/files/delete', auth, projectResolver, fileController.deleteFile);
app.post('/directories', auth, projectResolver, fileController.createDirectory);

// Run code routes
app.post('/run', auth, projectResolver, runController.runCode);
app.post('/run/command', auth, projectResolver, runController.runCommand);
app.post('/run/stop', auth, projectResolver, runController.stopCommand);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Authenticate socket connection
  socket.on('authenticate', async (data) => {
    try {
      const { token } = data;
      
      if (!token) {
        socket.emit('auth_error', { error: 'No token provided' });
        return;
      }
      
      // Verify token
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      
      // Join user-specific room
      socket.join(decoded.userId.toString());
      
      socket.emit('authenticated', { userId: decoded.userId });
      console.log(`Socket authenticated for user: ${decoded.userId}`);
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('auth_error', { error: 'Authentication failed' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  await ensureUserDataDir();
  console.log(`Server running on port ${PORT}`);
});
