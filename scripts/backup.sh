#!/bin/bash
# WCP Mission Control — Encrypted Backup to GitHub
# Run via cron: 0 3 * * * /app/scripts/backup.sh

set -e

source .env 2>/dev/null || true

REPO_DIR="/tmp/mc-backup-$$"
ENCRYPTION_KEY=${ENCRYPTION_KEY:-"CHANGE_ME"}

echo "🗄️  Starting backup..."

# Clone repo
git clone git@github.com:${GITHUB_REPO}.git $REPO_DIR 2>/dev/null || git init $REPO_DIR
cd $REPO_DIR

# Copy database
cp /app/data/mission-control.db ./mission-control.db.bak 2>/dev/null || true

# Encrypt
if [ -f mission-control.db.bak ]; then
    openssl enc -aes-256-cbc -salt -in mission-control.db.bak -out mission-control.db.enc -pass pass:$ENCRYPTION_KEY
    rm mission-control.db.bak
fi

# Copy config (non-sensitive)
cp /app/.env.example ./ 2>/dev/null || true

# Commit and push
git add -A
git commit -m "backup $(date +%Y-%m-%d_%H%M)" || true
git push origin main 2>/dev/null || true

# Cleanup
cd /
rm -rf $REPO_DIR

echo "✅ Backup complete"