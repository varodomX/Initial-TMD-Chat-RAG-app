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
OPENAI_CHAT_MODEL=gpt-5.5
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

## Vector Database Adapter

ค่าเริ่มต้นอยู่ที่ `lib/rag/pgvector.ts`. ถ้าฐาน vector ที่มีอยู่เป็น Pinecone, Qdrant, Weaviate หรือ Supabase ให้เพิ่ม adapter ใหม่ที่ implement `Retriever` ใน `lib/rag/types.ts` แล้วสลับใน `lib/rag/retriever.ts`.

## Local Synop Vector DB

โปรเจกต์นี้รองรับฐาน vector แบบไฟล์ที่ `data/synop_vector_db` แล้ว ถ้าไม่ได้ตั้ง `DATABASE_URL` ระบบจะเลือก retriever นี้อัตโนมัติ

ติดตั้ง Python dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r data/synop_vector_db/requirements.txt
```

ตั้งค่า `.env` ถ้าต้องการบังคับใช้ฐานนี้:

```bash
RAG_PROVIDER=synop-local
PYTHON_BIN=.venv/bin/python
```

ลองค้น:

```bash
.venv/bin/python data/synop_vector_db/query.py --json --k 3 "ความกดอากาศคืออะไร"
```
# Initial-TMD-Chat-RAG-app
