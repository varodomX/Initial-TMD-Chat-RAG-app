import json
from pathlib import Path
import joblib
import argparse

BASE = Path(__file__).resolve().parents[1] / "data"
vectorizer = joblib.load(BASE / "tfidf_vectorizer.joblib")
vectors = joblib.load(BASE / "vectors_sparse.joblib")
index = joblib.load(BASE / "nearest_neighbors_index.joblib")
chunks = [json.loads(line) for line in (BASE / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]

def search(query: str, top_k: int = 5):
    q = vectorizer.transform([query])
    distances, indices = index.kneighbors(q, n_neighbors=min(top_k, len(chunks)))
    results = []
    for dist, idx in zip(distances[0], indices[0]):
        item = chunks[int(idx)].copy()
        item["score"] = float(1 - dist)
        results.append(item)
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()
    for r in search(args.query, args.top_k):
        print("="*80)
        print(f"score: {r['score']:.4f} | id: {r['id']} | type: {r['type']}")
        print(r["text"])
        print("metadata:", json.dumps(r["metadata"], ensure_ascii=False))
