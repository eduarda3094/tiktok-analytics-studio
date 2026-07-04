#!/bin/bash
# Create a 5-second test video with a title text overlay at second 2.
# Used to validate the OCR pipeline (frame extraction + tesseract).
set -e

OUT=/home/z/my-project/storage/videos/test-ocr.mp4
mkdir -p /home/z/my-project/storage/videos

# Generate a 5-second video with text appearing from 0-5s.
# The text says "RECEITA DE BOLO DE CENOURA" which we expect OCR to extract.
ffmpeg -y -f lavfi -i "color=c=0x101820:s=720x1280:d=5:r=30" \
  -vf "drawtext=text='RECEITA DE BOLO DE CENOURA':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-100:box=1:boxcolor=0xf43f5e@0.8:boxborderw=20,
       drawtext=text='@cozinhadavera':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2+40,
       drawtext=text='INGREDIENTES NA BIO':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+120" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  "$OUT" 2>&1 | tail -5

ls -la "$OUT"
echo "Created test video at: $OUT"

# Test OCR on the video
echo ""
echo "=== Testing OCR pipeline ==="
node -e "
const { ocrTitleFromVideo } = require('./src/lib/ocr.ts');
" 2>&1 || true

# Use python to call the OCR via HTTP endpoint instead
echo "=== Uploading test video via API to trigger OCR ==="
curl -s -X POST "http://localhost:3000/api/videos" \
  -F "file=@$OUT" \
  -F "runOcr=true" \
  -F "runTranscribe=false" \
  --max-time 60 | python3 -m json.tool | head -40
