#!/usr/bin/env python3
"""Compress images in reportpdfexport/assets/images/ using Pillow."""
import os
from PIL import Image

IMG_DIR = "/Users/tomaszzagala/.openclaw/workspace/reportpdfexport/assets/images"

total_before = 0
total_after = 0

for fname in sorted(os.listdir(IMG_DIR)):
    fpath = os.path.join(IMG_DIR, fname)
    if not os.path.isfile(fpath):
        continue
    
    before = os.path.getsize(fpath)
    
    if fname.lower().endswith('.png'):
        img = Image.open(fpath)
        # Convert RGBA to RGB if no transparency actually used, or keep RGBA
        # Re-save as optimized PNG
        original_mode = img.mode
        
        # Resize if larger than 1200px wide (hero images don't need more for PDF)
        max_w = 1200
        if img.width > max_w:
            ratio = max_w / img.width
            new_h = int(img.height * ratio)
            img = img.resize((max_w, new_h), Image.LANCZOS)
        
        # Save optimized PNG
        img.save(fpath, "PNG", optimize=True)
        
        after = os.path.getsize(fpath)
        pct = (1 - after/before) * 100 if before > 0 else 0
        total_before += before
        total_after += after
        print(f"  🖼️ {fname}: {before/1024:.0f}KB → {after/1024:.0f}KB ({pct:.0f}% saved)")
        img.close()
    
    elif fname.lower().endswith(('.jpg', '.jpeg')):
        img = Image.open(fpath)
        
        # Resize if larger than 1200px wide
        max_w = 1200
        if img.width > max_w:
            ratio = max_w / img.width
            new_h = int(img.height * ratio)
            img = img.resize((max_w, new_h), Image.LANCZOS)
        
        # Save as optimized JPEG (quality 80 — good balance)
        if img.mode == 'RGBA':
            img = img.convert('RGB')
        img.save(fpath, "JPEG", quality=80, optimize=True)
        
        after = os.path.getsize(fpath)
        pct = (1 - after/before) * 100 if before > 0 else 0
        total_before += before
        total_after += after
        print(f"  🖼️ {fname}: {before/1024:.0f}KB → {after/1024:.0f}KB ({pct:.0f}% saved)")
        img.close()
    
    elif fname.lower().endswith('.svg'):
        total_before += before
        total_after += before
        print(f"  ✅ {fname}: {before/1024:.0f}KB (SVG, skipped)")

pct = (1 - total_after/total_before) * 100 if total_before > 0 else 0
print(f"\n=== Total: {total_before/1024/1024:.1f}MB → {total_after/1024/1024:.1f}MB ({pct:.0f}% saved) ===")