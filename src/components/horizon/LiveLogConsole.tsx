import { useEffect, useRef, useState } from "react";
import { Activity, Trash2 } from "lucide-react";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: "info" | "success" | "warn" | "error" | "debug";
  message: string;
}

const levelStyles: Record<LogEntry["level"], string> = {
  info: "text-primary",
  success: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  debug: "text-muted-foreground",
};

const levelBgStyles: Record<LogEntry["level"], string> = {
  info: "bg-primary/20 border-primary/40 text-primary",
  success: "bg-success/20 border-success/40 text-success",
  warn: "bg-warning/20 border-warning/40 text-warning",
  error: "bg-destructive/20 border-destructive/40 text-destructive",
  debug: "bg-muted border-muted-foreground/30 text-muted-foreground",
};

const allLevels: LogEntry["level"][] = ["info", "success", "warn", "error", "debug"];

interface Props {
  entries: LogEntry[];
  streaming?: boolean;
  onClear?: () => void;
}

export function LiveLogConsole({ entries, streaming, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeFilters, setActiveFilters] = useState<Set<LogEntry["level"]>>(
    () => new Set(allLevels),
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, activeFilters]);

  const toggleFilter = (level: LogEntry["level"]) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const filteredEntries = entries.filter((e) => activeFilters.has(e.level));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Activity className={`h-3.5 w-3.5 ${streaming ? "text-success animate-pulse" : "text-muted-foreground"}`} />
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            live_log {streaming ? "· streaming" : "· idle"}
          </span>
        </div>
        {onClear && entries.length > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3 w-3" /> clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-b bg-background/50 px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground/60 uppercase mr-1">filter</span>
        {allLevels.map((level) => {
          const active = activeFilters.has(level);
          return (
            <button
              key={level}
              onClick={() => toggleFilter(level)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase border transition-all ${
                active
                  ? levelBgStyles[level]
                  : "bg-transparent border-transparent text-muted-foreground/40 hover:text-muted-foreground"
              }`}
              title={active ? `Hide ${level}` : `Show ${level}`}
            >
              {level}
            </button>
          );
        })}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
          {filteredEntries.length}/{entries.length}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto bg-background/50 p-3 font-mono text-[11px] leading-relaxed"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground/60">{"// awaiting execution…"}</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-muted-foreground/60">{"// no logs match current filters…"}</p>
        ) : (
          filteredEntries.map((e) => (
            <div key={e.id} className="flex gap-2">
              <span className="text-muted-foreground/50 shrink-0">
                {new Date(e.timestamp).toISOString().split("T")[1].replace("Z", "")}
              </span>
              <span className={`shrink-0 uppercase ${levelStyles[e.level]}`}>[{e.level}]</span>
              <span className="text-foreground/90 break-all">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
