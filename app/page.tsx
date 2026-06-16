"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Database,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  X,
} from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  imageName?: string;
  imageUrl?: string;
};

type Source = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  if (!text) {
    return {
      error: response.ok
        ? "เซิร์ฟเวอร์ตอบกลับว่างเปล่า"
        : `เซิร์ฟเวอร์ตอบกลับว่างเปล่า (${response.status})`,
    };
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: response.ok
        ? "เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON"
        : text.slice(0, 300) || `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (${response.status})`,
    };
  }
}

export default function Home() {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "สวัสดีครับ ผมคือ TMD Chat",
    },
  ]);
  const [sources, setSources] = useState<Source[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [selectedImage, setSelectedImage] = useState<{
    file: File;
    previewUrl: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit =
    (input.trim().length > 0 || Boolean(selectedImage)) && !isLoading;
  const sourceCount = useMemo(() => sources.length, [sources]);

  function removeSelectedImage() {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }

    setSelectedImage(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function onImageSelected(file?: File) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setError("ไฟล์รูปต้องไม่เกิน 8 MB");
      return;
    }

    removeSelectedImage();
    setError("");
    setSelectedImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function uploadSelectedImage() {
    if (!selectedImage) return undefined;

    const formData = new FormData();
    formData.append("file", selectedImage.file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(data.error || "อัปโหลดรูปไม่สำเร็จ");
    }

    return data.image as { name: string; url: string };
  }

  async function sendMessage(nextInput?: string) {
    const content = (nextInput ?? input).trim();
    if ((!content && !selectedImage) || isLoading) return;

    setIsLoading(true);
    setError("");

    try {
      const image = await uploadSelectedImage();
      const userMessage: Message = {
        role: "user",
        content: content || "ช่วยวิเคราะห์รูปนี้ให้หน่อย",
        imageName: image?.name,
        imageUrl: image?.url,
      };
      const nextMessages: Message[] = [...messages, userMessage];

      setMessages(nextMessages);
      setInput("");
      removeSelectedImage();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, messages: nextMessages }),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.error || "ส่งข้อความไม่สำเร็จ");
      }

      setMessages((current) => [...current, data.message]);
      setSources(data.sources ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="grid min-h-screen bg-[#f5f7fb] text-slate-900 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-5 border-b border-slate-200 bg-white/90 p-5 lg:h-screen lg:border-b-0 lg:border-r lg:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-teal-700 text-white shadow-sm">
            <Sparkles size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold leading-tight text-slate-950">
              TMD Chat
            </h1>
            <p className="text-sm text-slate-500">OpenAI + RAG Vector DB</p>
          </div>
        </div>

        <section className="grid gap-3 rounded-lg border border-slate-200 bg-teal-50/70 p-4">
          <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 text-sm text-slate-600">
            <Database className="text-teal-700" size={19} />
            <span>Retriever</span>
            <strong className="font-semibold text-slate-950">
              {sourceCount ? `${sourceCount} hits` : "ready"}
            </strong>
          </div>
          <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 text-sm text-slate-600">
            <BookOpen className="text-teal-700" size={19} />
            <span>Mode</span>
            <strong className="font-semibold text-slate-950">RAG</strong>
          </div>
        </section>

        <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <h2 className="text-xs font-bold uppercase text-slate-500">Sources</h2>
          {sources.length ? (
            sources.map((source) => (
              <article
                className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                key={source.id}
              >
                <div>
                  <strong className="text-sm text-slate-900">
                    {typeof source.metadata.title === "string"
                      ? source.metadata.title
                      : source.id}
                  </strong>
                </div>
                <p className="source-content text-sm leading-6 text-slate-600">
                  {source.content}
                </p>
                {typeof source.metadata.imageUrl === "string" && (
                  <img
                    alt={
                      typeof source.metadata.title === "string"
                        ? source.metadata.title
                        : source.id
                    }
                    className="max-h-32 w-full rounded-lg object-cover"
                    src={source.metadata.imageUrl}
                  />
                )}
                <small className="text-xs text-slate-400">
                  score {source.score.toFixed(2)}
                </small>
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
              Sources from the latest answer will appear here.
            </p>
          )}
        </section>
      </aside>

      <section className="grid min-h-[70vh] min-w-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-4 p-4 sm:p-6 lg:h-screen">
        <div className="flex min-h-0 flex-col gap-4 overflow-auto rounded-lg border border-slate-200 bg-white/45 p-3 shadow-sm sm:p-5">
          {messages.map((message, index) => (
            <div
              className={`grid max-w-3xl gap-2 ${
                message.role === "user" ? "ml-auto justify-items-end" : ""
              }`}
              key={index}
            >
              <span className="text-xs font-bold uppercase text-slate-500">
                {message.role === "assistant" ? "AI" : "You"}
              </span>
              <div
                className={`grid gap-3 rounded-lg border p-4 leading-7 shadow-sm ${
                  message.role === "user"
                    ? "border-teal-200 bg-teal-50 text-slate-900"
                    : "border-slate-200 bg-white text-slate-900"
                }`}
              >
                {message.imageUrl && (
                  <img
                    alt={message.imageName || "Uploaded image"}
                    className="max-h-80 w-full max-w-[420px] rounded-lg object-contain"
                    src={message.imageUrl}
                  />
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="grid max-w-3xl gap-2">
              <span className="text-xs font-bold uppercase text-slate-500">AI</span>
              <p className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm">
                <Loader2 className="animate-spin text-teal-700" size={16} />
                กำลังค้นเอกสารและร่างคำตอบ
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-700">
            {error}
          </div>
        )}

        <form
          className="grid grid-cols-[minmax(0,1fr)_48px_48px] gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/70"
          onSubmit={onSubmit}
        >
          {selectedImage && (
            <div className="col-span-full grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                alt={selectedImage.file.name}
                className="h-12 w-16 rounded-md object-cover"
                src={selectedImage.previewUrl}
              />
              <span className="truncate text-sm text-slate-600">
                {selectedImage.file.name}
              </span>
              <button
                aria-label="Remove image"
                className="grid size-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                onClick={removeSelectedImage}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            aria-label="Message"
            className="min-h-14 max-h-44 resize-y border-0 bg-transparent py-3 leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="ค้นหาคำถาม"
            rows={2}
            value={input}
          />
          <input
            accept="image/gif,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => onImageSelected(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <button
            aria-label="Attach image"
            className="grid size-12 place-items-center self-end rounded-lg bg-teal-50 text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImagePlus size={20} />
          </button>
          <button
            aria-label="Send message"
            className="grid size-12 place-items-center self-end rounded-lg bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSubmit}
            type="submit"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Send size={20} />
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
