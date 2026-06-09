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

export default function Home() {
  const [conversationId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "สวัสดีครับ ผมคือ TMD Chat ถามข้อมูลจากเอกสารใน vector database ได้เลย ถ้ายังไม่ได้ตั้ง DATABASE_URL ผมจะใช้ข้อมูล demo ให้ลอง flow ก่อน",
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
    const data = await response.json();

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
      const data = await response.json();

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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <div>
            <h1>TMD Chat</h1>
            <p>OpenAI + RAG Vector DB</p>
          </div>
        </div>

        <section className="status-panel">
          <div className="status-row">
            <Database size={18} />
            <span>Retriever</span>
            <strong>{sourceCount ? `${sourceCount} hits` : "ready"}</strong>
          </div>
          <div className="status-row">
            <BookOpen size={18} />
            <span>Mode</span>
            <strong>RAG</strong>
          </div>
        </section>

        <section className="sources">
          <h2>Sources</h2>
          {sources.length ? (
            sources.map((source, index) => (
              <article className="source-card" key={source.id}>
                <div>
                  <span>[{index + 1}]</span>
                  <strong>
                    {typeof source.metadata.title === "string"
                      ? source.metadata.title
                      : source.id}
                  </strong>
                </div>
                <p>{source.content}</p>
                <small>score {source.score.toFixed(2)}</small>
              </article>
            ))
          ) : (
            <p className="empty">Sources from the latest answer will appear here.</p>
          )}
        </section>
      </aside>

      <section className="chat">
        <div className="chat-scroll">
          {messages.map((message, index) => (
            <div className={`message ${message.role}`} key={index}>
              <span>{message.role === "assistant" ? "AI" : "You"}</span>
              <div className="message-body">
                {message.imageUrl && (
                  <img
                    alt={message.imageName || "Uploaded image"}
                    className="message-image"
                    src={message.imageUrl}
                  />
                )}
                <p>{message.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <span>AI</span>
              <p className="typing">
                <Loader2 size={16} />
                กำลังค้นเอกสารและร่างคำตอบ
              </p>
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <form className="composer" onSubmit={onSubmit}>
          {selectedImage && (
            <div className="image-preview">
              <img alt={selectedImage.file.name} src={selectedImage.previewUrl} />
              <span>{selectedImage.file.name}</span>
              <button
                aria-label="Remove image"
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
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="ถามจากเอกสาร หรือขอให้สรุปข้อมูลที่ค้นเจอ..."
            rows={2}
            value={input}
          />
          <input
            accept="image/gif,image/jpeg,image/png,image/webp"
            className="file-input"
            onChange={(event) => onImageSelected(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          <button
            aria-label="Attach image"
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <ImagePlus size={20} />
          </button>
          <button
            aria-label="Send message"
            className={isLoading ? "send-button loading" : "send-button"}
            disabled={!canSubmit}
            type="submit"
          >
            {isLoading ? <Loader2 size={20} /> : <Send size={20} />}
          </button>
        </form>
      </section>
    </main>
  );
}
