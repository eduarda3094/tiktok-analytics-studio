#!/bin/bash
# Create a 10-second test video where:
#   - Frame at 2s: BLACK SCREEN (no text) — should fail at second 2
#   - Frame at 5s (50%): "TÍTULO QUE APARECE NO MEIO" with high contrast
#   - Frame at 8s (75%): "@usuario_teste" + "DESCRIÇÃO DO VÍDEO"
#
# This tests that the new multi-frame OCR finds the text even when it's
# not present at the default 2-second mark.

set -e
OUT=/home/z/my-project/storage/videos/test-multiframe.mp4
mkdir -p /home/z/my-project/storage/videos

# Generate video with text appearing at different timestamps
ffmpeg -y -f lavfi -i "color=c=0x101820:s=720x1280:d=10:r=30" \
  -vf "drawtext=text='SEGUNDO 2 - SEM TITULO':fontcolor=white:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2-200:enable='between(t,1.5,2.5)',
       drawtext=text='TITULO QUE APARECE NO MEIO':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2-100:box=1:boxcolor=0xf43f5e@0.9:boxborderw=20:enable='between(t,4,7)',
       drawtext=text='@usuario_teste':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2+40:enable='between(t,7,10)',
       drawtext=text='DESCRICAO DO VIDEO':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2+120:enable='between(t,7,10)'" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  "$OUT" 2>&1 | tail -5

ls -la "$OUT"
echo ""
echo "=== Testing improved OCR (should find 'TITULO QUE APARECE NO MEIO' from frame at 5s) ==="
