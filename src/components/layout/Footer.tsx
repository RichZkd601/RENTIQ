export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        <p className="mb-3 font-medium text-foreground">RentIQ — Le copilote patrimonial de l'investisseur immobilier</p>
        <p className="leading-relaxed">
          RentIQ éclaire vos décisions, il ne les remplace pas. Les projections sont indicatives et ne constituent
          ni un conseil en investissement, ni un conseil fiscal ou juridique. La fiscalité et la réglementation locative
          évoluent fréquemment : consultez un professionnel (notaire, expert-comptable, avocat fiscaliste) avant tout arbitrage.
        </p>
      </div>
    </footer>
  );
}
