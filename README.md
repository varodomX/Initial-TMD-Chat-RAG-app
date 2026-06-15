# TMD Chat RAG

Next.js web app สำหรับแชต AI ที่ใช้ OpenAI Responses API ร่วมกับ RAG จาก vector database.

## Architecture

1. ผู้ใช้ส่งข้อความจากหน้า `/`
2. `/api/chat` สร้าง embedding จากคำถาม
3. retriever ค้น document chunks ที่ใกล้ที่สุดจาก pgvector
4. OpenAI model ตอบโดยใช้ retrieved context
5. UI แสดงคำตอบพร้อม sources

ถ้ายังไม่ตั้ง `DATABASE_URL` ระบบจะใช้ demo retriever เพื่อให้ลองหน้าแชตได้ก่อน

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

ตั้งค่า `.env`

```bash
OPENAI_API_KEY=sk-proj-your-key
OPENAI_CHAT_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AI_PROVIDER=openai
DATABASE_URL=postgres://user:password@localhost:5432/tmd_chat
```

ถ้าไม่มี quota หรือยังไม่ต้องการเรียก OpenAI API ให้ใช้โหมดดึงคำตอบจาก vector database โดยตรง:

```bash
AI_PROVIDER=extractive
RAG_PROVIDER=synop-local
PYTHON_BIN=.venv/bin/python
```

โหมดนี้จะไม่ generate คำตอบใหม่แบบ LLM แต่จะค้น chunks ที่เกี่ยวข้องที่สุดและแสดงเป็นคำตอบพร้อม sources.

## pgvector Schema

ใช้ dimension `1536` สำหรับ `text-embedding-3-small`.

```sql
create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists rag_documents (
  id text primary key default gen_random_uuid()::text,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rag_documents_embedding_idx
on rag_documents
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
```

ถ้าเปลี่ยนไปใช้ `text-embedding-3-large` ให้ปรับ dimension เป็น `3072`.

## Ingest Documents

ส่ง text ยาวให้ระบบ chunk และ upsert เข้า vector database:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "text": "เนื้อหาเอกสาร...",
    "metadata": { "title": "คู่มือระบบ", "source": "manual-v1" }
  }'
```

หรือส่ง chunks เอง:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "documents": [
      {
        "id": "policy-001",
        "content": "ข้อความ chunk แรก",
        "metadata": { "title": "Policy" }
      }
    ]
  }'
```

## Upload Local Vector DB To Supabase

ใช้กับ Supabase/Postgres ที่เปิด `pgvector` แล้ว และ table ชื่อ `rag_documents`.
สคริปต์นี้จะอ่านไฟล์ `chunks.jsonl` ใน `data/` สร้าง OpenAI embeddings แล้ว upsert เข้า Supabase ให้เอง.

ตั้งค่า `.env.local` ก่อน:

```bash
OPENAI_API_KEY=sk-proj-your-key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
RAG_PROVIDER=pgvector
RAG_TABLE=rag_documents
RAG_MATCH_COUNT=6
```

ทดสอบจำนวนเอกสารที่จะอัปโหลด:

```bash
npm run ingest:pgvector -- --dry-run
```

อัปโหลดฐานความรู้เริ่มต้นทั้งหมด:

```bash
npm run ingest:pgvector
```

หรือเลือกไฟล์เอง:

```bash
npm run ingest:pgvector -- data/custom_knowledge_vector_db/chunks.jsonl data/khonkaen_station_vector_db/chunks.jsonl
```

หลังอัปโหลดแล้ว ให้ตั้ง Environment Variables บน Vercel เป็นค่าเดียวกัน โดยเฉพาะ `DATABASE_URL`, `RAG_PROVIDER=pgvector`, `RAG_TABLE=rag_documents`, `OPENAI_API_KEY`, `OPENAI_EMBEDDING_MODEL`.

## Vector Database Adapter

ค่าเริ่มต้นอยู่ที่ `lib/rag/pgvector.ts`. ถ้าฐาน vector ที่มีอยู่เป็น Pinecone, Qdrant, Weaviate หรือ Supabase ให้เพิ่ม adapter ใหม่ที่ implement `Retriever` ใน `lib/rag/types.ts` แล้วสลับใน `lib/rag/retriever.ts`.

## Local Synop Vector DB

โปรเจกต์นี้รองรับฐาน vector แบบไฟล์ใน `data/` แล้ว เช่น `data/synop_vector_db` และ `data/khonkaen_station_vector_db`.
ถ้าตั้ง `RAG_PROVIDER=local-all` ระบบจะรวมหลายฐานเข้าด้วยกันอัตโนมัติเมื่อโฟลเดอร์นั้นมีอยู่

ติดตั้ง Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r data/synop_vector_db/requirements.txt
```

ตั้งค่า `.env` ถ้าต้องการบังคับใช้ฐานนี้:

```bash
RAG_PROVIDER=local-all
PYTHON_BIN=.venv/bin/python
```

ลองค้น:

```bash
.venv/bin/python data/synop_vector_db/query.py --json --k 3 "ความกดอากาศคืออะไร"
.venv/bin/python data/khonkaen_station_vector_db/search.py --json --k 3 "สถานีขอนแก่น WMO คืออะไร"
```

## Chat Logs

ทุกครั้งที่ผู้ใช้ส่งข้อความผ่าน `/api/chat` ระบบจะบันทึก prompt, คำตอบ, sources, mode และเวลาลงไฟล์:

```text
data/chat_logs/chat_messages.jsonl
```

ไฟล์นี้ถูก ignore จาก git เพื่อไม่ให้ข้อมูลสนทนาหรือข้อมูลส่วนตัวหลุดขึ้น repository. บน Vercel filesystem ไม่ถาวร ถ้าต้องเก็บ production logs ให้ย้ายไปฐานข้อมูล เช่น Supabase/Postgres.

## Image Uploads

หน้าแชตรองรับการแนบรูปภาพ `png`, `jpg`, `webp`, `gif` ขนาดไม่เกิน 8 MB ต่อไฟล์ รูปจะถูกเก็บไว้ที่:

```text
data/uploads/
```

และเรียกดูผ่าน URL แบบนี้:

```text
/api/uploads/<file-name>
```

เมื่อใช้ `AI_PROVIDER=openai` รูปจะถูกแปลงเป็น data URL ฝั่ง server แล้วส่งเข้า OpenAI vision model พร้อมข้อความล่าสุด. โฟลเดอร์ `data/uploads/` ถูก ignore จาก git แล้ว

บน Vercel filesystem ไม่เหมาะกับการเก็บรูปถาวร ถ้าจะใช้งาน production ควรย้าย upload storage ไป S3, Supabase Storage หรือ Vercel Blob.
# Initial-TMD-Chat-RAG-app
