import { useEffect, useRef } from "react";

interface TerminalOutputProps {
  lines: string[];
  currentCommand: string;
}

export function TerminalOutput({ lines, currentCommand }: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="flex h-full flex-col bg-terminal">
      {/* Terminal Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/60" />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">terminal</span>
      </div>

      {/* Live Command Preview */}
      <div className="border-b px-4 py-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
          Live Preview
        </p>
        <code className="font-mono text-xs text-terminal-foreground break-all">
          {currentCommand}
        </code>
      </div>

      {/* Output */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {lines.map((line, i) => (
          <pre
            key={i}
            className={`font-mono text-xs leading-relaxed ${
              line.startsWith("$") || line.includes("$ ")
                ? "text-foreground"
                : line.startsWith("✓")
                ? "text-terminal-foreground"
                : line.startsWith("✗") || line.startsWith("Error")
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            {line || "\u00A0"}
          </pre>
        ))}
      </div>
    </div>
  );
}
