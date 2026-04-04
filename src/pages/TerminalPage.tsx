import { useState, useRef, useEffect } from "react";
import { TerminalOutput } from "@/components/horizon/TerminalOutput";
import { toast } from "sonner";

const welcomeLines = [
  "Horus Eye — Horizon CLI Interface",
  "Type a command or use the CLI Builder for visual configuration.",
  "",
  "$ hz --version",
  "hz v2.0.0",
  "",
];

const fakeResponses: Record<string, string[]> = {
  "hz version": ["hz v2.0.0"],
  "hz --version": ["hz v2.0.0"],
  "hz init": ["✓ Created .hz directory", "✓ Generated .hz/config.toml", "✓ Project initialized in current directory."],
  "hz create-cert": ["✓ Created horizon-cert.pem", "✓ Created horizon-key.pem", "Self-signed certificate generated for development."],
  "hz migrate": ["Checking database format...", "✓ Database already in 2.x format. No migration needed."],
  "hz schema save": ["✓ Schema saved to .hz/schema.toml"],
  "hz schema apply": ["Applying schema from .hz/schema.toml...", "✓ Schema applied successfully."],
  help: [
    "Available commands:",
    "  hz serve       Start a Horizon server",
    "  hz init        Initialize a new project",
    "  hz create-cert Create a TLS certificate pair",
    "  hz schema      Save or apply database schema",
    "  hz migrate     Migrate database from 1.x to 2.x",
    "  hz make-token  Create a JWT for user bootstrapping",
    "  hz version     Display CLI version",
    "",
    "Use the CLI Builder (sidebar) for visual flag configuration.",
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
    } else if (cmd.startsWith("hz serve")) {
      setHistory((prev) => [
        ...prev,
        `$ ${cmd}`,
        "Starting Horizon server...",
        "App available at http://localhost:8181",
        "RethinkDB connection: localhost:28015",
        "⚡ Ready.",
        "",
      ]);
    } else if (cmd.startsWith("hz make-token")) {
      const userId = cmd.split(" ").slice(2).join(" ") || "anonymous";
      setHistory((prev) => [
        ...prev,
        `$ ${cmd}`,
        `Generating JWT for user: ${userId}`,
        `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(userId).slice(0, 20)}...`,
        "",
      ]);
    } else {
      setHistory((prev) => [...prev, `$ ${cmd}`, `hz: unknown command '${cmd}'. Run 'help' for usage.`, ""]);
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
