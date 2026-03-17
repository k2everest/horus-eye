import { useState } from "react";
import { TerminalOutput } from "@/components/horizon/TerminalOutput";

const TerminalPage = () => {
  const [history] = useState<string[]>([
    "$ hz --version",
    "hz v2.0.0",
    "",
    "Ready. Execute commands from the CLI Builder.",
  ]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-8 pt-8 pb-4">
        <h1 className="text-xl font-semibold text-foreground tracking-tight">Terminal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Command output and execution logs.</p>
      </div>
      <div className="flex-1 mx-8 mb-8 rounded-xl border overflow-hidden">
        <TerminalOutput lines={history} currentCommand="hz serve" />
      </div>
    </div>
  );
};

export default TerminalPage;
