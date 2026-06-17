"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  Bot,
  Cloud,
  CloudRain,
  FileText,
  FolderOpen,
  Gauge,
  HomeIcon,
  ImagePlus,
  Layers,
  Loader2,
  MapPin,
  Plus,
  Radio,
  Search,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Wind,
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
    <main className="relative min-h-screen overflow-hidden bg-[#050b16] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_51%_9%,rgba(77,89,255,0.24),transparent_31%),radial-gradient(circle_at_67%_25%,rgba(168,85,247,0.22),transparent_27%),radial-gradient(circle_at_36%_82%,rgba(14,165,233,0.16),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-25" />

      <div className="relative grid min-h-screen xl:grid-cols-[300px_minmax(0,1fr)_430px]">
        <aside className="flex min-h-0 flex-col gap-5 border-b border-white/10 bg-[#07111f]/85 p-5 backdrop-blur-xl xl:h-screen xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300 ring-1 ring-blue-400/40">
              <Cloud size={23} />
            </span>
            <div className="flex items-baseline gap-2">
              <h1 className="text-lg font-semibold text-white">RadarKhonKaen</h1>
              <span className="text-lg font-bold text-blue-500">AI</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2">
              <p className="text-[11px] text-slate-500">Retriever</p>
              <p className="text-sm font-medium text-blue-200">
                {sourceCount ? `${sourceCount} hits` : "Ready"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2">
              <p className="text-[11px] text-slate-500">Mode</p>
              <p className="text-sm font-medium text-emerald-200">RAG Live</p>
            </div>
          </div>

          <button
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(37,99,235,0.28)] transition hover:brightness-110"
            onClick={startNewChat}
            type="button"
          >
            <Plus size={18} />
            New Chat
          </button>

          <label className="grid h-11 grid-cols-[20px_minmax(0,1fr)_34px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-slate-400">
            <Search size={17} />
            <span>Search chats...</span>
            <kbd className="rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-1 text-[11px] text-slate-500">
              ⌘ K
            </kbd>
          </label>

          <nav className="grid gap-2">
            {[
              { label: "Home", icon: HomeIcon, active: true },
              { label: "Explore AI Tools", icon: Sparkles, badge: "New" },
            ].map((item) => (
              <button
                className={`grid h-11 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 text-left text-sm transition ${
                  item.active
                    ? "bg-blue-500/12 text-white"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }`}
                key={item.label}
                type="button"
              >
                <item.icon className="text-blue-300" size={18} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="rounded-md bg-indigo-500 px-2 py-0.5 text-[11px] font-medium text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <section className="grid gap-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Chats
            </h2>
            {[
              ["วันนี้สภาพอากาศเป็นอย่างไร", "10:30 AM"],
              ["วิเคราะห์เรดาร์ขอนแก่น", "Yesterday"],
              ["AWS สถานีบ้านไผ่", "2 days ago"],
              ["พยากรณ์ฝน 24 ชม.", "May 20"],
              ["Report สรุปอากาศประจำวัน", "May 19"],
            ].map(([label, time]) => (
              <button
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg px-1 py-1.5 text-left text-sm text-slate-400 transition hover:text-white"
                key={label}
                type="button"
              >
                <span className="truncate">{label}</span>
                <span className="text-xs text-slate-500">{time}</span>
              </button>
            ))}
          </section>

          <section className="grid gap-3">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Knowledge Base
            </h2>
            {[
              { label: "Documents", icon: FileText },
              { label: "Datasets", icon: Layers },
              { label: "AWS Stations", icon: Radio, count: "32" },
              { label: "Radar Data", icon: CloudRain, count: "8" },
            ].map((item) => (
              <button
                className="grid h-9 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 text-left text-sm text-slate-400 transition hover:text-white"
                key={item.label}
                type="button"
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.count && (
                  <span className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-slate-500">
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </section>

          <div className="mt-auto grid gap-4 border-t border-white/10 pt-4">
            <button
              className="flex h-10 items-center gap-3 rounded-lg px-1 text-sm text-slate-400 transition hover:text-white"
              type="button"
            >
              <Settings size={18} />
              Settings
            </button>
            <div className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3">
              <div className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-500 text-sm font-bold text-slate-900">
                T
              </div>
              <div>
                <p className="text-sm font-medium text-white">Toei</p>
                <p className="text-xs text-blue-300">Premium Plan</p>
              </div>
              <span className="text-slate-500">⌄</span>
            </div>
          </div>
        </aside>

        <section className="grid min-h-[80vh] min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-5 p-5 lg:p-8 xl:h-screen xl:overflow-hidden">
          <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#081222]/70 p-6 shadow-[0_24px_70px_rgba(2,6,23,0.35)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(147,51,234,0.42),transparent_26%),radial-gradient(circle_at_70%_72%,rgba(37,99,235,0.28),transparent_34%)]" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(145deg,transparent_35%,rgba(15,23,42,0.84)_36%,rgba(15,23,42,0.96)_78%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Good Evening, Toei
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">
                  ฉันคือผู้ช่วย AI ด้านอุตุนิยมวิทยาของคุณ ถามได้ทุกเรื่องเกี่ยวกับสภาพอากาศ เรดาร์ และข้อมูลจากสถานีตรวจวัด
                </p>
              </div>
              <button
                className="hidden h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-sm text-white transition hover:bg-white/[0.1] sm:flex"
                type="button"
              >
                <SlidersHorizontal size={16} />
                Customize
              </button>
            </div>
          </header>

          <section className="grid gap-3">
            <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {[
                {
                  title: "วิเคราะห์สภาพอากาศ",
                  desc: "วิเคราะห์สภาพอากาศปัจจุบันและแนวโน้ม",
                  icon: CloudRain,
                  color: "text-emerald-300 bg-emerald-400/15",
                  prompt: "ช่วยวิเคราะห์สภาพอากาศปัจจุบันของขอนแก่น",
                },
                {
                  title: "เรดาร์ AI",
                  desc: "วิเคราะห์ภาพเรดาร์ ตรวจจับกลุ่มฝน",
                  icon: Radio,
                  color: "text-purple-300 bg-purple-400/15",
                  prompt: "เรดาร์ล่าสุดบอกแนวโน้มฝนอย่างไร",
                },
                {
                  title: "AWS ข้อมูลสถานี",
                  desc: "ดูข้อมูลสถานีตรวจอากาศแบบเรียลไทม์",
                  icon: Cloud,
                  color: "text-blue-300 bg-blue-400/15",
                  prompt: "สรุปข้อมูล AWS สถานีบ้านไผ่",
                },
                {
                  title: "สรุปรายงานอากาศ",
                  desc: "สร้างรายงานสรุปอากาศประจำวัน",
                  icon: FileText,
                  color: "text-amber-300 bg-amber-400/15",
                  prompt: "ช่วยทำรายงานสรุปอากาศประจำวัน",
                },
              ].map((item) => (
                <button
                  className="group grid min-h-40 rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-blue-300/40 hover:bg-white/[0.08]"
                  key={item.title}
                  onClick={() => void sendMessage(item.prompt)}
                  type="button"
                >
                  <span className={`grid size-11 place-items-center rounded-xl ${item.color}`}>
                    <item.icon size={22} />
                  </span>
                  <span className="mt-4 text-base font-semibold text-white">
                    {item.title}
                  </span>
                  <span className="mt-1 text-sm leading-6 text-slate-400">
                    {item.desc}
                  </span>
                  <span className="mt-auto grid size-8 place-items-center justify-self-end rounded-full border border-white/10 text-slate-400 transition group-hover:border-blue-300/50 group-hover:text-blue-200">
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
            <div className="grid gap-3 border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">Suggested Prompts</h3>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[
                  { label: "ฝนจะตกที่ขอนแก่นไหมวันนี้?", icon: CloudRain },
                  { label: "เรดาร์ล่าสุดเป็นอย่างไร?", icon: Radio },
                  { label: "อุณหภูมิสูงสุดวันนี้?", icon: Thermometer },
                  { label: "พยากรณ์ 24 ชม. ข้างหน้า", icon: Gauge },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                  <button
                    className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm text-slate-300 transition hover:border-blue-300/40 hover:text-white"
                    key={item.label}
                    onClick={() => void sendMessage(item.label)}
                    type="button"
                  >
                    <Icon className="text-blue-300" size={16} />
                    {item.label}
                  </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 overflow-auto pr-1">
              <div className="grid gap-4">
                {messages.map((message, index) => (
                  <div
                    className={`grid max-w-3xl grid-cols-[44px_minmax(0,1fr)] gap-3 ${
                      message.role === "user"
                        ? "ml-auto max-w-2xl grid-cols-[minmax(0,1fr)_44px]"
                        : ""
                    }`}
                    key={index}
                  >
                    {message.role === "assistant" && (
                      <span className="grid size-10 place-items-center rounded-full border border-white/15 bg-blue-500/15 text-blue-200">
                        <Bot size={20} />
                      </span>
                    )}
                    <div
                      className={`rounded-2xl border p-4 text-sm leading-7 shadow-[0_18px_42px_rgba(2,6,23,0.18)] ${
                        message.role === "user"
                          ? "order-first border-blue-400/30 bg-blue-600/70 text-white"
                          : "border-white/10 bg-white/[0.055] text-slate-100"
                      }`}
                    >
                      {message.imageUrl && (
                        <img
                          alt={message.imageName || "Uploaded image"}
                          className="mb-3 max-h-80 w-full max-w-[420px] rounded-xl object-contain"
                          src={message.imageUrl}
                        />
                      )}
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p className="mt-2 text-right text-xs text-slate-400">10:31 AM</p>
                    </div>
                    {message.role === "user" && (
                      <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-slate-200 to-slate-500 text-sm font-bold text-slate-950">
                        T
                      </span>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="grid max-w-3xl grid-cols-[44px_minmax(0,1fr)] gap-3">
                    <span className="grid size-10 place-items-center rounded-full border border-white/15 bg-blue-500/15 text-blue-200">
                      <Bot size={20} />
                    </span>
                    <p className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-sm text-slate-400">
                      <Loader2 className="animate-spin text-blue-300" size={16} />
                      กำลังค้นเอกสารและร่างคำตอบ
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          )}

          <form
            className="grid grid-cols-[minmax(0,1fr)_48px] gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 shadow-[0_20px_60px_rgba(2,6,23,0.32)]"
            onSubmit={onSubmit}
          >
            {selectedImage && (
              <div className="col-span-full grid grid-cols-[64px_minmax(0,1fr)_36px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-2">
                <img
                  alt={selectedImage.file.name}
                  className="h-12 w-16 rounded-lg object-cover"
                  src={selectedImage.previewUrl}
                />
                <span className="truncate text-sm text-slate-400">
                  {selectedImage.file.name}
                </span>
                <button
                  aria-label="Remove image"
                  className="grid size-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/10 hover:text-white"
                  onClick={removeSelectedImage}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="grid gap-3">
              <textarea
                ref={inputRef}
                aria-label="Message"
                className="min-h-12 max-h-36 resize-y border-0 bg-transparent leading-6 text-slate-100 outline-none placeholder:text-slate-500"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask anything about weather..."
                rows={2}
                value={input}
              />
              <div className="flex gap-2">
                <button
                  aria-label="Attach image"
                  className="grid size-9 place-items-center rounded-full border border-white/10 text-slate-400 transition hover:border-blue-300/40 hover:text-blue-200"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <ImagePlus size={17} />
                </button>
                <button
                  aria-label="Browse files"
                  className="grid size-9 place-items-center rounded-full border border-white/10 text-slate-400 transition hover:border-blue-300/40 hover:text-blue-200"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <FolderOpen size={17} />
                </button>
              </div>
            </div>
            <input
              accept="image/gif,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => onImageSelected(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />
            <button
              aria-label="Send message"
              className="grid size-12 place-items-center self-end rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-[0_12px_28px_rgba(37,99,235,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
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

        <aside className="grid min-h-0 gap-5 border-t border-white/10 bg-[#07111f]/70 p-5 backdrop-blur-xl xl:h-screen xl:overflow-auto xl:border-l xl:border-t-0">
          <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MapPin size={17} />
                ขอนแก่น, ประเทศไทย
              </div>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-300">
                Live
              </span>
            </div>
            <div className="mt-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-5xl font-semibold text-white">32°C</p>
                <p className="mt-2 text-sm text-slate-400">มีเมฆบางส่วน</p>
              </div>
              <div className="relative size-20">
                <span className="absolute right-1 top-0 size-11 rounded-full bg-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.45)]" />
                <Cloud className="absolute bottom-1 left-0 text-slate-200" size={62} />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-3 text-xs text-slate-400">
              {[
                ["32°C", "Feels like"],
                ["60%", "Humidity"],
                ["5 km/h", "Wind"],
                ["1012 hPa", "Pressure"],
              ].map(([value, label]) => (
                <div className="border-l border-white/10 pl-3 first:border-l-0 first:pl-0" key={label}>
                  <p className="text-sm font-medium text-white">{value}</p>
                  <p>{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">เรดาร์ล่าสุด</h3>
              <button className="text-sm text-blue-400" type="button">
                View full map
              </button>
            </div>
            <div className="relative h-64 overflow-hidden rounded-xl border border-white/10 bg-[#0a2433]">
              <div className="absolute inset-0 bg-[linear-gradient(35deg,rgba(56,189,248,0.12),transparent_38%),radial-gradient(circle_at_28%_38%,rgba(34,197,94,0.88),transparent_9%),radial-gradient(circle_at_36%_43%,rgba(234,179,8,0.9),transparent_8%),radial-gradient(circle_at_57%_72%,rgba(239,68,68,0.95),transparent_8%),radial-gradient(circle_at_65%_66%,rgba(234,179,8,0.9),transparent_12%),radial-gradient(circle_at_80%_40%,rgba(34,197,94,0.75),transparent_10%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
              <div className="absolute bottom-4 left-4 text-xs text-slate-300">10:30 AM</div>
              <div className="absolute bottom-4 right-4 rounded-full bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">
                Live
              </div>
              <div className="absolute right-4 top-12 h-36 w-3 rounded-full bg-gradient-to-b from-red-500 via-yellow-400 via-green-400 to-blue-500" />
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">สถานีตรวจอากาศ (AWS)</h3>
              <button className="text-sm text-blue-400" type="button">
                View all
              </button>
            </div>
            <div className="grid gap-3 text-sm">
              {[
                ["บ้านไผ่", "32.4°C", "60%", "bg-emerald-400"],
                ["เมืองขอนแก่น", "31.8°C", "58%", "bg-emerald-400"],
                ["ชุมแพ", "31.2°C", "62%", "bg-emerald-400"],
                ["หนองเรือ", "30.9°C", "65%", "bg-amber-400"],
                ["น้ำพอง", "31.5°C", "61%", "bg-emerald-400"],
              ].map(([station, temp, humidity, status]) => (
                <div
                  className="grid grid-cols-[12px_minmax(0,1fr)_auto_auto] items-center gap-3 text-slate-300"
                  key={station}
                >
                  <span className={`size-2 rounded-full ${status}`} />
                  <span>{station}</span>
                  <span>{temp}</span>
                  <span className="text-slate-400">{humidity}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">AI Tools</h3>
              <button className="text-sm text-blue-400" type="button">
                View all
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                {
                  label: "Cloud Detect",
                  icon: Cloud,
                  color: "bg-blue-500/20 text-blue-300",
                },
                {
                  label: "Rainfall Nowcast",
                  icon: CloudRain,
                  color: "bg-purple-500/20 text-purple-300",
                },
                {
                  label: "Wind Analysis",
                  icon: Wind,
                  color: "bg-emerald-500/20 text-emerald-300",
                },
                {
                  label: "Data Encoder",
                  icon: FileText,
                  color: "bg-amber-500/20 text-amber-300",
                },
              ].map((item) => {
                const Icon = item.icon;

                return (
                <button
                  className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-center text-xs text-slate-300 transition hover:border-blue-300/40"
                  key={item.label}
                  type="button"
                >
                  <span className={`mx-auto grid size-11 place-items-center rounded-xl ${item.color}`}>
                    <Icon size={21} />
                  </span>
                  <span>{item.label}</span>
                </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-3">
            <h3 className="font-semibold text-white">Sources</h3>
            {sources.length ? (
              sources.slice(0, 3).map((source) => (
                <article
                  className="rounded-xl border border-white/10 bg-white/[0.045] p-3"
                  key={source.id}
                >
                  <p className="text-sm font-medium text-white">
                    {typeof source.metadata.title === "string"
                      ? source.metadata.title
                      : source.id}
                  </p>
                  <p className="source-content mt-2 text-xs leading-5 text-slate-400">
                    {source.content}
                  </p>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                Sources from the latest answer will appear here.
              </p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
