"""
Build image embeddings for cloud photos using CLIP.
Install:
  pip install torch pillow transformers scikit-learn numpy
Run:
  python scripts/build_clip_embeddings.py
"""
import csv, json, os
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "cloud_image_manifest.csv"
OUT = ROOT / "embeddings" / "image_embeddings.jsonl"
MODEL_NAME = "openai/clip-vit-base-patch32"

def main():
    model = CLIPModel.from_pretrained(MODEL_NAME)
    processor = CLIPProcessor.from_pretrained(MODEL_NAME)
    model.eval()
    rows_written = 0
    with MANIFEST.open(newline="", encoding="utf-8") as f, OUT.open("w", encoding="utf-8") as out:
        for row in csv.DictReader(f):
            image_path = ROOT / row["file_path"]
            if not image_path.exists():
                continue
            image = Image.open(image_path).convert("RGB")
            inputs = processor(images=image, return_tensors="pt")
            with torch.no_grad():
                emb = model.get_image_features(**inputs)[0].cpu().numpy()
            emb = emb / np.linalg.norm(emb)
            out.write(json.dumps({
                "id": row["id"],
                "code": row["code"],
                "file_path": row["file_path"],
                "embedding": emb.tolist(),
                "source_url": row.get("source_url", ""),
                "license": row.get("license", "")
            }, ensure_ascii=False) + "\n")
            rows_written += 1
    print(f"written {rows_written} embeddings -> {OUT}")

if __name__ == "__main__":
    main()
