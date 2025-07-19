# Hook Line Sinker (HLS) - Deployment Guide

Complete deployment guide for the GitHub webhook monitoring service with Claude AI integration.

## 🎯 Production Deployment

### Current Live Environment
- **URL**: https://hls.zpaper.com/
- **Server**: AWS EC2 instance
- **Process Manager**: PM2
- **Port**: 4665 (internal), proxied via nginx/ALB
- **Organizations**: zpaper-com, shawn-storie

## 📋 Prerequisites

### System Requirements
```bash
# Node.js (v18+ recommended)
node --version

# PM2 for process management
npm install -g pm2

# GitHub CLI for automation
gh --version

# Git for repository management
git --version
```

### GitHub Authentication
```bash
# Authenticate GitHub CLI
gh auth login

# Verify authentication
gh auth status

# Test repository access
gh repo list --limit 5
```

## 🚀 Fresh Deployment

### 1. Clone and Setup
```bash
# Clone the repository
git clone https://github.com/zpaper-com/hook-line-sinker.git
cd hook-line-sinker

# Install dependencies
npm install

# Verify main application file
ls -la hls.js
```

### 2. Environment Configuration
```bash
# Create environment file
cat > .env << 'EOF'
GITHUB_WEBHOOK_SECRET=0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733
NODE_ENV=production
PORT=4665
EOF

# Set proper permissions
chmod 600 .env
```

### 3. Database Initialization
```bash
# Database will be created automatically on first run
# Location: ./hls_webhooks.db
# No manual setup required
```

### 4. Prompt Templates Setup
```bash
# Create prompt directories
mkdir -p prompts/generic
mkdir -p prompts/repos

# Generic templates are included in the repository
# Repository-specific templates can be added via web interface
```

### 5. PM2 Production Startup
```bash
# Start with PM2 using ecosystem config
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions provided by PM2 startup command

# Verify service is running
pm2 status
pm2 logs hls --lines 20
```

## 🔧 Configuration

### GitHub Webhook Setup

#### Organization-Level Webhook (Recommended)
1. Go to GitHub Organization Settings → Webhooks
2. Add webhook with these settings:
   - **Payload URL**: `https://hls.zpaper.com/webhook`
   - **Content Type**: `application/json`
   - **Secret**: `0eafeebff81353f861742e1391ba371f045d1fbc586f9033f8e789954c7c9733`
   - **Events**: Select "Send me everything"
   - **Active**: ✅ Checked

#### Repository-Level Webhook (Alternative)
1. Go to Repository Settings → Webhooks
2. Use same configuration as above
3. Configure for specific repositories as needed

### Reverse Proxy Configuration

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name hls.zpaper.com;
    
    location / {
        proxy_pass http://localhost:4665;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### AWS Application Load Balancer
- **Target Group**: Port 4665
- **Health Check**: `/health`
- **Protocol**: HTTP
- **Sticky Sessions**: Not required

## 🛠️ Operations

### Service Management
```bash
# Check service status
pm2 status

# View real-time logs
pm2 logs hls --follow

# Restart service
pm2 restart hls

# Stop service
pm2 stop hls

# View service metrics
pm2 monit
```

### Database Management
```bash
# View database size
ls -lh hls_webhooks.db

# Backup database
cp hls_webhooks.db "hls_webhooks_backup_$(date +%Y%m%d_%H%M%S).db"

# Connect to database (sqlite3)
sqlite3 hls_webhooks.db
.tables
.schema webhooks
.exit
```

### Log Management
```bash
# PM2 log locations
ls -la ~/.pm2/logs/

# View application logs
pm2 logs hls --lines 50

# Log rotation (automatic with PM2)
pm2 flush  # Clear all logs
```

## 📊 Monitoring

### Health Checks
```bash
# Application health
curl https://hls.zpaper.com/health

# Expected response:
# {"status":"ok","timestamp":"2025-07-17T03:00:00.000Z","uptime":123.456}
```

### Performance Metrics
```bash
# PM2 monitoring
pm2 monit

# System resources
htop
df -h
free -h
```

### Database Monitoring
```bash
# Webhook count
curl -s https://hls.zpaper.com/api/webhooks | jq 'length'

# Recent webhooks
curl -s https://hls.zpaper.com/api/webhooks | jq '.[0:5] | .[] | {id, event_type, repository, timestamp}'

# Claude responses
curl -s https://hls.zpaper.com/api/parsed-prompts | jq 'length'
```

## 🔄 Updates and Maintenance

### Code Updates
```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Restart service
pm2 restart hls

# Verify deployment
curl https://hls.zpaper.com/health
```

### Database Maintenance
```bash
# Vacuum database (optimize)
sqlite3 hls_webhooks.db "VACUUM;"

# Analyze database (update statistics)
sqlite3 hls_webhooks.db "ANALYZE;"

# Check database integrity
sqlite3 hls_webhooks.db "PRAGMA integrity_check;"
```

## 🚨 Troubleshooting

### Common Issues

#### Service Won't Start
```bash
# Check PM2 logs
pm2 logs hls --err

# Check port availability
netstat -tlnp | grep 4665

# Verify environment variables
pm2 env 0  # Replace 0 with actual PM2 process ID
```

#### Webhook Not Received
```bash
# Check GitHub webhook deliveries
# Go to GitHub → Settings → Webhooks → Recent Deliveries

# Verify webhook secret
echo $GITHUB_WEBHOOK_SECRET

# Test webhook endpoint
curl -X POST https://hls.zpaper.com/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

#### Claude Not Executing
```bash
# Verify GitHub CLI authentication
gh auth status

# Test Claude command manually
claude -p --dangerously-skip-permissions

# Check Claude process
ps aux | grep claude

# Review auto-execution logs
pm2 logs hls | grep "claude\|@clide"
```

#### Database Issues
```bash
# Check database permissions
ls -la hls_webhooks.db

# Test database connection
sqlite3 hls_webhooks.db "SELECT COUNT(*) FROM webhooks;"

# Recreate database (emergency)
rm hls_webhooks.db
pm2 restart hls
```

### Log Analysis
```bash
# Filter error logs
pm2 logs hls --err | grep -i error

# Monitor webhook processing
pm2 logs hls --follow | grep "webhook\|claude"

# Check execution times
pm2 logs hls | grep "execution_time\|Auto-executed"
```

## 📈 Scaling Considerations

### Performance Optimization
- **Database**: Consider PostgreSQL for high-volume deployments
- **Caching**: Add Redis for session management
- **Load Balancing**: Multiple instances with shared database
- **Claude Execution**: Queue system for high-volume auto-execution

### Security Hardening
- **HTTPS**: Ensure SSL/TLS termination
- **Rate Limiting**: Add request rate limiting
- **IP Filtering**: Restrict to GitHub webhook IPs
- **Secret Rotation**: Regular webhook secret updates

## 📞 Support

### Key Files for Debugging
- **Application**: `hls.js`
- **Configuration**: `ecosystem.config.js`, `.env`
- **Database**: `hls_webhooks.db`
- **Logs**: `~/.pm2/logs/hls-*.log`
- **Prompts**: `prompts/generic/`, `prompts/repos/`

### Important URLs
- **Web Interface**: https://hls.zpaper.com/
- **Health Check**: https://hls.zpaper.com/health
- **API Docs**: https://hls.zpaper.com/events
- **Prompt Management**: https://hls.zpaper.com/prompts

This deployment has been tested and verified with live webhook processing for both shawn-storie and zpaper-com organizations.