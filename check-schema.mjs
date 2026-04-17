/**
 * check-schema.mjs — Compare shared/schema.ts definitions against a live Postgres DB.
 * Outputs ALTER TABLE ADD COLUMN statements for columns present in schema.ts but missing from DB.
 *
 * Usage: DATABASE_URL="postgresql://..." node check-schema.mjs > missing_columns.sql
 *
 * SAFE: Only generates ADD COLUMN. Never drops, renames, or modifies existing columns.
 */
import pg from "pg";
import fs from "fs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Set DATABASE_URL env var");
  process.exit(1);
}

// Parse schema.ts to extract table definitions
const schemaSource = fs.readFileSync("shared/schema.ts", "utf-8");

// Map Drizzle column helpers to Postgres types
function drizzleTypeToSql(call) {
  // varchar
  let m = call.match(/varchar\(\s*["']([^"']+)["']\s*(?:,\s*\{\s*length:\s*(\d+)\s*\})?\s*\)/);
  if (m) return `VARCHAR(${m[2] || 36})`;
  // text
  if (/\btext\(/.test(call)) return "TEXT";
  // integer / serial
  if (/\bserial\(/.test(call)) return "SERIAL";
  if (/\binteger\(/.test(call)) return "INTEGER";
  // boolean
  if (/\bboolean\(/.test(call)) return "BOOLEAN";
  // numeric / decimal
  m = call.match(/decimal\(\s*["'][^"']+["']\s*,\s*\{\s*precision:\s*(\d+)\s*,\s*scale:\s*(\d+)\s*\}/);
  if (m) return `NUMERIC(${m[1]},${m[2]})`;
  if (/\bnumeric\(/.test(call) || /\bdecimal\(/.test(call)) return "NUMERIC";
  // timestamp
  if (/timestamp\(/.test(call) && /withTimezone/.test(call)) return "TIMESTAMPTZ";
  if (/timestamp\(/.test(call)) return "TIMESTAMP";
  // date
  if (/\bdate\(/.test(call)) return "DATE";
  // time
  if (/\btime\(/.test(call)) return "TIME";
  // jsonb
  if (/\bjsonb\(/.test(call)) return "JSONB";
  // json
  if (/\bjson\(/.test(call)) return "JSON";
  // bigint
  if (/\bbigint\(/.test(call)) return "BIGINT";
  // real / doublePrecision
  if (/\breal\(/.test(call)) return "REAL";
  if (/\bdoublePrecision\(/.test(call)) return "DOUBLE PRECISION";
  // enum types — just use TEXT as safe fallback
  if (/Enum\(/.test(call)) return "TEXT";
  return "TEXT";
}

// Extract default value
function extractDefault(line) {
  // .default(sql`...`)
  let m = line.match(/\.default\(sql`([^`]+)`\)/);
  if (m) return m[1];
  // .default("...")
  m = line.match(/\.default\(\s*["']([^"']*)["']\s*\)/);
  if (m) return `'${m[1]}'`;
  // .default(true/false)
  m = line.match(/\.default\(\s*(true|false)\s*\)/);
  if (m) return m[1].toUpperCase();
  // .default(number)
  m = line.match(/\.default\(\s*(\d+)\s*\)/);
  if (m) return m[1];
  // .defaultNow()
  if (/\.defaultNow\(\)/.test(line)) return "NOW()";
  // .default({}) or .default([])
  if (/\.default\(\s*\{\}\s*\)/.test(line)) return "'{}'::jsonb";
  if (/\.default\(\s*\[\]\s*\)/.test(line)) return "'[]'::jsonb";
  return null;
}

// Parse all pgTable definitions
const tables = {};
const tableRegex = /export const \w+ = pgTable\(\s*["']([^"']+)["']/g;
let tableMatch;
const tablePositions = [];

while ((tableMatch = tableRegex.exec(schemaSource)) !== null) {
  tablePositions.push({ name: tableMatch[1], start: tableMatch.index });
}

for (let i = 0; i < tablePositions.length; i++) {
  const tableName = tablePositions[i].name;
  const start = tablePositions[i].start;
  const end = i + 1 < tablePositions.length ? tablePositions[i + 1].start : schemaSource.length;
  const block = schemaSource.slice(start, end);

  // Find column definitions: propertyName: type("sql_column_name"...)
  const colRegex = /(\w+):\s*(varchar|text|integer|serial|boolean|decimal|numeric|timestamp|date|time|jsonb|json|bigint|real|doublePrecision|\w+Enum)\s*\(\s*["']([^"']+)["']/g;
  let colMatch;
  const columns = {};
  while ((colMatch = colRegex.exec(block)) !== null) {
    const sqlColName = colMatch[3];
    const lineStart = block.lastIndexOf("\n", colMatch.index);
    const lineEnd = block.indexOf("\n", colMatch.index + colMatch[0].length);
    const fullLine = block.slice(lineStart, lineEnd > -1 ? lineEnd : undefined);

    const sqlType = drizzleTypeToSql(fullLine);
    const notNull = /\.notNull\(\)/.test(fullLine);
    const defaultVal = extractDefault(fullLine);

    columns[sqlColName] = { sqlType, notNull, defaultVal };
  }

  if (Object.keys(columns).length > 0) {
    tables[tableName] = columns;
  }
}

// Connect to DB and compare
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: dbColumns } = await client.query(`
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);

// Build set of existing columns
const existing = new Set();
const existingTables = new Set();
for (const row of dbColumns) {
  existing.add(`${row.table_name}.${row.column_name}`);
  existingTables.add(row.table_name);
}

// Generate ALTER TABLE statements
const output = [];
output.push("-- Auto-generated: ADD COLUMN statements for columns in schema.ts missing from DB");
output.push("-- Generated at: " + new Date().toISOString());
output.push("-- SAFE: Only ADD COLUMN, no DROP/RENAME/MODIFY");
output.push("");

let missingCount = 0;
let missingTableCount = 0;

for (const [tableName, columns] of Object.entries(tables).sort()) {
  if (!existingTables.has(tableName)) {
    // Table doesn't exist at all — skip (CREATE TABLE is a separate concern)
    output.push(`-- SKIPPED: Table "${tableName}" does not exist in DB (needs CREATE TABLE, not ALTER)`);
    missingTableCount++;
    continue;
  }

  const missingCols = [];
  for (const [colName, info] of Object.entries(columns)) {
    if (!existing.has(`${tableName}.${colName}`)) {
      missingCols.push({ colName, ...info });
    }
  }

  if (missingCols.length > 0) {
    output.push(`-- Table: ${tableName} (${missingCols.length} missing column(s))`);
    for (const col of missingCols) {
      let stmt = `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${col.colName}" ${col.sqlType}`;
      if (col.notNull && col.defaultVal) {
        stmt += ` NOT NULL DEFAULT ${col.defaultVal}`;
      } else if (col.notNull) {
        // NOT NULL without default — use a safe default to avoid failing on existing rows
        const safeDefault = col.sqlType.startsWith("VARCHAR") || col.sqlType === "TEXT" ? "''"
          : col.sqlType === "INTEGER" || col.sqlType === "BIGINT" || col.sqlType === "SERIAL" ? "0"
          : col.sqlType === "BOOLEAN" ? "FALSE"
          : col.sqlType === "NUMERIC" ? "0"
          : col.sqlType === "JSONB" || col.sqlType === "JSON" ? "'{}'"
          : col.sqlType === "TIMESTAMPTZ" || col.sqlType === "TIMESTAMP" ? "NOW()"
          : "''";
        stmt += ` NOT NULL DEFAULT ${safeDefault}`;
      } else if (col.defaultVal) {
        stmt += ` DEFAULT ${col.defaultVal}`;
      }
      stmt += ";";
      output.push(stmt);
      missingCount++;
    }
    output.push("");
  }
}

output.push(`-- Summary: ${missingCount} missing column(s), ${missingTableCount} missing table(s)`);

console.log(output.join("\n"));

await client.end();
