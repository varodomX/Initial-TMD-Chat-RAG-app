# KM AI ศบ Vector DB

สร้างจากไฟล์:
- Km ai ศบ รวมข้อมูล.docx
- Km ai ศบ รวมข้อมูล.pdf

จำนวน chunks: 139

## ใช้งานค้นหาในเครื่อง

```bash
pip install scikit-learn joblib python-docx pypdf
python scripts/query.py "เมฆเกิดจากอะไร"
python scripts/query.py "กรมอุตุนิยมวิทยามีหน้าที่อะไร" --k 5
```

## ใช้กับ Next.js

คัดลอกโฟลเดอร์นี้ไปไว้ในโปรเจกต์:

```txt
data/km_ai_sob_vector_db/
```

จากนั้นดูตัวอย่าง API ที่:

```txt
api/nextjs-route-example.ts
```

หมายเหตุ: ชุดนี้เป็น local TF-IDF vector DB สำหรับทดสอบ RAG แบบไม่เสียค่า embedding API ถ้าจะใช้ production บน Vercel แนะนำแปลง `chunks.jsonl` ไปทำ embeddings แล้วเก็บใน Supabase pgvector
