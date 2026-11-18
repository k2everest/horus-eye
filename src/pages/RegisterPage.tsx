import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Hexagon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const schema = z
  .object({
    displayName: z.string().trim().min(2, "Nome muito curto").max(60, "Nome muito longo"),
    email: z.string().trim().email("Email inválido").max(255),
    password: z.string().min(8, "Mínimo 8 caracteres").max(72),
    confirm: z.string(),
    accept: z.boolean(),
  })
  .refine((d) => d.password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] })
  .refine((d) => d.accept, { message: "Você precisa aceitar os termos", path: ["accept"] });

const RegisterPage = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ displayName, email, password, confirm, accept });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { display_name: parsed.data.displayName },
        },
      });
      if (error) throw error;
      toast.success("Conta criada. Verifique seu email para confirmar.");
      navigate("/auth", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no registro");
    } finally {
      setBusy(false);
    }
  };

  const strength = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-accent/20 blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-lg border border-primary/40 bg-primary/5 mb-3 animate-neon-pulse">
            <Hexagon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-3xl tracking-wider text-gradient-neon">REGISTER.NODE</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase mt-2">
            Provision // New // Operator
          </p>
        </div>

        <form onSubmit={handleSubmit} className="neon-card rounded-lg p-6 corner-brackets space-y-4">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">[ Operator Handle ]</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="horus_operator"
              className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
              autoComplete="nickname"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">[ Email ]</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@horus.net"
              className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">[ Passphrase ]</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
              autoComplete="new-password"
            />
            <div className="flex gap-1 pt-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < strength
                      ? strength <= 1
                        ? "bg-destructive"
                        : strength === 2
                        ? "bg-yellow-500"
                        : strength === 3
                        ? "bg-accent"
                        : "bg-primary"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <p className="font-mono text-[9px] text-muted-foreground/70 tracking-wider">
              entropy: {strength}/4 · min 8 chars
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">[ Confirm Passphrase ]</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
              autoComplete="new-password"
            />
          </div>

          <label className="flex items-start gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={accept}
              onChange={(e) => setAccept(e.target.checked)}
              className="mt-0.5 h-3 w-3 rounded border-primary/40 bg-background/60 accent-primary"
            />
            <span className="font-mono text-[10px] text-muted-foreground tracking-wider leading-relaxed">
              Aceito o protocolo Horus.Eye e autorizo o monitoramento de sessão criptografada.
            </span>
          </label>

          <Button
            type="submit"
            className="w-full font-display tracking-widest uppercase border border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_24px_hsl(var(--primary)/0.6)] transition-all"
            disabled={busy}
          >
            {busy ? ">>> provisioning..." : ">>> initialize_account"}
          </Button>

          <div className="pt-2 text-center">
            <Link to="/auth" className="font-mono text-[10px] text-muted-foreground hover:text-primary tracking-wider transition-colors">
              &gt; já tem acesso? autenticar_sessão
            </Link>
          </div>
        </form>

        <p className="text-center mt-4 font-mono text-[10px] text-muted-foreground/60 tracking-wider">
          v2.0.0 · encrypted_session · 256bit
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
