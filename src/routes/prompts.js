const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const PromptModel = require('../models/prompt');
const { 
  listPromptTemplates, 
  savePromptTemplate, 
  deletePromptTemplate,
  getPromptTemplate 
} = require('../services/promptService');

// API: List all prompt templates
router.get('/api/prompts', async (req, res) => {
  try {
    const templates = await listPromptTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error listing prompts:', error);
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

// API: Get generic prompt template
router.get('/api/prompts/generic/:eventType', async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../prompts/generic', `${req.params.eventType}.md`);
    const content = await fs.readFile(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Prompt not found' });
    } else {
      console.error('Error reading prompt:', error);
      res.status(500).json({ error: 'Failed to read prompt' });
    }
  }
});

// API: Save generic prompt template
router.post('/api/prompts/generic/:eventType', async (req, res) => {
  try {
    const content = req.body;
    const eventType = req.params.eventType;
    
    await savePromptTemplate('generic', eventType, null, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving prompt:', error);
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// API: Delete generic prompt template
router.delete('/api/prompts/generic/:eventType', async (req, res) => {
  try {
    await deletePromptTemplate('generic', req.params.eventType, null);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Prompt not found' });
    } else {
      console.error('Error deleting prompt:', error);
      res.status(500).json({ error: 'Failed to delete prompt' });
    }
  }
});

// API: Get repo-specific prompt template
router.get('/api/prompts/repo/:owner/:repo/:eventType', async (req, res) => {
  try {
    const repo = `${req.params.owner}/${req.params.repo}`;
    const eventType = req.params.eventType;
    const [owner, repoName] = repo.split('/');
    
    const filePath = path.join(__dirname, '../../prompts/repos', owner, repoName, `${eventType}.md`);
    const content = await fs.readFile(filePath, 'utf8');
    res.type('text/plain').send(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Prompt not found' });
    } else {
      console.error('Error reading prompt:', error);
      res.status(500).json({ error: 'Failed to read prompt' });
    }
  }
});

// API: Save repo-specific prompt template
router.post('/api/prompts/repo/:owner/:repo/:eventType', async (req, res) => {
  try {
    const content = req.body;
    const repo = `${req.params.owner}/${req.params.repo}`;
    const eventType = req.params.eventType;
    
    await savePromptTemplate('repo', eventType, repo, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving prompt:', error);
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// API: Delete repo-specific prompt template
router.delete('/api/prompts/repo/:owner/:repo/:eventType', async (req, res) => {
  try {
    const repo = `${req.params.owner}/${req.params.repo}`;
    const eventType = req.params.eventType;
    
    await deletePromptTemplate('repo', eventType, repo);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: 'Prompt not found' });
    } else {
      console.error('Error deleting prompt:', error);
      res.status(500).json({ error: 'Failed to delete prompt' });
    }
  }
});

// API: Get user's GitHub repositories
router.get('/api/repositories', async (req, res) => {
  try {
    const { stdout } = await execAsync('gh repo list --json nameWithOwner --limit 100');
    const repos = JSON.parse(stdout);
    const repoNames = repos.map(r => r.nameWithOwner).sort();
    res.json(repoNames);
  } catch (error) {
    console.error('Error fetching repositories:', error);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// API: List parsed prompts
router.get('/api/parsed-prompts', async (req, res) => {
  try {
    const webhookId = req.query.webhook_id || null;
    const prompts = await PromptModel.getAll(webhookId);
    res.json(prompts);
  } catch (error) {
    console.error('Error fetching parsed prompts:', error);
    res.status(500).json({ error: 'Failed to fetch parsed prompts' });
  }
});

// API: Get parsed prompt by ID
router.get('/api/parsed-prompts/:id', async (req, res) => {
  try {
    const prompt = await PromptModel.getById(req.params.id);
    
    if (!prompt) {
      return res.status(404).json({ error: 'Parsed prompt not found' });
    }
    
    res.json(prompt);
  } catch (error) {
    console.error('Error fetching parsed prompt:', error);
    res.status(500).json({ error: 'Failed to fetch parsed prompt' });
  }
});

module.exports = router;