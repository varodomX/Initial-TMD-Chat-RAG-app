"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Download,
  Loader2,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";

type ChatLogEntry = {
  askedAt: string;
  askedAtBangkok: string;
  ip: string;
  conversationId: string;
  question: string;
  answer: string;
  error: string;
  mode: string;
  hasImage: boolean;
  imageName: string;
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

export default function LogHistoryPage() {
  const [entries, setEntries] = useState<ChatLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadLogs() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/chat_logs?limit=300", {
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

    fetch("/api/chat_logs?limit=300", {
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
        entry.ip,
        entry.conversationId,
        entry.mode,
        entry.question,
        entry.answer,
        entry.error,
        entry.askedAtBangkok,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [entries, query]);

  const uniqueVisitors = useMemo(
    () => new Set(entries.map((entry) => entry.ip).filter(Boolean)).size,
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
              <h1 className="text-xl font-semibold text-white">chat_logs</h1>
              <p className="text-sm text-zinc-500">
                ประวัติ IP, คำถาม, คำตอบ และวันเวลาจากระบบแชต
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
              href="/api/log-history?limit=500&format=csv"
            >
              <Download size={16} />
              Export CSV
            </a>
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
      </div>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Clock className="text-cyan-300" size={17} />
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
            placeholder="ค้นหา IP, วันเวลา, conversation, คำถาม หรือคำตอบ"
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
          <div className="grid min-w-[980px] grid-cols-[190px_150px_minmax(290px,1fr)_minmax(330px,1.2fr)] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase text-zinc-500">
            <span>วันเวลา</span>
            <span>IP</span>
            <span>ถามว่าอะไร</span>
            <span>ตอบอะไร</span>
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
                  className="grid grid-cols-[190px_150px_minmax(290px,1fr)_minmax(330px,1.2fr)] gap-3 border-b border-white/10 px-4 py-4 text-sm last:border-b-0"
                  key={`${entry.askedAt}-${entry.conversationId}-${index}`}
                >
                  <div className="grid content-start gap-1">
                    <span className="text-zinc-200">
                      {entry.askedAtBangkok || formatDateTime(entry.askedAt)}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-600">
                      {shortId(entry.conversationId)}
                    </span>
                    <span className="w-fit rounded bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">
                      {entry.mode}
                    </span>
                  </div>
                  <div className="grid content-start gap-1 text-zinc-400">
                    <span className="font-mono text-xs text-cyan-100">
                      {entry.ip || "-"}
                    </span>
                  </div>
                  <div className="grid content-start gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-cyan-200">
                      <UserRound size={14} />
                      คำถาม
                    </div>
                    <p className="line-clamp-5 whitespace-pre-wrap leading-6 text-zinc-200">
                      {entry.question || "-"}
                    </p>
                    {entry.hasImage && (
                      <span className="text-xs text-zinc-500">
                        แนบรูปภาพ{entry.imageName ? `: ${entry.imageName}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="grid content-start gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-fuchsia-200">
                      <UserRound size={14} />
                      คำตอบ
                    </div>
                    {entry.error ? (
                      <p className="rounded border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-amber-100">
                        {entry.error}
                      </p>
                    ) : (
                      <p className="line-clamp-5 whitespace-pre-wrap leading-6 text-zinc-300">
                        {entry.answer || "-"}
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
