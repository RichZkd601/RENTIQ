import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t bg-muted/30">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-brand-gradient opacity-40" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium text-foreground">
            <span className="font-bold">Rent<span className="text-gradient">IQ</span></span>
            {" "}— Le copilote patrimonial de l'investisseur immobilier
          </p>
          <nav className="flex flex-wrap gap-4">
            <Link to="/legal/cgu" className="hover:text-foreground underline-offset-4 hover:underline">
              CGU
            </Link>
            <Link
              to="/legal/confidentialite"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Confidentialité
            </Link>
          </nav>
        </div>
        <p className="leading-relaxed">
          RentIQ éclaire vos décisions, il ne les remplace pas. Les projections sont indicatives et ne constituent
          ni un conseil en investissement, ni un conseil fiscal ou juridique. La fiscalité et la réglementation locative
          évoluent fréquemment : consultez un professionnel (notaire, expert-comptable, avocat fiscaliste) avant tout arbitrage.
        </p>
      </div>
    </footer>
  );
}
