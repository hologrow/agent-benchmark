-- Migration: Add integrations table for external tools
-- up

CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    config TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index on type for faster lookups
CREATE INDEX IF NOT EXISTS idx_integrations_type ON integrations(type);

-- down
-- DROP TABLE IF EXISTS integrations;
-- DROP INDEX IF EXISTS idx_integrations_type;
