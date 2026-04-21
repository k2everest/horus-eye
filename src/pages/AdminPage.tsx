import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

type Permission = "view_dashboard" | "view_monitor" | "use_terminal" | "use_cli";
type Role = "admin" | "user";
const ALL_PERMS: Permission[] = ["view_dashboard", "view_monitor", "use_terminal", "use_cli"];
const PERM_LABEL: Record<Permission, string> = {
  view_dashboard: "Dashboard",
  view_monitor: "Monitor",
  use_terminal: "Terminal",
  use_cli: "CLI",
};

interface UserRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  roles: Role[];
  permissions: Permission[];
}

const AdminPage = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: perms }] = await Promise.all([
      supabase.from("profiles").select("user_id, email, display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("user_permissions").select("user_id, permission"),
    ]);
    const map = new Map<string, UserRow>();
    (profiles ?? []).forEach((p) =>
      map.set(p.user_id, { user_id: p.user_id, email: p.email, display_name: p.display_name, roles: [], permissions: [] })
    );
    (roles ?? []).forEach((r) => {
      const row = map.get(r.user_id);
      if (row) row.roles.push(r.role as Role);
    });
    (perms ?? []).forEach((p) => {
      const row = map.get(p.user_id);
      if (row) row.permissions.push(p.permission as Permission);
    });
    setRows([...map.values()].sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRole = async (uid: string, role: Role, has: boolean) => {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
      if (error) return toast.error(error.message);
    }
    toast.success("Role atualizada");
    load();
  };

  const togglePerm = async (uid: string, perm: Permission, has: boolean) => {
    if (has) {
      const { error } = await supabase.from("user_permissions").delete().eq("user_id", uid).eq("permission", perm);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_permissions").insert({ user_id: uid, permission: perm, granted_by: user?.id });
      if (error) return toast.error(error.message);
    }
    load();
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Painel de Administração
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Gerencie roles e permissões dos usuários.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Usuários ({rows.length})</CardTitle>
          <CardDescription className="text-xs">
            Marque <strong>admin</strong> para acesso total. Permissões individuais são ignoradas se o usuário for admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Carregando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Usuário</TableHead>
                  <TableHead className="text-xs">Admin</TableHead>
                  {ALL_PERMS.map((p) => (
                    <TableHead key={p} className="text-xs text-center">{PERM_LABEL[p]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isAdmin = r.roles.includes("admin");
                  return (
                    <TableRow key={r.user_id}>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{r.display_name ?? "—"}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{r.email}</p>
                          </div>
                          {r.user_id === user?.id && <Badge variant="outline" className="text-[9px] h-4">você</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={isAdmin}
                          onCheckedChange={() => toggleRole(r.user_id, "admin", isAdmin)}
                          disabled={r.user_id === user?.id && isAdmin}
                        />
                      </TableCell>
                      {ALL_PERMS.map((p) => {
                        const has = r.permissions.includes(p);
                        return (
                          <TableCell key={p} className="text-center">
                            <Checkbox
                              checked={has || isAdmin}
                              disabled={isAdmin}
                              onCheckedChange={() => togglePerm(r.user_id, p, has)}
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPage;
