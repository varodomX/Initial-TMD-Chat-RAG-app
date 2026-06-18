# Khon Kaen Rain Vector DB (2025-2026)

ฐานข้อมูลฝนประจำอำเภอ จังหวัดขอนแก่น จาก CSV ที่อัปโหลด

- CSV ต้นทาง: 18 ไฟล์
- Records รายสถานี-รายเดือน: 450 records
- Chunks สำหรับค้นหา: 493 chunks

## ไฟล์สำคัญ

- `data/chunks.jsonl` — chunks สำหรับ RAG
- `data/cleaned_daily_rain_records.csv` — ข้อมูลฝนรายวันแบบ normalize
- `data/monthly_station_summary.csv` — สรุปรายสถานีรายเดือน
- `data/tfidf_vectorizer.joblib` — ตัวแปลงข้อความเป็น vector แบบ local
- `data/vectors_sparse.joblib` — vector matrix
- `data/nearest_neighbors_index.joblib` — index สำหรับค้นหา
- `scripts/query.py` — ค้นข้อมูลจากฐาน

## วิธีใช้

```bash
pip install pandas scikit-learn joblib
python scripts/query.py "อำเภอเมืองขอนแก่น ฝนมากสุดเดือนไหน" --top-k 5
python scripts/query.py "เดือน 2026-06 อำเภอไหนฝนมากสุด" --top-k 5
```

หมายเหตุ: ชุดนี้เป็น local vector DB แบบ TF-IDF เหมาะกับทดสอบและเชื่อม Next.js เบื้องต้น ถ้าจะขึ้น Vercel แนะนำนำ `chunks.jsonl` ไปสร้าง embedding แล้วอัปเข้า Supabase pgvector
