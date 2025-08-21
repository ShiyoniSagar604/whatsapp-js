#!/bin/bash

echo "🚀 Starting WhatsApp Bot in Docker..."
echo "📱 This will solve Apple Silicon compatibility issues!"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Create necessary directories
mkdir -p .wwebjs_auth logs

# Build and start the container
echo "🔨 Building Docker image..."
docker-compose build

echo "🚀 Starting container..."
docker-compose up -d

echo "⏳ Waiting for container to start..."
sleep 10

# Show container status
echo "📊 Container status:"
docker-compose ps

echo ""
echo "✅ WhatsApp Bot is now running in Docker!"
echo "🌐 Access the web interface at: http://localhost:3000"
echo ""
echo "📱 To see the bot logs:"
echo "   docker-compose logs -f whatsapp-bot"
echo ""
echo "🛑 To stop the bot:"
echo "   docker-compose down"
echo ""
echo "🔄 To restart:"
echo "   docker-compose restart"
