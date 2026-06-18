#!/usr/bin/env python3
# Local TF-IDF vector search for Thai meteorology documents.
# Usage: python scripts/query.py "เรดาร์ตรวจอากาศ dBZ คืออะไร" --top-k 5
from pathlib import Path
import argparse, json
import joblib

ROOT = Path(__file__).resolve().parents[1]
chunks = [json.loads(line) for line in (ROOT/'data'/'chunks.jsonl').open(encoding='utf-8')]
vectorizer = joblib.load(ROOT/'vectors'/'tfidf_vectorizer.joblib')
index = joblib.load(ROOT/'vectors'/'nearest_neighbors_index.joblib')

def search(q, top_k=5, category=None):
    qv = vectorizer.transform([q])
    distances, indices = index.kneighbors(qv, n_neighbors=min(max(top_k*3, top_k), len(chunks)))
    results=[]
    for dist, idx in zip(distances[0], indices[0]):
        c = chunks[int(idx)]
        if category and c.get('category') != category:
            continue
        results.append({
            'score': round(1-float(dist), 4),
            'source_file': c['source_file'],
            'page': c['page'],
            'category': c['category'],
            'text': c['text']
        })
        if len(results) >= top_k: break
    return results

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('question')
    ap.add_argument('--top-k', type=int, default=5)
    ap.add_argument('--category', default=None)
    args = ap.parse_args()
    print(json.dumps(search(args.question, args.top_k, args.category), ensure_ascii=False, indent=2))
