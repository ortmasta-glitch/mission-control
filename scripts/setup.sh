#!/bin/bash
# WCP Mission Control — First Run Setup
# Run this on a fresh Ubuntu VPS after cloning the repo

set -e

echo "🏛️ WCP Mission Control — Setup"
echo "==============================="

# Check for .env
if [ ! -f .env ]; then
    echo "⚠️  No .env file found! Copy .env.example and fill in your keys:"
    echo "   cp .env.example .env"
    echo "   nano .env"
    exit 1
fi

# Update system
echo "📦 Updating system..."
apt-get update && apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose
if ! command -v docker compose &> /dev/null; then
    echo "🐳 Installing Docker Compose..."
    apt-get install -y docker-compose-plugin
fi

# Install certbot for SSL
echo "🔒 Setting up SSL..."
apt-get install -y certbot

# Get SSL certificate
source .env
if [ -n "$SSL_DOMAIN" ]; then
    echo "📄 Getting certificate for $SSL_DOMAIN..."
    certbot certonly --standalone -d $SSL_DOMAIN --email $SSL_EMAIL --agree-tos --non-interactive
fi

# Generate htpasswd for dashboard auth
if [ -n "$DASHBOARD_USER" ] && [ -n "$DASHBOARD_PASSWORD" ]; then
    echo "🔑 Setting up dashboard authentication..."
    apt-get install -y apache2-utils
    htpasswd -bc nginx/.htpasswd $DASHBOARD_USER $DASHBOARD_PASSWORD
fi

# Generate secrets if not set
if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    echo "⚠️  Generated JWT_SECRET — add to .env: $JWT_SECRET"
fi
if [ -z "$ENCRYPTION_KEY" ]; then
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "⚠️  Generated ENCRYPTION_KEY — add to .env: $ENCRYPTION_KEY"
fi

# Configure UFW firewall
echo "🛡️  Configuring firewall..."
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw --force enable

# Harden SSH
echo "🔐 Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Start everything
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "✅ Setup complete!"
echo "   Dashboard: https://$SSL_DOMAIN"
echo "   Health: https://$SSL_DOMAIN/health"
echo "   Webhooks: https://$SSL_DOMAIN/webhook/"
echo ""
echo "Next steps:"
echo "  1. Add your SSH key to GitHub: https://github.com/settings/keys"
echo "  2. Configure Orange WCO webhook URL in api.orange.pl"
echo "  3. Set up Telegram bot via @BotFather"