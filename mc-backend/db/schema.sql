-- WCP Mission Control Database Schema
-- SQLite — communications hub

CREATE TABLE IF NOT EXISTS communications (
    id TEXT PRIMARY KEY,
    patient_last_name TEXT NOT NULL,
    patient_first_name TEXT,
    patient_phone TEXT,
    type TEXT NOT NULL CHECK(type IN ('call_in', 'call_out', 'whatsapp', 'email', 'sms', 'booking', 'znany lekarz')),
    direction TEXT CHECK(direction IN ('incoming', 'outgoing')),
    timestamp DATETIME NOT NULL,
    duration_seconds INTEGER,
    recording_url TEXT,
    transcription TEXT,
    ai_summary TEXT,
    therapist_name TEXT,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'in_progress', 'actioned', 'archived')),
    tags TEXT,                    -- comma-separated: 'cbt,feedback,reschedule'
    metadata TEXT,               -- JSON string for flexible data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_comm_timestamp ON communications(timestamp);
CREATE INDEX IF NOT EXISTS idx_comm_lastname ON patient_last_name COLLATE NOCASE;
CREATE INDEX IF NOT EXISTS idx_comm_type ON type;
CREATE INDEX IF NOT EXISTS idx_comm_status ON status;
CREATE INDEX IF NOT EXISTS idx_comm_therapist ON therapist_name;

-- 30-day retention: scheduled purge via cron agent
-- DELETE FROM communications WHERE timestamp < datetime('now', '-30 days');

-- GDPR: full patient deletion by last name + phone
-- DELETE FROM communications WHERE patient_last_name = ? AND patient_phone = ?;