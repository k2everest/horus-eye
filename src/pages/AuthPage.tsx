import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, Hexagon } from "lucide-react";

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
});

const AuthPage = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate("/", { replace: true });
  }, [session, loading, navigate]);

  const handle = async (mode: "signin" | "signup") => {
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate("/", { replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-accent/20 blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo / brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-lg border border-primary/40 bg-primary/5 mb-3 animate-neon-pulse">
            <Hexagon className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-display text-3xl tracking-wider text-gradient-neon">HORUS.EYE</h1>
          <p className="font-mono text-[10px] text-muted-foreground tracking-[0.3em] uppercase mt-2">
            Secure // Access // Terminal
          </p>
        </div>

        <div className="neon-card rounded-lg p-6 corner-brackets">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full bg-secondary/40 border border-primary/20">
              <TabsTrigger value="signin" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-mono text-xs">
                &gt; signin
              </TabsTrigger>
              <TabsTrigger value="signup" className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent font-mono text-xs">
                &gt; signup
              </TabsTrigger>
            </TabsList>

            {(["signin", "signup"] as const).map((mode) => (
              <TabsContent key={mode} value={mode} className="space-y-4 pt-5">
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">
                    [ Email ]
                  </Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@horus.net"
                    className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="font-mono text-[10px] text-primary/80 tracking-widest uppercase">
                    [ Passphrase ]
                  </Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="font-mono text-xs bg-background/60 border-primary/30 focus-visible:ring-primary"
                  />
                </div>
                <Button
                  className="w-full font-display tracking-widest uppercase border border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_24px_hsl(var(--primary)/0.6)] transition-all"
                  disabled={busy}
                  onClick={() => handle(mode)}
                >
                  {busy ? ">>> processing..." : mode === "signin" ? ">>> authenticate" : ">>> create_account"}
                </Button>
              </TabsContent>
            ))}
          </Tabs>

          <div className="pt-4 mt-4 border-t border-primary/10 text-center">
            <Link
              to="/register"
              className="font-mono text-[10px] text-muted-foreground hover:text-accent tracking-wider transition-colors"
            >
              &gt; novo operador? provisionar_conta
            </Link>
          </div>
        </div>

        <p className="text-center mt-4 font-mono text-[10px] text-muted-foreground/60 tracking-wider">
          v2.0.0 · encrypted_session · 256bit
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
