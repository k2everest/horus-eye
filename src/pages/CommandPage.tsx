import { useRef, useState } from "react";
import { useParams, Navigate, Link } from "react-router-dom";
import { CommandBuilder } from "@/components/horizon/CommandBuilder";
import { LiveLogConsole, type LogEntry } from "@/components/horizon/LiveLogConsole";
import type { HorizonCommand } from "@/types/horizon";
import { ArrowLeft, Copy, Play } from "lucide-react";
import { toast } from "sonner";
import { buildHzCommand, isHorizonCommand } from "@/lib/horizon-commands";

const CommandPage = () => {
  const { command } = useParams<{ command: string }>();
  const [flags, setFlags] = useState<Record<string, string | boolean>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const timersRef = useRef<number[]>([]);

  if (!command || !isHorizonCommand(command)) {
    return <Navigate to="/cli" replace />;
  }

  const activeCommand: HorizonCommand = command;
  const buildCommandString = () => buildHzCommand(activeCommand, flags);

  const pushLog = (level: LogEntry["level"], message: string) => {
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now(), level, message },
    ]);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildCommandString());
    toast("Copied to clipboard");
  };

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  const handleExecute = () => {
    const cmd = buildCommandString();
    clearTimers();
    setStreaming(true);
    pushLog("info", `$ ${cmd}`);
    pushLog("debug", `dispatching → command=${activeCommand}`);

    const steps: { delay: number; level: LogEntry["level"]; msg: string }[] = [
      { delay: 250, level: "debug", msg: "resolving pipeline → horizon.core" },
      { delay: 600, level: "info", msg: "auth.token verified · operator=horus" },
      { delay: 1100, level: "info", msg: `executing ${activeCommand} with ${Object.keys(flags).length} flag(s)` },
      { delay: 1700, level: "success", msg: `${activeCommand} completed in 1.42s · exit=0` },
    ];

    steps.forEach((s) => {
      const id = window.setTimeout(() => pushLog(s.level, s.msg), s.delay);
      timersRef.current.push(id);
    });

    const finalId = window.setTimeout(() => setStreaming(false), 1800);
    timersRef.current.push(finalId);
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-2 text-sm">
        <Link to="/cli" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Commands
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-mono text-foreground">{activeCommand}</span>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl border bg-card px-5 py-3">
        <code className="font-mono text-sm text-foreground truncate flex-1 mr-4">{buildCommandString()}</code>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleCopy}
            className="rounded-lg bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleExecute}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 font-mono text-xs text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-3 w-3" />
            Execute
          </button>
        </div>
      </div>

      <div className="mb-6">
        <LiveLogConsole entries={logs} streaming={streaming} onClear={() => setLogs([])} />
      </div>

      <CommandBuilder
        command={activeCommand}
        flags={flags}
        onFlagChange={(key, value) => setFlags((prev) => ({ ...prev, [key]: value }))}
      />
    </div>
  );
};

export default CommandPage;
