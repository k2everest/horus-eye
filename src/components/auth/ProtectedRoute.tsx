import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin }: Props) {
  const { session, loading, isAdmin } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground">Carregando…</div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}
