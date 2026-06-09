import json
import warnings
from pathlib import Path
import joblib

warnings.filterwarnings("ignore", category=UserWarning, module="sklearn")

BASE = Path(__file__).resolve().parent
vectorizer = joblib.load(BASE / "tfidf_vectorizer.joblib")
index = joblib.load(BASE / "nearest_neighbors_index.joblib")
X = joblib.load(BASE / "vectors_sparse.joblib")
records = [json.loads(line) for line in open(BASE / "chunks.jsonl", encoding="utf-8")]

def search(query: str, k: int = 5):
    qv = vectorizer.transform([query])
    distances, indices = index.kneighbors(qv, n_neighbors=min(k, len(records)))
    results = []
    for d, i in zip(distances[0], indices[0]):
        item = records[int(i)].copy()
        item["score"] = float(1 - d)
        results.append(item)
    return results

if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("query", nargs="*", help="Search query")
    parser.add_argument("--json", action="store_true", help="Print JSON results")
    parser.add_argument("--k", type=int, default=5, help="Number of matches")
    args = parser.parse_args()

    q = " ".join(args.query) or input("Query: ")
    results = search(q, args.k)

    if args.json:
        print(json.dumps(results, ensure_ascii=False))
        sys.exit(0)

    for r in results:
        print(f"\n[{r['score']:.3f}] page {r['page']} | {r['id']}")
        print(r['text'][:700].replace("\n", " "))
