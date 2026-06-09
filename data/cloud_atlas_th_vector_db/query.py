import json, sys
from pathlib import Path
import joblib

base=Path(__file__).parent
records=[]
with open(base/'cloud_chunks_th.jsonl',encoding='utf-8') as f:
    for line in f:
        records.append(json.loads(line))
vectorizer=joblib.load(base/'tfidf_vectorizer.joblib')
X=joblib.load(base/'vectors_sparse.joblib')
nn=joblib.load(base/'nearest_neighbors_index.joblib')
q=' '.join(sys.argv[1:]).strip() or 'เมฆคิวมูโลนิมบัสคืออะไร'
qv=vectorizer.transform([q])
dist,idx=nn.kneighbors(qv,n_neighbors=min(5,len(records)))
for rank,(d,i) in enumerate(zip(dist[0],idx[0]),1):
    r=records[i]
    score=1-float(d)
    print(json.dumps({
        'rank':rank,
        'score':round(score,4),
        'id':r['id'],
        'title':r['title'],
        'code':r['code'],
        'category':r['category'],
        'url':r['url'],
        'content':r['content']
    },ensure_ascii=False))
