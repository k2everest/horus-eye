import { useState, useRef, useEffect } from "react";

const welcomeLines = [
  "Horus Eye — Unified Horizon CLI",
  "Type a command from the unified spec or use the visual builder.",
  "",
  "$ hz data health --source terranode",
  "[OK] source terranode healthy | 2026-04-23T00:00:00Z",
  "",
];

const fakeResponses: Record<string, string[]> = {
  'hz auth rebind --id "HORUS" --email "coebsm@gmail.com"': ["[OK] identity HORUS rebound to coebsm@gmail.com | 2026-04-23T00:00:00Z"],
  "hz auth session-kill --all": ["[OK] all active sessions terminated | 2026-04-23T00:00:00Z"],
  "hz data health --source terranode": ["[OK] source terranode healthy | 2026-04-23T00:00:00Z"],
  "hz node sync --priority": ["[OK] priority sync queued | 2026-04-23T00:00:00Z"],
  "hz node sync --rehash": ["[OK] node rehash started for last blocks | 2026-04-23T00:00:00Z"],
  'hz finance audit --user Horus --deep-scan': ["[OK] audit complete | user Horus | r$ 100 | 2026-04-23T00:00:00Z"],
  help: [
    "Available commands:",
    "  hz auth rebind --id HORUS --email ops@horizon.local",
    "  hz auth session-kill --all",
    "  hz node sync --priority --rehash",
    "  hz data health --source terranode",
    "  hz finance audit --user Horus --deep-scan",
    "",
    "Output pattern: [OK] message | timestamp  /  [ERR] code: description",
  ],
  clear: [],
};

const TerminalPage = () => {
  const [history, setHistory] = useState<string[]>(welcomeLines);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    if (cmd === "clear") {
      setHistory([]);
      setInput("");
      return;
    }

    const response = fakeResponses[cmd];
    if (response) {
      setHistory((prev) => [...prev, `$ ${cmd}`, ...response, ""]);
    } else {
      setHistory((prev) => [...prev, `$ ${cmd}`, `[ERR] CMD404: unknown command. Run 'help' for usage.`, ""]);
    }

    setInput("");
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 md:px-8 pt-6 md:pt-8 pb-3">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Terminal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Interactive command execution and output logs.</p>
      </div>

      <div className="flex-1 mx-6 md:mx-8 mb-6 md:mb-8 rounded-xl border overflow-hidden flex flex-col bg-[hsl(var(--terminal))]">
        {/* Output */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {history.map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("$")
                  ? "text-[hsl(var(--terminal-foreground))]"
                  : line.startsWith("✓")
                  ? "text-accent"
                  : line.startsWith("⚡")
                  ? "text-primary"
                  : "text-muted-foreground"
              }
            >
              {line || "\u00A0"}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-border/50 flex items-center px-4 py-2.5">
          <span className="text-[hsl(var(--terminal-foreground))] font-mono text-xs mr-2 shrink-0">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/40"
            autoFocus
          />
        </form>
      </div>
    </div>
  );
};

export default TerminalPage;
