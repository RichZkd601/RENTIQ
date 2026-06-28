import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { track } from "@/lib/analytics";

const searchSchema = z.object({
  invite: z.string().trim().min(1).max(64).optional(),
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Connexion — RentIQ" },
      { name: "description", content: "Accédez à RentIQ pour analyser vos projets d'investissement immobilier." },
    ],
  }),
  component: AuthPage,
});

const credentialsSchema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(6, "6 caractères minimum").max(72),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
});

type Mode = "signin" | "signup" | "forgot";
const INVITE_STORAGE_KEY = "rentiq_invite_code";

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState(search.invite ?? "");
  const [loading, setLoading] = useState(false);

  // Si on arrive avec ?invite=XYZ → on bascule sur l'inscription et on mémorise le code
  useEffect(() => {
    if (search.invite) {
      setInviteCode(search.invite);
      setMode("signup");
      try {
        localStorage.setItem(INVITE_STORAGE_KEY, search.invite);
      } catch {
        /* noop */
      }
    }
  }, [search.invite]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/historique" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const parsed = emailOnlySchema.safeParse({ email });
        if (!parsed.success) {
          toast.error(parsed.error.issues[0]?.message ?? "Email invalide");
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Email envoyé. Vérifie ta boîte de réception pour réinitialiser ton mot de passe.");
        setMode("signin");
        return;
      }

      const parsed = credentialsSchema.safeParse({ email, password });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Champs invalides");
        return;
      }

      if (mode === "signup") {
        const code = inviteCode.trim();
        if (!code) {
          toast.error("Un code d'invitation est requis pour rejoindre la bêta.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), invitation_code: code },
          },
        });
        if (error) throw error;
        track("signup", { has_session: !!data.session });
        try {
          localStorage.removeItem(INVITE_STORAGE_KEY);
        } catch {
          /* noop */
        }
        if (!data.session) {
          toast.success("Compte créé. Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.");
          setMode("signin");
        } else {
          toast.success("Compte créé. Bienvenue.");
          navigate({ to: "/analyser" });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        track("signin", { method: "password" });
        toast.success("Bienvenue.");
        navigate({ to: "/historique" });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Erreur d'authentification";
      const friendly = raw.includes("INVITATION_REQUIRED")
        ? "Code d'invitation invalide, expiré ou déjà utilisé."
        : raw.includes("Invalid login")
          ? "Email ou mot de passe incorrect"
          : raw.includes("Email not confirmed")
            ? "Email non confirmé. Vérifie ta boîte de réception."
            : raw.includes("User already registered")
              ? "Un compte existe déjà avec cet email. Essaie de te connecter."
              : raw;
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    // Bêta privée : Google uniquement pour les comptes existants.
    if (mode === "signup") {
      toast.error("Pour créer un compte, utilise ton code d'invitation + email. Google sera disponible pour la connexion ensuite.");
      return;
    }
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if ("error" in result && result.error) {
        throw result.error;
      }
      if (!("redirected" in result && result.redirected)) {
        navigate({ to: "/historique" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connexion Google impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle className="text-2xl">RentIQ</CardTitle>
          <CardDescription>
            La meilleure stratégie pour votre bien, en 60 secondes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
              <path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"/>
            </svg>
            Continuer avec Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou par email</span>
            </div>
          </div>
          {mode === "forgot" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  required
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "..." : "Envoyer le lien de réinitialisation"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="block w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Retour à la connexion
              </button>
            </form>
          ) : (
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Connexion</TabsTrigger>
                <TabsTrigger value="signup">Créer un compte</TabsTrigger>
              </TabsList>
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <TabsContent value="signup" className="m-0 space-y-4">
                  <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    🔒 Bêta privée : un code d'invitation est nécessaire pour créer un compte.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inviteCode">Code d'invitation</Label>
                    <Input
                      id="inviteCode"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="RENTIQ-XXXX"
                      maxLength={64}
                      required
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Nom complet</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jean Dupont"
                      maxLength={100}
                    />
                  </div>
                </TabsContent>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vous@exemple.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Mot de passe</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Mot de passe oublié ?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "..." : mode === "signup" ? "Créer mon compte" : "Se connecter"}
                </Button>
              </form>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
