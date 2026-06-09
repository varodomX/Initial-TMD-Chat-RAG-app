# Cloud Multimodal DB Starter สำหรับ TMDChat / Next.js

ชุดนี้เป็นโครงฐานข้อมูล Multimodal เรื่องเมฆ ประกอบด้วย:

- `data/cloud_types.json` ข้อมูลเมฆ 10 สกุลหลักภาษาไทย
- `data/cloud_image_manifest.csv` รายการรูปตัวอย่างที่ต้องใส่เพิ่ม
- `images/<code>/` โฟลเดอร์เก็บภาพเมฆแยกตามชนิด
- `scripts/build_clip_embeddings.py` สร้าง image embeddings ด้วย CLIP
- `scripts/query_clip_image.py` ค้นรูปเมฆใกล้เคียงจากภาพที่อัปโหลด
- `nextjs/app/api/cloud-vision/route.ts` ตัวอย่าง API Route ใช้ OpenAI Vision วิเคราะห์ภาพ
- `nextjs/lib/cloud-multimodal.ts` helper สำหรับเรียกจากหน้าแชท

## โครงสร้างที่ควรใช้จริง

```txt
cloud_multimodal_db/
├─ data/
│  ├─ cloud_types.json
│  └─ cloud_image_manifest.csv
├─ images/
│  ├─ Ci/
│  ├─ Cc/
│  ├─ Cs/
│  ├─ Ac/
│  ├─ As/
│  ├─ Ns/
│  ├─ Sc/
│  ├─ St/
│  ├─ Cu/
│  └─ Cb/
├─ embeddings/
│  └─ image_embeddings.jsonl
├─ scripts/
└─ nextjs/
```

## วิธีใส่รูปเพื่อทำฐานจริง

1. หา/ถ่ายภาพเมฆจริง แล้วแยกใส่โฟลเดอร์ เช่น

```txt
images/Cb/cb_001.jpg
images/Cb/cb_002.jpg
images/Cu/cu_001.jpg
```

2. เพิ่มรายการใน `data/cloud_image_manifest.csv`

```csv
id,code,file_path,source_url,license,note
cb_002,Cb,images/Cb/cb_002.jpg,,ภาพถ่ายเอง,ยอดเมฆแผ่คล้ายทั่ง
```

3. สร้าง embeddings

```bash
pip install torch pillow transformers scikit-learn numpy
python scripts/build_clip_embeddings.py
```

4. ทดสอบค้นรูป

```bash
python scripts/query_clip_image.py test_cloud.jpg
```

## ใช้กับ Next.js แบบเร็วสุด

คัดลอกไฟล์จาก `nextjs/app/api/cloud-vision/route.ts` ไปไว้ที่โปรเจกต์ Next.js ของคุณ:

```txt
app/api/cloud-vision/route.ts
```

ติดตั้ง OpenAI SDK:

```bash
npm install openai
```

เพิ่ม `.env.local`:

```env
OPENAI_API_KEY=sk-xxxx
```

จากหน้าเว็บเรียก:

```ts
import { classifyCloudImage } from "@/lib/cloud-multimodal";

const result = await classifyCloudImage(file);
console.log(result);
```

## แนวทางแนะนำ

ระยะแรกใช้ OpenAI Vision จำแนกภาพก่อน เพราะไม่ต้องเทรนโมเดลเอง จากนั้นใช้ `cloud_atlas_th_vector_db` ที่ทำไว้แล้วเพื่ออธิบายผลเป็นภาษาไทย

Flow:

```txt
ผู้ใช้อัปโหลดรูปเมฆ
↓
OpenAI Vision วิเคราะห์ว่าเป็น Ci/Cc/Cs/Ac/As/Ns/Sc/St/Cu/Cb
↓
ค้นคำอธิบายจาก Cloud Atlas TH Vector DB
↓
ตอบภาษาไทยพร้อมเหตุผลและข้อควรระวัง
```

## หมายเหตุสำคัญ

ไฟล์ชุดนี้ยังไม่ได้ใส่ภาพถ่ายจริง เนื่องจากควรใช้ภาพที่มีสิทธิ์ใช้งานชัดเจน เช่น ภาพถ่ายเอง ภาพจากหน่วยงานที่อนุญาต หรือภาพจาก WMO ที่ตรวจสอบเงื่อนไขการใช้งานแล้ว
