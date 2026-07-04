#!/usr/bin/env python3
"""Add watch time + advanced metrics to existing videos to demo the deep analysis feature."""
import json
import urllib.request

API = "http://localhost:3000/api/videos"

# Get all videos
res = urllib.request.urlopen(f"{API}?limit=100")
data = json.loads(res.read())
videos = data["videos"]
print(f"Found {len(videos)} videos")

# For each video, add watch time + reach + impressions + follows + profile visits
import random
random.seed(42)

for v in videos:
    vid = v["id"]
    views = v.get("videoViews") or random.randint(10000, 500000)
    duration = v.get("duration") or 30

    # Generate plausible watch metrics
    avg_watch = round(min(duration, max(2, duration * random.uniform(0.35, 0.85))), 2)
    reach = int(views * random.uniform(0.8, 1.2))
    impressions = int(views * random.uniform(1.3, 2.5))
    follows = int(views * random.uniform(0.0005, 0.005))
    profile_visits = int(views * random.uniform(0.005, 0.025))

    fields = {
        "averageWatchTime": avg_watch,
        "totalWatchTime": round(avg_watch * views, 0),
        "reach": reach,
        "impressions": impressions,
        "follows": follows,
        "profileVisits": profile_visits,
    }

    body = json.dumps({"fields": fields}).encode()
    req = urllib.request.Request(
        f"{API}/{vid}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    try:
        r = urllib.request.urlopen(req)
        result = json.loads(r.read())
        updated = result["video"]
        print(f"✓ {updated['title'][:50]} | avgWatch={updated.get('averageWatchTime')}s | reach={updated.get('reach')} | watchRate={updated.get('watchRate')}%")
    except Exception as e:
        print(f"✗ {v.get('title','')[:50]}: {e}")

print("\n=== Done ===")
