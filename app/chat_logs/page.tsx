import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { readChatQuestionHistory } from "@/lib/chat-log";

export const dynamic = "force-dynamic";

function shortId(value: string) {
  if (!value || value === "unknown") return value || "-";

  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default async function ChatLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = (params?.q || "").trim().toLowerCase();
  const entries = await readChatQuestionHistory(300);
  const filteredEntries = query
    ? entries.filter((entry) =>
        [
          entry.ip,
          entry.askedAtBangkok,
          entry.conversationId,
          entry.mode,
          entry.question,
          entry.answer,
          entry.error,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : entries;
  const uniqueVisitors = new Set(entries.map((entry) => entry.ip).filter(Boolean))
    .size;

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
          <Link
            className="flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
            href="/chat_logs"
          >
            <RefreshCw size={16} />
            Refresh
          </Link>
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

        <form className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-white/10 bg-zinc-950/80 px-3 py-2">
          <Search className="text-zinc-500" size={18} />
          <input
            className="h-10 border-0 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            defaultValue={params?.q || ""}
            name="q"
            placeholder="ค้นหา IP, วันเวลา, conversation, คำถาม หรือคำตอบ"
            type="search"
          />
          <button
            className="h-9 rounded-md bg-cyan-200 px-3 text-sm font-medium text-zinc-950"
            type="submit"
          >
            ค้นหา
          </button>
        </form>

        <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950/70">
          <div className="hidden grid-cols-[190px_150px_minmax(290px,1fr)_minmax(330px,1.2fr)] gap-3 border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase text-zinc-500 md:grid">
            <span>วันเวลา</span>
            <span>IP</span>
            <span>ถามว่าอะไร</span>
            <span>ตอบอะไร</span>
          </div>
          <div className="max-h-[72vh] overflow-auto">
            {filteredEntries.length ? (
              filteredEntries.map((entry, index) => (
                <article
                  className="grid gap-3 border-b border-white/10 px-4 py-4 text-sm last:border-b-0 md:grid-cols-[190px_150px_minmax(290px,1fr)_minmax(330px,1.2fr)]"
                  key={`${entry.askedAt}-${entry.conversationId}-${index}`}
                >
                  <div className="grid content-start gap-1">
                    <span className="text-zinc-200">{entry.askedAtBangkok}</span>
                    <span className="font-mono text-[11px] text-zinc-600">
                      {shortId(entry.conversationId)}
                    </span>
                    <span className="w-fit rounded bg-white/[0.06] px-2 py-1 text-xs text-zinc-400">
                      {entry.mode}
                    </span>
                  </div>
                  <div className="grid content-start gap-1">
                    <span className="text-xs font-medium text-zinc-500 md:hidden">
                      IP
                    </span>
                    <span className="font-mono text-xs text-cyan-100">
                      {entry.ip || "-"}
                    </span>
                  </div>
                  <div className="grid content-start gap-2">
                    <span className="text-xs font-medium text-cyan-200">
                      คำถาม
                    </span>
                    <p className="whitespace-pre-wrap leading-6 text-zinc-200">
                      {entry.question || "-"}
                    </p>
                    {entry.hasImage && (
                      <span className="text-xs text-zinc-500">
                        แนบรูปภาพ{entry.imageName ? `: ${entry.imageName}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="grid content-start gap-2">
                    <span className="text-xs font-medium text-fuchsia-200">
                      คำตอบ
                    </span>
                    {entry.error ? (
                      <p className="rounded border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-amber-100">
                        {entry.error}
                      </p>
                    ) : (
                      <p className="whitespace-pre-wrap leading-6 text-zinc-300">
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
