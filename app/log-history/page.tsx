"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Clock,
  Database,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

type ChatLogMessage = {
  role: "user" | "assistant";
  content: string;
  imageName?: string;
  imageUrl?: string;
};

type ChatLogEntry = {
  conversationId: string;
  createdAt: string;
  userMessage: ChatLogMessage;
  assistantMessage?: ChatLogMessage;
  error?: string;
  mode: string;
  clientIp?: string;
  forwardedFor?: string;
  realIp?: string;
  userAgent?: string;
  sourceCount: number;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function shortId(value: string) {
  if (!value || value === "unknown") return value || "-";

  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function browserLabel(userAgent?: string) {
  if (!userAgent) return "-";

  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Chrome/")) return "Chrome";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";

  return userAgent.slice(0, 80);
}

export default function LogHistoryPage() {
  const [entries, setEntries] = useState<ChatLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadLogs() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/log-history?limit=300", {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
      }

      setEntries(data.entries ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    fetch("/api/log-history?limit=300", {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "โหลดประวัติไม่สำเร็จ");
        }

        if (isMounted) {
          setEntries(data.entries ?? []);
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "เกิดข้อผิดพลาด");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return entries;

    return entries.filter((entry) =>
      [
        entry.clientIp,
        entry.forwardedFor,
        entry.realIp,
        entry.userAgent,
        entry.conversationId,
        entry.mode,
        entry.userMessage?.content,
        entry.assistantMessage?.content,
        entry.error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [entries, query]);

  const uniqueVisitors = useMemo(
    () =>
      new Set(
        entries.map((entry) => entry.clientIp || entry.realIp || entry.forwardedFor),
      ).size,
    [entries],
  );

  return (
    <main className="min-h-screen bg-[#030305] text-zinc-100">
      <div className="border-b border-white/10 bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              aria-label="Back to chat"
              className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-cyan-300/50 hover:text-white"
              href="/"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-white">Log History</h1>
              <p className="text-sm text-zinc-500">
                ประวัติผู้ใช้งานและคำถามล่าสุดจากระบบแชต
              </p>
            </div>
          </div>
          <button
            className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10 disabled:opacity-50"
            disabled={isLoading}
            onClick={() => void loadLogs()}
            type="button"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>
      </div>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Database className="text-cyan-300" size={17} />
              รายการทั้งหมด
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">{entries.length}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <UserRound className="text-fuchsia-300" size={17} />
              ผู้ใช้งานโดยประมาณ
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">
              {uniqueVisitors}
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Clock className="text-amber-300" size={17} />
              แสดงอยู่
            </div>
            <p className="mt-2 text-2xl font-semibold text-white">
              {filteredEntries.length}
            </p>
          </div>
        </div>

        <label className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-md border border-white/10 bg-zinc-950/80 px-3 py-2">
          <Search className="text-zinc-500" size={18} />
          <input
            className="h-10 border-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหา IP, conversation, browser, คำถาม หรือคำตอบ"
            type="search"
            value={query}
          />
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <AlertTriangle size={17} />
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950/70">
          <div className="grid min-w-[980px] grid-cols-[170px_160px_120px_minmax(260px,1fr)_minmax(260px,1fr)] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase text-zinc-500">
            <span>เวลา</span>
            <span>ผู้ใช้งาน</span>
            <span>โหมด</span>
            <span>คำถาม</span>
            <span>คำตอบ / สถานะ</span>
          </div>
          <div className="max-h-[70vh] min-w-[980px] overflow-auto">
            {isLoading ? (
              <div className="flex items-center gap-3 px-4 py-8 text-sm text-zinc-400">
                <Loader2 className="animate-spin text-cyan-300" size={18} />
                กำลังโหลดประวัติ
              </div>
            ) : filteredEntries.length ? (
              filteredEntries.map((entry, index) => (
                <article
                  className="grid grid-cols-[170px_160px_120px_minmax(260px,1fr)_minmax(260px,1fr)] gap-3 border-b border-white/10 px-4 py-4 text-sm last:border-b-0"
                  key={`${entry.createdAt}-${entry.conversationId}-${index}`}
                >
                  <div className="grid content-start gap-1">
                    <span className="text-zinc-200">
                      {formatDateTime(entry.createdAt)}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-600">
                      {shortId(entry.conversationId)}
                    </span>
                  </div>
                  <div className="grid content-start gap-1 text-zinc-400">
                    <span className="font-mono text-xs text-cyan-100">
                      {entry.clientIp || entry.realIp || "-"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Monitor size={13} />
                      {browserLabel(entry.userAgent)}
                    </span>
                  </div>
                  <div className="grid content-start gap-2">
                    <span className="w-fit rounded bg-white/[0.06] px-2 py-1 text-xs text-zinc-300">
                      {entry.mode}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {entry.sourceCount} sources
                    </span>
                  </div>
                  <div className="grid content-start gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-cyan-200">
                      <UserRound size={14} />
                      User
                    </div>
                    <p className="line-clamp-5 whitespace-pre-wrap leading-6 text-zinc-200">
                      {entry.userMessage?.content || "-"}
                    </p>
                    {entry.userMessage?.imageName && (
                      <span className="text-xs text-zinc-500">
                        รูปภาพ: {entry.userMessage.imageName}
                      </span>
                    )}
                  </div>
                  <div className="grid content-start gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-fuchsia-200">
                      <Bot size={14} />
                      Assistant
                    </div>
                    {entry.error ? (
                      <p className="rounded border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-amber-100">
                        {entry.error}
                      </p>
                    ) : (
                      <p className="line-clamp-5 whitespace-pre-wrap leading-6 text-zinc-300">
                        {entry.assistantMessage?.content || "-"}
                      </p>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="px-4 py-8 text-sm text-zinc-500">
                ยังไม่มีประวัติการใช้งาน
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
