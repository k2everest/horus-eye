import { useEffect, useRef } from "react";
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

interface Props {
  entries: LogEntry[];
  streaming?: boolean;
  onClear?: () => void;
}

export function LiveLogConsole({ entries, streaming, onClear }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

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
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto bg-background/50 p-3 font-mono text-[11px] leading-relaxed"
      >
        {entries.length === 0 ? (
          <p className="text-muted-foreground/60">{"// awaiting execution…"}</p>
        ) : (
          entries.map((e) => (
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
