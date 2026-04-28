const express = require('express');
const sqlite3 = require('sqlite3');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ── Database Setup ──────────────────────────────────
const DB_PATH = process.env.MC_DB_PATH || path.join(__dirname, 'data', 'mission-control.db');
const db = new sqlite3.Database(DB_PATH);

// Run schema on startup
const fs = require('fs');
const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
db.exec(schema);

// ── API Routes ─────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// GET communications — main dashboard feed
app.get('/api/communications', (req, res) => {
    const { date, lastName, type, therapist, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let sql = 'SELECT * FROM communications WHERE 1=1';
    const params = [];

    if (date) {
        sql += ' AND DATE(timestamp) = ?';
        params.push(date);
    }
    if (lastName) {
        sql += ' AND patient_last_name LIKE ? COLLATE NOCASE';
        params.push(`${lastName}%`);
    }
    if (type) {
        sql += ' AND type = ?';
        params.push(type);
    }
    if (therapist) {
        sql += ' AND therapist_name = ?';
        params.push(therapist);
    }

    // Only show last 30 days by default
    if (!date) {
        sql += " AND timestamp >= datetime('now', '-30 days')";
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST new communication — webhook receiver
app.post('/api/communications', (req, res) => {
    const id = crypto.randomUUID();
    const {
        patient_last_name, patient_first_name, patient_phone,
        type, direction, timestamp, duration_seconds,
        recording_url, transcription, ai_summary,
        therapist_name, tags, metadata
    } = req.body;

    if (!patient_last_name || !type || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields: patient_last_name, type, timestamp' });
    }

    const sql = `INSERT INTO communications 
        (id, patient_last_name, patient_first_name, patient_phone,
         type, direction, timestamp, duration_seconds, recording_url,
         transcription, ai_summary, therapist_name, tags, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.run(sql, [id, patient_last_name, patient_first_name, patient_phone,
        type, direction, timestamp, duration_seconds, recording_url,
        transcription, ai_summary, therapist_name, tags,
        metadata ? JSON.stringify(metadata) : null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id, status: 'created' });
    });
});

// PATCH update communication status
app.patch('/api/communications/:id', (req, res) => {
    const { status, ai_summary, transcription, tags } = req.body;
    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (ai_summary) { updates.push('ai_summary = ?'); params.push(ai_summary); }
    if (transcription) { updates.push('transcription = ?'); params.push(transcription); }
    if (tags) { updates.push('tags = ?'); params.push(tags); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.id);

    db.run(`UPDATE communications SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ id: req.params.id, updated: this.changes });
    });
});

// DELETE — GDPR patient data removal
app.delete('/api/communications/patient', (req, res) => {
    const { lastName, phone } = req.body;
    if (!lastName) return res.status(400).json({ error: 'lastName required' });

    let sql = 'DELETE FROM communications WHERE patient_last_name = ? COLLATE NOCASE';
    const params = [lastName];
    if (phone) { sql += ' AND patient_phone = ?'; params.push(phone); }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes, patient: lastName });
    });
});

// GET available dates (for day navigation)
app.get('/api/dates', (req, res) => {
    const sql = `SELECT DISTINCT DATE(timestamp) as date, COUNT(*) as count 
        FROM communications 
        WHERE timestamp >= datetime('now', '-30 days')
        GROUP BY DATE(timestamp) 
        ORDER BY date DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET types summary (for filter badges)
app.get('/api/types', (req, res) => {
    const sql = `SELECT type, COUNT(*) as count 
        FROM communications 
        WHERE timestamp >= datetime('now', '-30 days')
        GROUP BY type 
        ORDER BY count DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ── Dashboard UI ───────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'rich.html'));
});

// ── Start Server ───────────────────────────────────
const PORT = process.env.MC_PORT || 4001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏛️ WCP Mission Control running on port ${PORT}`);
});