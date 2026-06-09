# Khon Kaen Meteorological Station Vector Database

ฐานข้อมูลเวกเตอร์จากข้อมูลสถานีขอนแก่น/ศูนย์อุตุนิยมวิทยาภาคตะวันออกเฉียงเหนือตอนบน

## ไฟล์ในชุดนี้
- `chunks.jsonl` — ข้อมูลที่ถูกแบ่งเป็นชิ้นสำหรับ RAG
- `station_metadata.json` — metadata หลักของสถานี เช่น WMO, พิกัด, เวลาเข้าตรวจ
- `vector_db.joblib` — vector database แบบ local ใช้ TF-IDF char n-gram เหมาะกับภาษาไทย ไม่ต้องใช้ API
- `search.py` — สคริปต์ค้นหาข้อมูลจากฐานเวกเตอร์
- `build_vector_db.py` — สคริปต์สร้างฐานใหม่จาก `chunks.jsonl`

## วิธีใช้
```bash
pip install scikit-learn joblib python-docx
python search.py "สถานีขอนแก่น WMO คืออะไร"
python search.py "ตรวจอากาศผิวพื้นเวลาไหนบ้าง"
python search.py "ค่าฝนเฉลี่ยทั้งปีเท่าไหร่"
```

## หมายเหตุ
ชุดนี้เป็น local vector search สำหรับเริ่มต้น ถ้าจะต่อกับ OpenAI/Pinecone/Chroma ให้ใช้ `chunks.jsonl` เป็นข้อมูลตั้งต้น แล้วเปลี่ยนส่วน embedding ได้ทันที
