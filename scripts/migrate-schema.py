#!/usr/bin/env python3
"""Migrate the SQLite database to add new TikTok Analytics fields
and rename `views` → `videoViews`, drop `bookmarks` (replaced by `bookmarkCount`).

SQLite doesn't support ALTER TABLE RENAME COLUMN well in older versions,
so we use the safer approach: ALTER TABLE ADD COLUMN for new fields,
and a data-preserving rename for views → videoViews.

Strategy:
1. Add new columns with ALTER TABLE (works in any SQLite version)
2. Copy data: videoViews = views, bookmarkCount = bookmarks
3. Push schema with --accept-data-loss (Prisma will drop legacy `views` and `bookmarks`
   but the data is already preserved in the new columns)
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
print(f"Colunas existentes: {sorted(existing_cols)}")

# New columns to add (from new schema, excluding ones that already exist)
new_columns = [
    # Author
    ("authorId", "TEXT"),
    ("authorVerified", "BOOLEAN"),
    # TikTok official analytics
    ("videoViews", "INTEGER"),
    ("totalViews", "INTEGER"),
    ("profileViews", "INTEGER"),
    ("reach", "INTEGER"),
    ("impressions", "INTEGER"),
    ("follows", "INTEGER"),
    ("profileVisits", "INTEGER"),
    ("bookmarkCount", "INTEGER"),
    # Watch metrics
    ("averageWatchTime", "REAL"),
    ("totalWatchTime", "REAL"),
    ("watchRate", "REAL"),
    ("retentionRate", "REAL"),
    ("finishRate", "REAL"),
    ("avgViewDuration", "REAL"),
    ("forwards", "INTEGER"),
    # Computed rates
    ("likeRate", "REAL"),
    ("commentRate", "REAL"),
    ("shareRate", "REAL"),
    ("saveRate", "REAL"),
    ("followRate", "REAL"),
    ("profileVisitRate", "REAL"),
    ("viralCoefficient", "REAL"),
    # Video tech
    ("ratio", "TEXT"),
    ("definition", "TEXT"),
    ("coverUrl", "TEXT"),
    ("dynamicCoverUrl", "TEXT"),
    ("originCoverUrl", "TEXT"),
    ("createTime", "INTEGER"),
    # Sound
    ("soundOriginal", "BOOLEAN"),
    ("soundPlayUrl", "TEXT"),
    # Tags
    ("textExtra", "TEXT"),
    # Audience
    ("audienceTerritories", "TEXT"),
    ("audienceAge", "TEXT"),
    ("audienceGender", "TEXT"),
    ("audienceActivity", "TEXT"),
    ("trafficSources", "TEXT"),
    ("locationCreated", "TEXT"),
    # Transcript engine
    ("transcriptEngine", "TEXT"),
]

added = []
for col, typ in new_columns:
    if col not in existing_cols:
        cur.execute(f"ALTER TABLE Video ADD COLUMN {col} {typ}")
        added.append(col)

print(f"\nColunas adicionadas: {len(added)}")
for c in added:
    print(f"  + {c}")

# Migrate data from old columns to new ones
migrations = [
    ("videoViews", "views"),
    ("bookmarkCount", "bookmarks"),
    ("profileVisits", "profileViews"),  # alias
]
for new_col, old_col in migrations:
    if old_col in existing_cols and new_col in [a for a, _ in new_columns]:
        cur.execute(f"UPDATE Video SET {new_col} = {old_col} WHERE {old_col} IS NOT NULL AND {new_col} IS NULL")
        print(f"  ~ {old_col} → {new_col}: {cur.rowcount} linhas")

# Copy plays → videoViews if videoViews is still NULL
if "plays" in existing_cols:
    cur.execute("UPDATE Video SET videoViews = plays WHERE videoViews IS NULL AND plays IS NOT NULL")
    print(f"  ~ plays → videoViews: {cur.rowcount} linhas")

# Copy diggs → likes if likes exists and diggs has data
if "diggs" in existing_cols:
    cur.execute("UPDATE Video SET likes = diggs WHERE likes IS NULL AND diggs IS NOT NULL")
    print(f"  ~ diggs → likes: {cur.rowcount} linhas")

# Copy collects → bookmarkCount if needed
if "collects" in existing_cols:
    cur.execute("UPDATE Video SET bookmarkCount = collects WHERE bookmarkCount IS NULL AND collects IS NOT NULL")
    print(f"  ~ collects → bookmarkCount: {cur.rowcount} linhas")

conn.commit()

# Recompute engagement rates using the new field names
cur.execute("""
  UPDATE Video
  SET engagementRate = ROUND(
    (COALESCE(likes,0) + COALESCE(comments,0) + COALESCE(shares,0) + COALESCE(saves,0))
    * 100.0 / NULLIF(videoViews, 0), 2)
  WHERE videoViews IS NOT NULL AND videoViews > 0
""")
print(f"\nEngagement rate recalculado: {cur.rowcount} linhas")

# Compute like/comment/share/save rates
for rate, num in [("likeRate", "likes"), ("commentRate", "comments"),
                   ("shareRate", "shares"), ("saveRate", "saves"),
                   ("followRate", "follows"), ("profileVisitRate", "profileVisits")]:
    cur.execute(f"""
      UPDATE Video SET {rate} = ROUND({num} * 100.0 / NULLIF(videoViews, 0), 2)
      WHERE videoViews IS NOT NULL AND videoViews > 0 AND {num} IS NOT NULL
    """)

# Viral coefficient
cur.execute("""
  UPDATE Video SET viralCoefficient = ROUND(shares * 100.0 / NULLIF(reach, 0), 2)
  WHERE reach IS NOT NULL AND reach > 0 AND shares IS NOT NULL
""")

# Watch rate
cur.execute("""
  UPDATE Video SET watchRate = ROUND(averageWatchTime * 100.0 / NULLIF(duration, 0), 2)
  WHERE duration IS NOT NULL AND duration > 0 AND averageWatchTime IS NOT NULL
""")

conn.commit()
print(f"Taxas derivadas (like/comment/share/save/follow/profile/viral/watch) recalculadas.")

# Verify
cur.execute("SELECT COUNT(*) FROM Video")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM Video WHERE videoViews IS NOT NULL")
with_views = cur.fetchone()[0]
print(f"\nResultado: {total} vídeos totais, {with_views} com videoViews preenchido.")

conn.close()
print("\n✓ Migration concluída. Agora execute: bun run db:push --accept-data-loss")
