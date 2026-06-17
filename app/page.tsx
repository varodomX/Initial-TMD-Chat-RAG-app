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
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
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

  function startNewChat() {
    removeSelectedImage();
    setConversationId(crypto.randomUUID());
    setMessages([
      {
        role: "assistant",
        content: "สวัสดีครับ ผมคือ TMD Chat",
      },
    ]);
    setSources([]);
    setInput("");
    setError("");
    inputRef.current?.focus();
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030305] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(36,199,184,0.22),transparent_28%),radial-gradient(circle_at_83%_15%,rgba(244,63,94,0.18),transparent_25%),radial-gradient(circle_at_75%_86%,rgba(245,158,11,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-amber-400" />

      <div className="relative grid min-h-screen lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-5 border-b border-white/10 bg-zinc-950/80 p-4 backdrop-blur-xl lg:h-screen lg:border-b-0 lg:border-r lg:p-5">
          <div className="flex items-center gap-3">
            <span className="relative grid size-11 place-items-center rounded-md border border-white/10 bg-zinc-900 text-cyan-200 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
              <span className="absolute inset-2 rounded-full border border-fuchsia-400/70" />
              <Sparkles size={18} />
            </span>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-white">
                TMDRAG
              </h1>
              <p className="text-xs text-zinc-500">Meteorological AI Workspace</p>
            </div>
          </div>

          <button
            className="flex h-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-sm font-medium text-zinc-100 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
            onClick={startNewChat}
            type="button"
          >
            + New Chat
          </button>

          <section className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3">
            <div className="grid grid-cols-[22px_1fr_auto] items-center gap-3 text-xs text-zinc-400">
              <Database className="text-cyan-300" size={17} />
              <span>Retriever</span>
              <strong className="rounded bg-cyan-300/10 px-2 py-1 font-medium text-cyan-100">
                {sourceCount ? `${sourceCount} hits` : "ready"}
              </strong>
            </div>
            <div className="grid grid-cols-[22px_1fr_auto] items-center gap-3 text-xs text-zinc-400">
              <BookOpen className="text-fuchsia-300" size={17} />
              <span>Mode</span>
              <strong className="rounded bg-fuchsia-300/10 px-2 py-1 font-medium text-fuchsia-100">
                RAG
              </strong>
            </div>
          </section>

          <section className="grid gap-2">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Main
            </h2>
            {["Templates", "Saved Chat", "Files", "History", "Integrations"].map(
              (item) => (
                <button
                  className="flex h-9 items-center rounded-md px-3 text-left text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  key={item}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </section>

          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Sources
            </h2>
            {sources.length ? (
              sources.map((source) => (
                <article
                  className="grid gap-2 rounded-md border border-white/10 bg-zinc-900/70 p-3 shadow-sm"
                  key={source.id}
                >
                  <strong className="text-sm font-medium text-zinc-100">
                    {typeof source.metadata.title === "string"
                      ? source.metadata.title
                      : source.id}
                  </strong>
                  <p className="source-content text-xs leading-5 text-zinc-400">
                    {source.content}
                  </p>
                  {typeof source.metadata.imageUrl === "string" && (
                    <img
                      alt={
                        typeof source.metadata.title === "string"
                          ? source.metadata.title
                          : source.id
                      }
                      className="max-h-28 w-full rounded-md object-cover"
                      src={source.metadata.imageUrl}
                    />
                  )}
                  <small className="text-[11px] text-cyan-300/70">
                    score {source.score.toFixed(2)}
                  </small>
                </article>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-zinc-500">
                Sources from the latest answer will appear here.
              </p>
            )}
          </section>
        </aside>

        <section className="grid min-h-[70vh] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-4 p-4 sm:p-6 lg:h-screen">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <nav className="flex items-center gap-5 text-xs font-medium text-zinc-500">
              <span className="text-zinc-100">Workspace</span>
              <span>Synop</span>
              <span>Cloud Atlas</span>
              <span>Station</span>
            </nav>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
              Production
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-zinc-950/60 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_0_70px_rgba(236,72,153,0.16)]">
            <div className="flex min-h-12 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <span className="size-3 rounded-full border border-cyan-300 bg-fuchsia-400/80" />
                TMD Chat
              </div>
              <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-zinc-500">
                Invite
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 sm:p-5">
              <div className="grid gap-1 border-b border-white/10 pb-4">
                <p className="text-2xl font-semibold text-white">TMD Chat</p>
                <p className="text-sm text-zinc-500">How can I help you?</p>
              </div>

              {messages.map((message, index) => (
                <div
                  className={`grid max-w-3xl gap-2 ${
                    message.role === "user" ? "ml-auto justify-items-end" : ""
                  }`}
                  key={index}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    {message.role === "assistant" ? "AI" : "You"}
                  </span>
                  <div
                    className={`grid gap-3 rounded-md border p-4 leading-7 shadow-sm ${
                      message.role === "user"
                        ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50"
                        : "border-white/10 bg-white/[0.045] text-zinc-100"
                    }`}
                  >
                    {message.imageUrl && (
                      <img
                        alt={message.imageName || "Uploaded image"}
                        className="max-h-80 w-full max-w-[420px] rounded-md object-contain"
                        src={message.imageUrl}
                      />
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="grid max-w-3xl gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                    AI
                  </span>
                  <p className="flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.045] p-4 text-sm text-zinc-400 shadow-sm">
                    <Loader2 className="animate-spin text-cyan-300" size={16} />
                    กำลังค้นเอกสารและร่างคำตอบ
                  </p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mx-auto w-full max-w-6xl rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}

          <form
            className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)_48px_48px] gap-3 rounded-md border border-white/10 bg-zinc-950/90 p-3 shadow-[0_0_40px_rgba(34,211,238,0.1)]"
            onSubmit={onSubmit}
          >
            {selectedImage && (
              <div className="col-span-full grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] p-2">
                <img
                  alt={selectedImage.file.name}
                  className="h-12 w-16 rounded object-cover"
                  src={selectedImage.previewUrl}
                />
                <span className="truncate text-sm text-zinc-400">
                  {selectedImage.file.name}
                </span>
                <button
                  aria-label="Remove image"
                  className="grid size-9 place-items-center rounded-md text-zinc-500 transition hover:bg-white/10 hover:text-white"
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
              className="min-h-14 max-h-44 resize-y border-0 bg-transparent py-3 leading-6 text-zinc-100 outline-none placeholder:text-zinc-600"
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
              className="grid size-12 place-items-center self-end rounded-md border border-white/10 bg-white/[0.04] text-cyan-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <ImagePlus size={20} />
            </button>
            <button
              aria-label="Send message"
              className="grid size-12 place-items-center self-end rounded-md bg-cyan-200 text-zinc-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-45"
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
      </div>
    </main>
  );
}
