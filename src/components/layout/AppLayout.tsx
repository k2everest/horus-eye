import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalCommandBar } from "@/components/monitor/GlobalCommandBar";
import { toast } from "sonner";
import { Hexagon } from "lucide-react";

export function AppLayout() {
  const handleAction = (actionId: string) => {
    const labels: Record<string, string> = {
      scan: "Security scan initiated…",
      lock: "Emergency lockdown activated.",
      flag: "Transaction flagging mode enabled.",
      "refresh-keys": "HSM key rotation triggered.",
      "sync-db": "Ledger sync in progress…",
      perf: "Generating performance report…",
      anomaly: "Running anomaly detection sweep…",
    };
    toast(labels[actionId] || "Command executed.");
  };

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-14 flex items-center justify-between border-b border-primary/20 px-4 shrink-0 backdrop-blur-xl bg-background/60 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors" />
            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-primary/20">
              <Hexagon className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span className="font-display text-xs tracking-[0.3em] text-primary/80 uppercase">
                Horizon // Net
              </span>
            </div>
          </div>
          <GlobalCommandBar onAction={handleAction} />
        </header>
        <main className="flex-1 overflow-y-auto relative">
          <div className="mx-auto w-full max-w-6xl animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
