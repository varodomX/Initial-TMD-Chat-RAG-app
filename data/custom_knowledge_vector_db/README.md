# Custom Knowledge Vector DB

ฐานความรู้เสริมที่ผู้ใช้สอนเอง สำหรับให้ TMD Chat ดึงเป็น context เพิ่มจากเอกสารหลัก

## Files

- `chunks.jsonl` - knowledge chunks แบบ JSON Lines

ตอนนี้ใช้ keyword similarity retriever ฝั่ง Next.js เพื่อให้เพิ่มความรู้ได้เร็วโดยไม่ต้อง rebuild Python index. ถ้าต้องการ production search ที่แม่นขึ้น สามารถย้าย chunks เหล่านี้เข้า pgvector หรือสร้าง embeddings ภายหลังได้
