import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, UserCircle2 } from "lucide-react";
import logoUrl from "@/assets/rentiq-logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setEmail(session?.user?.email ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to={email ? "/dashboard" : "/"} className="flex items-center gap-2 font-semibold tracking-tight">
          <img src={logoUrl} alt="RentIQ" width={28} height={28} className="h-7 w-7" />
          <span className="text-[15px]">RentIQ</span>
        </Link>
        <nav className="hidden items-center gap-5 text-sm lg:flex">
          {email && (
            <>
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Tableau de bord
              </Link>
              <Link to="/patrimoine" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Patrimoine
              </Link>
              <Link to="/radar" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Opportunités
              </Link>
              <Link to="/recommandations" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Recommandations
              </Link>
              <Link to="/veille" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Réglementation
              </Link>
              <Link to="/assistant" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                Assistant
              </Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {email ? (
            <>
              <Button asChild className="hidden h-10 rounded-xl px-5 text-[15px] font-semibold shadow-card sm:inline-flex">
                <Link to="/analyser">Évaluer une opportunité</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" aria-label="Mon compte">
                    <UserCircle2 className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {email && (
                    <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                      {email}
                    </DropdownMenuLabel>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/compte">Mon compte & abonnement</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/upgrade">Plans & tarifs</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/auth">Se connecter</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/auth">Ouvrir mon espace</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
