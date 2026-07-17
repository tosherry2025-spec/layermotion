# -*- coding: utf-8 -*-
import os, json
from psd_tools import PSDImage

SRC = "命名版本.psd"
OUT = "layers_named"
os.makedirs(OUT, exist_ok=True)

psd = PSDImage.open(SRC)
print("canvas size:", psd.size)

manifest = []
idx = 0

def export(layers, parent=""):
    global idx
    for layer in layers:
        path = f"{parent}/{layer.name}" if parent else layer.name
        if layer.is_group():
            print(f"[group] {path}")
            export(layer, path)
            continue
        img = layer.composite(viewport=psd.bbox)
        if img is None or img.getchannel("A").getbbox() is None:
            print(f"  skip empty: {path}")
            continue
        safe = "".join(c if c.isalnum() or c in "-_ " else "_" for c in layer.name).strip()
        fname = f"{idx:02d}_{safe}.png"
        img.save(os.path.join(OUT, fname))
        bbox = img.getchannel("A").getbbox()
        manifest.append({"index": idx, "name": layer.name, "path": path,
                         "file": f"{OUT}/{fname}", "bbox": bbox, "visible": layer.visible})
        print(f"  saved {fname}  <= '{path}'  bbox={bbox} visible={layer.visible}")
        idx += 1

export(psd)
with open("layers_named/manifest.json", "w", encoding="utf-8") as f:
    json.dump({"canvas": list(psd.size), "layers": manifest}, f, ensure_ascii=False, indent=2)
print("\ndone. manifest written.")
