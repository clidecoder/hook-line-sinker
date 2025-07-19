# HLS Refactoring Migration Guide

This guide helps you transition from the monolithic `hls.js` file to the new modular structure.

## What Changed

The single `hls.js` file (30,000+ lines) has been refactored into a modular structure:

```
├── app.js                    # Main entry point (was hls.js)
├── src/
│   ├── config/
│   │   ├── database.js       # Database setup & initialization
│   │   └── middleware.js     # Express middleware configuration
│   ├── models/
│   │   ├── webhook.js        # Webhook database operations
│   │   ├── prompt.js         # Prompt database operations
│   │   └── claudeResponse.js # Claude response database operations
│   ├── services/
│   │   ├── webhookService.js # Webhook processing logic
│   │   ├── promptService.js  # Prompt template management
│   │   └── claudeService.js  # Claude AI integration
│   └── routes/
│       ├── webhooks.js       # Webhook & health endpoints
│       ├── prompts.js        # Prompt management API
│       ├── claude.js         # Claude execution API
│       └── pages.js          # HTML page routes
├── index.html               # Main dashboard (extracted from hls.js)
├── prompts.html            # Prompt editor (extracted from hls.js)
└── events.html             # Events documentation (extracted from hls.js)
```

## Migration Steps

### 1. Backup Current Setup
```bash
# Backup your current working setup
cp hls.js hls.js.backup
cp ecosystem.config.js ecosystem.config.js.backup
cp package.json package.json.backup
```

### 2. Stop Current Service
```bash
# If running with PM2
pm2 stop hls

# If running directly
# Kill the node process manually
```

### 3. Files Updated Automatically
- `package.json` - Updated main entry from `hls.js` to `app.js`
- `ecosystem.config.js` - Updated script path from `hls.js` to `app.js`

### 4. Start Refactored Application
```bash
# Install dependencies (if needed)
npm install

# Test the new structure
npm start

# Or with PM2
npm run pm2
```

### 5. Verify Functionality
After starting, verify these endpoints work:
- 🏥 Health: http://localhost:4665/health
- 📊 Dashboard: http://localhost:4665/
- 📝 Prompts: http://localhost:4665/prompts  
- 📖 Events: http://localhost:4665/events
- 📚 API Docs: http://localhost:4665/api-docs

## What's Preserved

✅ **Database Compatibility**: Same SQLite database and schema
✅ **API Endpoints**: All existing API routes preserved
✅ **Webhook Processing**: Same signature verification and processing logic
✅ **Claude Integration**: Same auto-execution and manual execution functionality
✅ **HTML Interfaces**: All web pages preserved with same functionality
✅ **PM2 Configuration**: Same process management setup
✅ **Environment Variables**: Same GITHUB_WEBHOOK_SECRET usage

## Benefits of Refactoring

### 🏗️ **Better Organization**
- Separated concerns into logical modules
- Easier to find and modify specific functionality
- Clear separation between routes, services, and models

### 🧪 **Improved Testability**
- Individual modules can be unit tested
- Services can be mocked for testing
- Easier to test specific functionality in isolation

### 🚀 **Enhanced Maintainability**
- Smaller, focused files are easier to understand
- Changes to one area don't affect others
- New features can be added to specific modules

### 📦 **Modularity**
- Services can be reused across different routes
- Models provide consistent database access patterns
- Configuration is centralized and reusable

### 🔧 **Development Experience**
- Better IDE support with smaller files
- Easier navigation and code completion
- Clearer dependency relationships

## Rollback Plan

If you need to rollback to the original monolithic structure:

```bash
# Stop new service
pm2 stop hls

# Restore backups
cp hls.js.backup hls.js
cp ecosystem.config.js.backup ecosystem.config.js
cp package.json.backup package.json

# Start original service
pm2 start ecosystem.config.js
```

## Next Steps

With the modular structure in place, you can now:

1. **Add Unit Tests**: Test individual services and models
2. **Enhance Error Handling**: Improve error handling in specific modules
3. **Add Features**: Easily add new webhook processors or API endpoints
4. **Monitor Performance**: Profile specific services for optimization
5. **Documentation**: Generate API documentation from individual route files

## Support

The refactored application maintains 100% backward compatibility. All existing:
- Webhook configurations continue to work
- Stored data remains accessible
- API clients continue to function
- PM2 process management works the same

If you encounter any issues, you can safely rollback using the backup files.