# Synop Vector Database

Source: `Synop(1).pdf`
Pages processed: 101
Chunks: 186

This folder contains a local searchable vector index built from the PDF text.
Because no external embedding model was available in the sandbox, the index uses Thai-friendly character n-gram TF-IDF vectors with cosine similarity.

## Files
- `chunks.jsonl` — extracted text chunks with page metadata
- `tfidf_vectorizer.joblib` — vectorizer
- `vectors_sparse.joblib` — sparse vectors
- `nearest_neighbors_index.joblib` — cosine nearest-neighbor index
- `query.py` — example search script

## Use
```bash
pip install pymupdf scikit-learn joblib
python query.py "วิธีคำนวณความกดอากาศ"
```

## Upgrade to semantic embeddings later
Replace the TF-IDF vectorizer with OpenAI embeddings, bge-m3, multilingual-e5, or sentence-transformers, then store vectors in FAISS/Chroma/Qdrant.
