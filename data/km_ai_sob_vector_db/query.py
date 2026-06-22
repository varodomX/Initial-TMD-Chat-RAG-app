import json
from pathlib import Path
import argparse
import joblib

BASE = Path(__file__).resolve().parents[1] if Path(__file__).name == "query.py" and Path(__file__).parent.name == "scripts" else Path(__file__).resolve().parent
DATA = BASE / "data" if (BASE / "data").exists() else BASE

chunks = [json.loads(line) for line in (DATA / "chunks.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
vectorizer = joblib.load(DATA / "tfidf_vectorizer.joblib")
vectors = joblib.load(DATA / "vectors_sparse.joblib")
index = joblib.load(DATA / "nearest_neighbors_index.joblib")

def search(query: str, k: int = 5):
    qv = vectorizer.transform([query])
    distances, indices = index.kneighbors(qv, n_neighbors=min(k, len(chunks)))
    results = []
    for dist, idx in zip(distances[0], indices[0]):
        item = dict(chunks[int(idx)])
        item["score"] = round(float(1 - dist), 4)
        results.append(item)
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("query")
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()
    for r in search(args.query, args.k):
        print("="*80)
        print(f"score: {r['score']} | {r.get('title','')} | {r.get('source_file','')}")
        print(r["content"][:1200])
