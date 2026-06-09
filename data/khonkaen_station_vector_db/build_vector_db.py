# ใช้รันใหม่เมื่อแก้ chunks.jsonl หรือเปลี่ยนเอกสารต้นทาง
import json, joblib
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

BASE = Path(__file__).parent
chunks = [json.loads(line) for line in (BASE/'chunks.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
texts = [c['title'] + '\n' + c['text'] for c in chunks]
vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(2,5), max_features=50000)
X = vectorizer.fit_transform(texts)
nn = NearestNeighbors(n_neighbors=min(5, len(chunks)), metric='cosine').fit(X)
metadata = json.loads((BASE/'station_metadata.json').read_text(encoding='utf-8'))
joblib.dump({'vectorizer': vectorizer, 'matrix': X, 'nn': nn, 'chunks': chunks, 'metadata': metadata}, BASE/'vector_db.joblib')
print(f'created vector_db.joblib with {len(chunks)} chunks')
