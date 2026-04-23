import {
  LayoutDashboard,
  Terminal,
  Activity,
  Eye,
  Settings,
  LogOut,
  Users,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import horusIcon from "@/assets/horus-icon.jpg";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { horizonCommands } from "@/lib/horizon-commands";

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
  { title: "Settings", url: "/settings", icon: Settings },
];

const cliCommands = horizonCommands.map((command) => ({
  title: `${command.domain}.${command.action}`,
  url: `/cli/${command.id}`,
  icon: command.icon,
}));

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, user, signOut } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-primary/20">
      <SidebarHeader className="border-b border-primary/20">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="relative h-7 w-7 shrink-0 rounded-md border border-primary/40 bg-primary/10 flex items-center justify-center overflow-hidden">
            <img src={horusIcon} alt="Horus" className="h-7 w-7 rounded object-cover" />
            <div className="absolute inset-0 bg-primary/10 mix-blend-overlay" />
          </div>
          {!collapsed && (
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-primary text-glow" />
              <span className="font-display text-sm tracking-[0.2em] uppercase text-gradient-neon">Horus</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
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
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className="flex items-center gap-2 text-muted-foreground hover:bg-muted/50 transition-colors"
                      activeClassName="bg-primary/10 text-primary font-medium"
                    >
                      <Users className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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

      <SidebarFooter className="border-t border-primary/20">
        {!collapsed && user && (
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <p className="font-mono text-[10px] text-muted-foreground truncate" title={user.email ?? ""}>
                {user.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start h-7 px-2 font-mono text-[10px] text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3 w-3 mr-1.5" /> &gt; logout
            </Button>
            <p className="font-mono text-[9px] text-muted-foreground/60 tracking-wider">hz.v2.0.0 · horus.eye</p>
          </div>
        )}
        {collapsed && user && (
          <Button variant="ghost" size="icon" onClick={signOut} className="mx-auto h-8 w-8 hover:text-destructive">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
