import { Link } from "@tanstack/react-router";
import { Footer } from "./Footer";
import logoUrl from "@/assets/rentiq-logo.png";

/** Chrome commun aux pages légales publiques (CGU, confidentialité). */
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src={logoUrl} alt="RentIQ" width={28} height={28} className="h-7 w-7" />
            <span className="text-[15px]">RentIQ</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Retour à l'accueil
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Dernière mise à jour : {lastUpdated}</p>
        <div className="mt-8 space-y-7">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1.5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
