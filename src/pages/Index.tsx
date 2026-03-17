import { useState } from "react";
import { CommandSidebar } from "@/components/horizon/CommandSidebar";
import { CommandBuilder } from "@/components/horizon/CommandBuilder";
import { TerminalOutput } from "@/components/horizon/TerminalOutput";

export type HorizonCommand = "serve" | "init" | "make-cert" | "version" | "schema";

export interface CommandConfig {
  command: HorizonCommand;
  flags: Record<string, string | boolean>;
}

const Index = () => {
  const [activeCommand, setActiveCommand] = useState<HorizonCommand>("serve");
  const [flags, setFlags] = useState<Record<string, string | boolean>>({});
  const [terminalHistory, setTerminalHistory] = useState<string[]>([
    "$ hz --version",
    "hz v2.0.0",
    "",
    "Ready. Select a command to get started.",
  ]);

  const buildCommandString = () => {
    const parts = [`hz ${activeCommand}`];
    Object.entries(flags).forEach(([key, value]) => {
      if (value === true) {
        parts.push(`--${key}`);
      } else if (value !== false && value !== "") {
        parts.push(`--${key} ${value}`);
      }
    });
    return parts.join(" ");
  };

  const handleExecute = () => {
    const cmd = buildCommandString();
    const timestamp = new Date().toLocaleTimeString();
    setTerminalHistory((prev) => [
      ...prev,
      "",
      `[${timestamp}] $ ${cmd}`,
      `✓ Command executed successfully.`,
      `  Server configuration applied.`,
    ]);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildCommandString());
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Sidebar */}
      <CommandSidebar
        activeCommand={activeCommand}
        onSelectCommand={(cmd) => {
          setActiveCommand(cmd);
          setFlags({});
        }}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-12 items-center justify-between border-b px-6">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-muted-foreground">$</span>
            <code className="font-mono text-sm text-foreground">
              {buildCommandString()}
            </code>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="rounded-md bg-secondary px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Copy
            </button>
            <button
              onClick={handleExecute}
              className="rounded-md bg-primary px-4 py-1.5 font-mono text-xs text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Execute
            </button>
          </div>
        </header>

        {/* Workspace + Terminal */}
        <div className="flex flex-1 overflow-hidden">
          {/* Command Builder */}
          <div className="flex-1 overflow-y-auto p-6">
            <CommandBuilder
              command={activeCommand}
              flags={flags}
              onFlagChange={(key, value) =>
                setFlags((prev) => ({ ...prev, [key]: value }))
              }
            />
          </div>

          {/* Terminal Panel */}
          <div className="w-[400px] border-l">
            <TerminalOutput
              lines={terminalHistory}
              currentCommand={buildCommandString()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
