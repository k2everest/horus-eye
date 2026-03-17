import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { GlobalCommandBar } from "@/components/monitor/GlobalCommandBar";
import { toast } from "sonner";

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
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between border-b px-4 shrink-0">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <GlobalCommandBar onAction={handleAction} />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
