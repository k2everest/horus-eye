import {
  LayoutDashboard,
  Terminal,
  Activity,
  Server,
  FolderPlus,
  Database,
  ShieldCheck,
  Info,
  Eye,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import horusIcon from "@/assets/horus-icon.jpg";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Monitor", url: "/monitor", icon: Activity },
  { title: "Terminal", url: "/terminal", icon: Terminal },
];

const cliCommands = [
  { title: "serve", url: "/cli/serve", icon: Server },
  { title: "init", url: "/cli/init", icon: FolderPlus },
  { title: "schema", url: "/cli/schema", icon: Database },
  { title: "make-cert", url: "/cli/make-cert", icon: ShieldCheck },
  { title: "version", url: "/cli/version", icon: Info },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  const isCliActive = location.pathname.startsWith("/cli");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img src={horusIcon} alt="Horus" className="h-7 w-7 rounded-lg object-cover shrink-0" />
          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold tracking-tight">Horus</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* CLI Commands */}
        <SidebarGroup>
          <SidebarGroupLabel>CLI Commands</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {cliCommands.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="font-mono text-xs">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        {!collapsed && (
          <p className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
            hz v2.0.0 • Horus Eye
          </p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
