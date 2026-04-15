import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

// 初始化迁移表
function initMigrationsTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS __migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// 获取已执行的迁移版本
function getExecutedMigrations(db: Database.Database): number[] {
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'
  `).get();

  if (!tableExists) return [];

  const rows = db.prepare('SELECT version FROM __migrations ORDER BY version').all() as { version: number }[];
  return rows.map(r => r.version);
}

// 记录迁移已执行
function recordMigration(db: Database.Database, version: number, name: string) {
  db.prepare('INSERT OR REPLACE INTO __migrations (version, name) VALUES (?, ?)')
    .run(version, name);
}

// 删除迁移记录
function removeMigration(db: Database.Database, version: number) {
  db.prepare('DELETE FROM __migrations WHERE version = ?').run(version);
}

// 从 migrations 目录加载迁移文件
function loadMigrations(migrationsDir: string): Migration[] {
  const migrations: Migration[] = [];

  try {
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const match = file.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const version = parseInt(match[1], 10);
      const name = match[2].replace(/_/g, ' ');
      const content = readFileSync(join(migrationsDir, file), 'utf-8');

      // 解析 up 和 down 部分
      const upMatch = content.match(/--\s*up\b([\s\S]*?)(?=--\s*down\b|$)/i);
      const downMatch = content.match(/--\s*down\b([\s\S]*?)$/i);

      migrations.push({
        version,
        name,
        up: upMatch ? upMatch[1].trim() : content.trim(),
        down: downMatch ? downMatch[2].trim() : undefined,
      });
    }
  } catch (e) {
    // migrations 目录可能不存在
  }

  return migrations.sort((a, b) => a.version - b.version);
}

// 执行迁移
export function migrate(
  db: Database.Database,
  migrationsDir: string = join(process.cwd(), 'src', 'lib', 'db', 'migrations')
): { success: boolean; executed: string[]; error?: string } {
  const executed: string[] = [];

  try {
    initMigrationsTable(db);

    const executedVersions = getExecutedMigrations(db);
    const migrations = loadMigrations(migrationsDir);

    // 按顺序执行未执行的迁移
    for (const migration of migrations) {
      if (executedVersions.includes(migration.version)) {
        continue;
      }

      console.log(`[Migration] Running ${migration.version}: ${migration.name}`);

      // 在事务中执行迁移
      db.transaction(() => {
        db.exec(migration.up);
        recordMigration(db, migration.version, migration.name);
      })();

      executed.push(`${migration.version}_${migration.name}`);
      console.log(`[Migration] Completed ${migration.version}: ${migration.name}`);
    }

    return { success: true, executed };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Migration] Failed:', errorMsg);
    return { success: false, executed, error: errorMsg };
  }
}

// 回滚到指定版本
export function rollback(
  db: Database.Database,
  targetVersion: number,
  migrationsDir: string = join(process.cwd(), 'src', 'lib', 'db', 'migrations')
): { success: boolean; rolledBack: string[]; error?: string } {
  const rolledBack: string[] = [];

  try {
    const executedVersions = getExecutedMigrations(db);
    const migrations = loadMigrations(migrationsDir);

    // 获取需要回滚的版本（按降序）
    const toRollback = migrations
      .filter(m => m.version > targetVersion && executedVersions.includes(m.version))
      .sort((a, b) => b.version - a.version);

    for (const migration of toRollback) {
      if (!migration.down) {
        console.warn(`[Migration] No down script for ${migration.version}, skipping`);
        continue;
      }

      console.log(`[Migration] Rolling back ${migration.version}: ${migration.name}`);

      db.transaction(() => {
        db.exec(migration.down!);
        removeMigration(db, migration.version);
      })();

      rolledBack.push(`${migration.version}_${migration.name}`);
      console.log(`[Migration] Rolled back ${migration.version}: ${migration.name}`);
    }

    return { success: true, rolledBack };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[Migration] Rollback failed:', errorMsg);
    return { success: false, rolledBack, error: errorMsg };
  }
}

// 获取迁移状态
export function getMigrationStatus(
  db: Database.Database,
  migrationsDir: string = join(process.cwd(), 'src', 'lib', 'db', 'migrations')
): { version: number; name: string; executed: boolean }[] {
  initMigrationsTable(db);
  const executedVersions = new Set(getExecutedMigrations(db));
  const migrations = loadMigrations(migrationsDir);

  return migrations.map(m => ({
    version: m.version,
    name: m.name,
    executed: executedVersions.has(m.version),
  }));
}
