# Mission Control Development Guide

**Quick reference for safe development practices**

---

## Quick Commands

```bash
# Start development server
npm run dev

# Or use the helper
mission-control start

# Check health
mission-control health

# Push changes
git push origin main
# Or: mission-control push

# Create backup
mission-control backup
```

---

## ⚠️ Safety Checklist (Before Shutdown)

**ALWAYS run this checklist before shutting down your computer or stopping Mission Control:**

- [ ] **All commits pushed to GitHub** 
  ```bash
  git push origin main
  # Or: mission-control push
  ```

- [ ] **No uncommitted changes**
  ```bash
  git status
  git add . && git commit -m "..."
  ```

- [ ] **Database backed up**
  ```bash
  mission-control backup
  # Check: ls db-backups/
  ```

- [ ] **Task outputs committed**
  ```bash
  git status task-outputs/
  git add task-outputs/ && git commit -m "chore: update task outputs"
  ```

- [ ] **No in_progress tasks that need attention**
  ```bash
  mission-control health
  # Check: http://localhost:4000
  ```

---

## 🚨 Emergency Recovery

If Mission Control stops unexpectedly and you can't find your work:

### 1. Find the repo
```bash
find ~ -name "mission-control" -type d 2>/dev/null
# Primary location:
# ~/.openclaw/workspace/current open projects/mission-control-implementation/app
```

### 2. Check git status
```bash
cd "~/.openclaw/workspace/current open projects/mission-control-implementation/app"
git status
git log --oneline -20
```

### 3. Check for databases
```bash
find ~ -name "mission-control.db" -type f 2>/dev/null
```

### 4. Check for backups
```bash
find ~ -path "*/db-backups/*" -name "*.db" 2>/dev/null
ls ~/.openclaw/backups/mission-control/
```

### 5. Check agent workspaces
```bash
ls ~/.openclaw/workspace-*/
```

---

## 📁 Project Structure

```
~/.openclaw/workspace/current open projects/mission-control-implementation/app/
├── mission-control.db              # Main database
├── db-backups/                      # Automatic backups
├── task-outputs/                    # Agent task outputs
├── src/
│   ├── app/                        # Next.js app
│   ├── components/                 # React components
│   └── lib/                        # Utilities
├── DEVELOPMENT.md                   # This file
└── .git/                           # Git repository
```

---

## 🔄 Backup Strategy

**Automatic backups run every 2 hours via cron:**
- Database: `~/.openclaw/backups/mission-control/mission-control_YYYYMMDD_HHMMSS.db`
- Git bundle: `~/.openclaw/backups/mission-control/repo_YYYYMMDD_HHMMSS.bundle`

**Manual backup:**
```bash
mission-control backup
```

**Check backups:**
```bash
ls -la ~/.openclaw/backups/mission-control/
ls -la db-backups/
```

---

## 🐛 Troubleshooting

### Port 4000 already in use
```bash
# Find process
lsof -i :4000

# Kill it
pkill -f "next-server"

# Restart
mission-control start
```

### Database locked/corrupted
```bash
# Restore from latest backup
ls -t db-backups/*.db | head -1
cp db-backups/mission-control.db.backup.XXXXX mission-control.db
```

### Git push fails (authentication)
```bash
# Re-authenticate with GitHub CLI
gh auth login

# Or use SSH
git remote set-url origin git@github.com:crshdn/mission-control.git
```

---

## 📝 Development Workflow

1. **Start Mission Control:**
   ```bash
   mission-control start
   ```

2. **Make changes, test at http://localhost:4000**

3. **Commit regularly:**
   ```bash
   git add .
   git commit -m "feat: description"
   ```

4. **Push at least every few commits:**
   ```bash
   mission-control push
   ```

5. **Before shutdown, run:**
   ```bash
   mission-control stop
   ```
   (This will check safety requirements)

---

## 📊 Monitoring

**Check system health:**
```bash
mission-control health
```

**Check status:**
```bash
mission-control status
```

---

## 🔐 Security

- **API Token:** `4f8879f2630763e7c08638fe5a2235604a6da5fe875c9cfb962288e90dd46d9d`
- **Webhook Secret:** `e6938760280f62c6e2e39f0289c331deac0c89e1ca845598a3d65e46d6ba9178`
- **Gateway Token:** `9f6f67fd08f9fa372d9ec594d671bed964e1fc4533d810b0`

Store these securely. Do not commit `.env.local` files.

---

## 📞 Support

- **GitHub Repo:** https://github.com/crshdn/mission-control
- **Local Path:** `~/.openclaw/workspace/current open projects/mission-control-implementation/app`
- **Health Check:** `mission-control health`
- **Backup Status:** `ls ~/.openclaw/backups/mission-control/`

---

**Last Updated:** 2026-04-24
**Version:** 2.4.0+
