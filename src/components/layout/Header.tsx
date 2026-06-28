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

  const navItems = [
    { to: "/dashboard", label: "Tableau de bord" },
    { to: "/patrimoine", label: "Patrimoine" },
    { to: "/radar", label: "Opportunités" },
    { to: "/recommandations", label: "Recommandations" },
    { to: "/veille", label: "Réglementation" },
    { to: "/assistant", label: "Assistant" },
  ] as const;

  return (
    <header className="glass-strong sticky top-0 z-40 border-b border-border/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          to={email ? "/dashboard" : "/"}
          className="group flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient shadow-glow transition-transform duration-300 [transition-timing-function:var(--ease-spring)] group-hover:scale-105">
            <img src={logoUrl} alt="RentIQ" width={22} height={22} className="h-[22px] w-[22px]" />
          </span>
          <span className="text-[16px] font-bold">
            Rent<span className="text-gradient">IQ</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          {email &&
            navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group relative rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      className={`pointer-events-none absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-brand-gradient transition-all duration-300 [transition-timing-function:var(--ease-spring)] ${
                        isActive
                          ? "scale-x-100 opacity-100"
                          : "scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-60"
                      }`}
                    />
                  </>
                )}
              </Link>
            ))}
        </nav>
        <div className="flex items-center gap-2">
          {email ? (
            <>
              <Button asChild variant="gradient" className="hidden h-10 rounded-xl px-5 text-[15px] font-semibold sm:inline-flex">
                <Link to="/analyser">Évaluer une opportunité</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Mon compte" className="rounded-full ring-1 ring-border hover:ring-primary/40">
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
              <Button size="sm" variant="gradient" asChild className="rounded-lg font-semibold">
                <Link to="/auth">Ouvrir mon espace</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
