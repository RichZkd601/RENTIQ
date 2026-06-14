export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-muted-foreground">
        <p className="mb-3 font-medium text-foreground">RentIQ — Arbitre de stratégies d'investissement immobilier</p>
        <p className="leading-relaxed">
          Simulation indicative. Ne constitue ni un conseil en investissement, ni un conseil fiscal ou juridique.
          La fiscalité de l'achat-revente et la réglementation locative évoluent fréquemment :
          consultez un professionnel (notaire, expert-comptable, avocat fiscaliste) avant toute décision.
        </p>
      </div>
    </footer>
  );
}
