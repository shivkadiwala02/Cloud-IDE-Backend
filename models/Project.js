const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  path: {
    type: String,
    required: true
  },
  isGitRepo: {
    type: Boolean,
    default: false
  },
  gitUrl: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure the combination of userId and name is unique
ProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Project', ProjectSchema);
