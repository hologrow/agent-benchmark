-- Migration: Add agent_type and config_json columns to agents table
-- Date: 2026-04-17

-- up

-- Add agent_type column with default value 'other'
ALTER TABLE agents ADD COLUMN agent_type TEXT DEFAULT 'other';

-- Add config_json column to store type-specific configuration
ALTER TABLE agents ADD COLUMN config_json TEXT DEFAULT '{}';

-- Update existing agents: migrate command to config_json for 'other' type
UPDATE agents SET config_json = json_object('command', command) WHERE agent_type = 'other' OR agent_type IS NULL;

-- Create index for agent_type
CREATE INDEX IF NOT EXISTS idx_agents_agent_type ON agents(agent_type);
