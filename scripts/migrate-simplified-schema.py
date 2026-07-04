#!/usr/bin/env python3
"""Migrate the database to the simplified schema.

Strategy:
1. SQLite doesn't support DROP COLUMN easily in older versions, so we use
   the standard approach: CREATE new table, copy data, DROP old, RENAME.
2. Backup before doing anything.
3. Preserve data for all fields that still exist in the new schema.
"""
import sqlite3
import shutil
import os
from datetime import datetime

DB = "/home/z/my-project/db/custom.db"
BACKUP = f"/home/z/my-project/db/custom.db.backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

# Backup first
shutil.copy2(DB, BACKUP)
print(f"Backup salvo em {BACKUP}")

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Get existing columns
cur.execute("PRAGMA table_info(Video)")
existing_cols = {row[1] for row in cur.fetchall()}
print(f"Colunas existentes: {len(existing_cols)} campos")

# New schema columns (only what we want to keep)
new_columns = [
    ("id", "TEXT PRIMARY KEY"),
    ("sourceId", "TEXT"),
    ("videoUrl", "TEXT NOT NULL"),
    ("videoViews", "INTEGER"),
    ("likes", "INTEGER"),
    ("comments", "INTEGER"),
    ("shares", "INTEGER"),
    ("saves", "INTEGER"),
    ("authorUsername", "TEXT"),
    ("duration", "INTEGER"),
    ("soundName", "TEXT"),
    ("description", "TEXT"),
    ("hashtags", "TEXT"),
    ("publishDate", "DATETIME"),
    ("ocrTitle", "TEXT"),
    ("ocrConfidence", "REAL"),
    ("transcript", "TEXT"),
    ("transcriptEngine", "TEXT"),
    ("likeRate", "REAL"),
    ("commentRate", "REAL"),
    ("shareRate", "REAL"),
    ("processingStatus", "TEXT NOT NULL DEFAULT 'pending'"),
    ("processingError", "TEXT"),
    ("source", "TEXT NOT NULL DEFAULT 'manual'"),
    ("rawMetadata", "TEXT"),
    ("createdAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
    ("updatedAt", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"),
]

# Create new table
cols_def = ", ".join(f'"{name}" {typ}' for name, typ in new_columns)
cur.execute(f'DROP TABLE IF EXISTS Video_new')
cur.execute(f'CREATE TABLE Video_new ({cols_def})')

# Build INSERT INTO Video_new SELECT ... FROM Video
# Only copy columns that exist in both old and new schema
new_col_names = [name for name, _ in new_columns]
select_cols = []
for col in new_col_names:
    if col in existing_cols:
        select_cols.append(f'"{col}"')
    else:
        # Use default value for new columns not in old schema
        if col in ("likeRate", "commentRate", "shareRate"):
            select_cols.append("NULL")
        elif col == "transcriptEngine":
            select_cols.append("NULL")
        elif col == "processingStatus":
            select_cols.append("'completed'")
        elif col == "source":
            select_cols.append("'url'")
        else:
            select_cols.append("NULL")

select_clause = ", ".join(select_cols)
cols_clause = ", ".join(f'"{c}"' for c in new_col_names)
cur.execute(f'INSERT INTO Video_new ({cols_clause}) SELECT {select_clause} FROM Video')

rows_copied = cur.rowcount
print(f"Linhas copiadas: {rows_copied}")

# Recompute likeRate, commentRate, shareRate for all videos with views
cur.execute("""
    UPDATE Video_new
    SET likeRate = ROUND(likes * 100.0 / NULLIF(videoViews, 0), 2)
    WHERE videoViews IS NOT NULL AND videoViews > 0 AND likes IS NOT NULL
""")
print(f"likeRate calculado: {cur.rowcount} linhas")

cur.execute("""
    UPDATE Video_new
    SET commentRate = ROUND(comments * 100.0 / NULLIF(videoViews, 0), 2)
    WHERE videoViews IS NOT NULL AND videoViews > 0 AND comments IS NOT NULL
""")
print(f"commentRate calculado: {cur.rowcount} linhas")

cur.execute("""
    UPDATE Video_new
    SET shareRate = ROUND(shares * 100.0 / NULLIF(videoViews, 0), 2)
    WHERE videoViews IS NOT NULL AND videoViews > 0 AND shares IS NOT NULL
""")
print(f"shareRate calculado: {cur.rowcount} linhas")

# Swap tables
cur.execute("DROP TABLE Video")
cur.execute("ALTER TABLE Video_new RENAME TO Video")

# Recreate indexes
cur.execute("CREATE INDEX IF NOT EXISTS Video_authorUsername_idx ON Video(authorUsername)")
cur.execute("CREATE INDEX IF NOT EXISTS Video_publishDate_idx ON Video(publishDate)")
cur.execute("CREATE INDEX IF NOT EXISTS Video_videoViews_idx ON Video(videoViews)")

conn.commit()

# Verify
cur.execute("SELECT COUNT(*) FROM Video")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM Video WHERE videoViews IS NOT NULL")
with_views = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM Video WHERE likeRate IS NOT NULL")
with_like_rate = cur.fetchone()[0]
print(f"\nResultado: {total} vídeos, {with_views} com views, {with_like_rate} com likeRate calculado")

# Show final schema
cur.execute("PRAGMA table_info(Video)")
final_cols = [row[1] for row in cur.fetchall()]
print(f"Schema final tem {len(final_cols)} campos:")
for c in final_cols:
    print(f"  - {c}")

conn.close()
print("\n✓ Migration concluída. Agora execute: bun run db:push")
