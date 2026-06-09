"""
Find nearest cloud examples for an input image.
Install:
  pip install torch pillow transformers numpy
Run:
  python scripts/query_clip_image.py path/to/cloud.jpg
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel

ROOT = Path(__file__).resolve().parents[1]
EMB = ROOT / "embeddings" / "image_embeddings.jsonl"
TYPES = {x["code"]: x for x in json.loads((ROOT / "data" / "cloud_types.json").read_text(encoding="utf-8"))}
MODEL_NAME = "openai/clip-vit-base-patch32"

def load_db():
    rows=[]
    if not EMB.exists(): return rows
    for line in EMB.read_text(encoding="utf-8").splitlines():
        if line.strip():
            r=json.loads(line); r["embedding"]=np.array(r["embedding"], dtype=np.float32); rows.append(r)
    return rows

def main():
    if len(sys.argv)<2:
        print("Usage: python query_clip_image.py path/to/cloud.jpg"); return
    rows=load_db()
    if not rows:
        print("ยังไม่มี image embeddings: ใส่รูปลง images/<code>/ แล้วรัน build_clip_embeddings.py ก่อน"); return
    model=CLIPModel.from_pretrained(MODEL_NAME); processor=CLIPProcessor.from_pretrained(MODEL_NAME); model.eval()
    image=Image.open(sys.argv[1]).convert("RGB")
    inputs=processor(images=image, return_tensors="pt")
    with torch.no_grad(): q=model.get_image_features(**inputs)[0].cpu().numpy()
    q=q/np.linalg.norm(q)
    scored=[]
    for r in rows:
        score=float(np.dot(q, r["embedding"]))
        scored.append((score,r))
    scored.sort(reverse=True, key=lambda x:x[0])
    for score,r in scored[:5]:
        t=TYPES.get(r["code"], {})
        print(f'{score:.3f} | {r["code"]} | {t.get("name_th","")} ({t.get("name_en","")}) | {r["file_path"]}')

if __name__ == "__main__": main()
