import argparse
import json
import joblib
import warnings
from pathlib import Path

try:
    from sklearn.exceptions import InconsistentVersionWarning

    warnings.filterwarnings('ignore', category=InconsistentVersionWarning)
except Exception:
    pass

db_path = Path(__file__).with_name('vector_db.joblib')
db = joblib.load(db_path)

parser = argparse.ArgumentParser()
parser.add_argument('--json', action='store_true')
parser.add_argument('--k', type=int, default=5)
parser.add_argument('query', nargs='*')
args = parser.parse_args()

query = ' '.join(args.query) or input('คำถาม: ')
qv = db['vectorizer'].transform([query])
dist, idx = db['nn'].kneighbors(qv, n_neighbors=min(args.k, len(db['chunks'])))
results = []

for rank, (d, i) in enumerate(zip(dist[0], idx[0]), 1):
    c = db['chunks'][int(i)]
    score = 1 - float(d)
    results.append({
        'rank': rank,
        'score': score,
        **c,
    })

if args.json:
    print(json.dumps(results, ensure_ascii=False))
else:
    for result in results:
        score = result['score']
        print(f"\n#{result['rank']} score={score:.3f} id={result['id']} | {result['title']}")
        print(result['text'][:700].replace('\n',' '))
