import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type Role = "admin" | "user";
type Permission = "view_dashboard" | "view_monitor" | "use_terminal" | "use_cli";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: Role[];
  permissions: Permission[];
  loading: boolean;
  isAdmin: boolean;
  hasPermission: (p: Permission) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccess = async (uid: string) => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("user_permissions").select("permission").eq("user_id", uid),
    ]);
    setRoles((r ?? []).map((x) => x.role as Role));
    setPermissions((p ?? []).map((x) => x.permission as Permission));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadAccess(sess.user.id), 0);
      } else {
        setRoles([]);
        setPermissions([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) loadAccess(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    if (user) await loadAccess(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = roles.includes("admin");
  const hasPermission = (p: Permission) => isAdmin || permissions.includes(p);

  return (
    <AuthContext.Provider value={{ session, user, roles, permissions, loading, isAdmin, hasPermission, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
