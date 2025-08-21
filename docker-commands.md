# Docker Commands for WhatsApp Bot

## Quick Start
```bash
# Make sure Docker Desktop is running, then:
./run-docker.sh
```

## Manual Commands

### Build and Start
```bash
# Build the image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f whatsapp-bot
```

### Management
```bash
# Stop the bot
docker-compose down

# Restart the bot
docker-compose restart

# View container status
docker-compose ps

# View container logs
docker-compose logs whatsapp-bot
```

### Troubleshooting
```bash
# Rebuild from scratch
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Access container shell
docker exec -it whatsapp-bot /bin/bash

# View container resources
docker stats whatsapp-bot
```

## What This Solves

✅ **Apple Silicon Compatibility** - Uses x86_64 architecture  
✅ **Puppeteer Issues** - Runs in Linux environment  
✅ **Portability** - Works on any machine with Docker  
✅ **Persistence** - WhatsApp sessions saved between restarts  
✅ **Isolation** - Doesn't affect your local system  

## Access Points

- **Web Interface**: http://localhost:3000
- **Container Logs**: `docker-compose logs -f whatsapp-bot`
- **WhatsApp Sessions**: Saved in `.wwebjs_auth` folder
