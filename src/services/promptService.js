const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');
const PromptModel = require('../models/prompt');

async function getPromptTemplate(repository, eventType) {
  // Try repo-specific prompt first
  const [owner, repo] = repository.split('/');
  const repoSpecificPath = path.join(__dirname, '../../prompts', 'repos', owner, repo, `${eventType}.md`);
  
  try {
    await fs.access(repoSpecificPath);
    return await fs.readFile(repoSpecificPath, 'utf8');
  } catch (error) {
    // Fall back to generic prompt
    const genericPath = path.join(__dirname, '../../prompts', 'generic', `${eventType}.md`);
    
    try {
      await fs.access(genericPath);
      return await fs.readFile(genericPath, 'utf8');
    } catch (error) {
      return null;
    }
  }
}

function parsePrompt(template, data) {
  const compiledTemplate = Handlebars.compile(template);
  return compiledTemplate(data);
}

async function processPrompt(webhookId, repository, eventType, payload) {
  const template = await getPromptTemplate(repository, eventType);
  
  if (!template) {
    console.log(`No prompt template found for ${repository} ${eventType}`);
    return null;
  }
  
  const parsedContent = parsePrompt(template, {
    repository,
    eventType,
    payload,
    json: JSON.stringify(payload, null, 2)
  });
  
  const promptId = await PromptModel.create({
    webhook_id: webhookId,
    repository,
    event_type: eventType,
    prompt_template: template,
    parsed_content: parsedContent
  });
  
  console.log(`Prompt ${promptId} created for webhook ${webhookId}`);
  return promptId;
}

async function listPromptTemplates() {
  const promptsDir = path.join(__dirname, '../../prompts');
  const templates = [];
  
  // Get generic templates
  try {
    const genericDir = path.join(promptsDir, 'generic');
    const genericFiles = await fs.readdir(genericDir);
    
    for (const file of genericFiles) {
      if (file.endsWith('.md')) {
        templates.push({
          type: 'generic',
          eventType: file.replace('.md', ''),
          path: `generic/${file}`
        });
      }
    }
  } catch (error) {
    console.error('Error reading generic prompts:', error);
  }
  
  // Get repo-specific templates
  try {
    const reposDir = path.join(promptsDir, 'repos');
    const owners = await fs.readdir(reposDir);
    
    for (const owner of owners) {
      const ownerDir = path.join(reposDir, owner);
      const ownerStat = await fs.stat(ownerDir);
      
      if (ownerStat.isDirectory()) {
        const repos = await fs.readdir(ownerDir);
        
        for (const repo of repos) {
          const repoDir = path.join(ownerDir, repo);
          const repoStat = await fs.stat(repoDir);
          
          if (repoStat.isDirectory()) {
            const files = await fs.readdir(repoDir);
            
            for (const file of files) {
              if (file.endsWith('.md')) {
                templates.push({
                  type: 'repo',
                  repository: `${owner}/${repo}`,
                  eventType: file.replace('.md', ''),
                  path: `repos/${owner}/${repo}/${file}`
                });
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error reading repo prompts:', error);
  }
  
  return templates;
}

async function savePromptTemplate(type, eventType, repository, content) {
  const promptsDir = path.join(__dirname, '../../prompts');
  let filePath;
  
  if (type === 'generic') {
    filePath = path.join(promptsDir, 'generic', `${eventType}.md`);
  } else {
    const [owner, repo] = repository.split('/');
    const repoDir = path.join(promptsDir, 'repos', owner, repo);
    await fs.mkdir(repoDir, { recursive: true });
    filePath = path.join(repoDir, `${eventType}.md`);
  }
  
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

async function deletePromptTemplate(type, eventType, repository) {
  const promptsDir = path.join(__dirname, '../../prompts');
  let filePath;
  
  if (type === 'generic') {
    filePath = path.join(promptsDir, 'generic', `${eventType}.md`);
  } else {
    const [owner, repo] = repository.split('/');
    filePath = path.join(promptsDir, 'repos', owner, repo, `${eventType}.md`);
  }
  
  await fs.unlink(filePath);
  return true;
}

module.exports = {
  getPromptTemplate,
  parsePrompt,
  processPrompt,
  listPromptTemplates,
  savePromptTemplate,
  deletePromptTemplate
};