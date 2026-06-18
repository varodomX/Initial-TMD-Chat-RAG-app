# Meteo Knowledge Vector DB

ฐานความรู้อุตุนิยมวิทยาจาก PDF ที่อัปโหลด จำนวน 8 ไฟล์ รวม 423 chunks

## ใช้งานค้นหาแบบ local

```bash
pip install scikit-learn joblib pymupdf
python scripts/query.py "วิเคราะห์การเคลื่อนตัวของกลุ่มฝนด้วยเรดาร์" --top-k 5
python scripts/query.py "การคำนวณ QNH จากข้อมูลสำรอง" --top-k 5
python scripts/query.py "ภัยธรรมชาติในประเทศไทยมีอะไรบ้าง" --top-k 5
```

## โครงสร้าง

```txt
data/chunks.jsonl          # ข้อมูล chunks พร้อม metadata
vectors/tfidf_vectorizer.joblib
vectors/vectors_sparse.joblib
vectors/nearest_neighbors_index.joblib
scripts/query.py
```

## หมวด category

- radar
- pressure_metar
- natural_disaster
- earthquake
- volunteer_network
- meteorology_general

## หมายเหตุ

ชุดนี้เป็น local vector search แบบ TF-IDF/char n-gram เหมาะสำหรับทดสอบ RAG เบื้องต้นและภาษาไทยที่ตัดคำยาก ถ้าจะอัปขึ้น Vercel แนะนำแปลง `chunks.jsonl` ไปฝัง embedding ด้วย OpenAI แล้วเก็บใน Supabase pgvector
