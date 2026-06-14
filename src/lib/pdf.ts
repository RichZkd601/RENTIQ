// Génération PDF — client uniquement (jsPDF). Ne pas importer côté serveur.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STRATEGY_LABELS: Record<string, string> = {
  location_nue: "Location nue",
  lmnp_longue_duree: "Location Meublée Non Professionnelle (LMNP) longue durée",
  bail_mobilite: "Bail mobilité",
  colocation: "Colocation",
  coliving: "Coliving",
  airbnb: "Airbnb / courte durée",
};

function eur(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export function generateAnalysisPdf(analysis: any) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  const calc = analysis.calc ?? {};
  const ai = analysis.ai_analysis ?? {};
  const matched = calc.matched ?? {};
  const all = matched.strategies ?? [];
  const ranked = matched.ranked ?? [];
  const banner = matched.regulatoryBanner;
  const flip = calc.flip;
  const winnerKey = ai.winnerStrategy ?? ranked[0]?.strategy;
  const winner = ranked.find((s: any) => s.strategy === winnerKey) ?? ranked[0];

  // En-tête
  doc.setFontSize(18).setFont("helvetica", "bold").text("RentIQ — Rapport d'analyse", margin, y);
  y += 22;
  doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(120);
  doc.text(
    `${analysis.city_name} · ${analysis.surface_sqm}m² · ${eur(Number(analysis.purchase_price))} · ${new Date(analysis.created_at).toLocaleDateString("fr-FR")}`,
    margin,
    y,
  );
  y += 18;
  doc.setTextColor(0);

  // Bandeau réglementaire
  if (banner) {
    doc.setFillColor(banner.level === "danger" ? 254 : banner.level === "warning" ? 254 : 239, banner.level === "danger" ? 226 : banner.level === "warning" ? 243 : 246, banner.level === "danger" ? 226 : banner.level === "warning" ? 199 : 255);
    doc.roundedRect(margin, y, pageW - margin * 2, 38, 4, 4, "F");
    doc.setFontSize(9).setFont("helvetica", "bold");
    doc.text(banner.level === "danger" ? "Interdiction" : banner.level === "warning" ? "Attention" : "Information", margin + 10, y + 14);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(banner.message, pageW - margin * 2 - 20), margin + 10, y + 28);
    y += 50;
  }

  // Verdict
  doc.setFontSize(11).setFont("helvetica", "bold").text("Stratégie recommandée", margin, y); y += 16;
  doc.setFontSize(16).setFont("helvetica", "bold");
  const winLabel = winnerKey === "aucune" ? "Ne pas acheter" : STRATEGY_LABELS[winnerKey] ?? "—";
  doc.text(winLabel, margin, y); y += 18;
  if (winner && winnerKey !== "aucune") {
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text(
      `Cashflow net : ${eur(winner.monthlyNetCashflow)}/mois · Rendement net : ${winner.netYieldPct}%`,
      margin,
      y,
    );
    y += 16;
  }
  if (ai.rationale) {
    doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(60);
    const lines = doc.splitTextToSize(ai.rationale, pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 12 + 8;
    doc.setTextColor(0);
  }

  // Forces / Risques / Reco
  const bullets = (title: string, items: string[]) => {
    if (!items?.length) return;
    doc.setFontSize(11).setFont("helvetica", "bold").text(title, margin, y); y += 14;
    doc.setFontSize(9).setFont("helvetica", "normal");
    for (const it of items) {
      const lines = doc.splitTextToSize(`• ${it}`, pageW - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 11;
    }
    y += 6;
  };
  bullets("Forces", ai.forces ?? []);
  bullets("Risques", ai.risks ?? []);
  bullets("Recommandations", ai.recommendations ?? []);

  // Tableau comparatif
  autoTable(doc, {
    startY: y + 4,
    head: [["Stratégie", "Cashflow/mois", "Rendement net", "Régime fiscal", "Statut"]],
    body: all.map((s: any) => [
      STRATEGY_LABELS[s.strategy] ?? s.strategy,
      s.eligible ? `${s.monthlyNetCashflow >= 0 ? "+" : ""}${s.monthlyNetCashflow} €` : "—",
      s.eligible ? `${s.netYieldPct}%` : "—",
      s.eligible ? s.taxRegime : "—",
      s.eligible ? `Éligible (score ${s.score})` : (s.blockedReason ?? "Écartée"),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: margin, right: margin },
  });

  // @ts-ignore
  y = (doc as any).lastAutoTable.finalY + 16;

  // Détail top 3
  for (const s of ranked.slice(0, 3)) {
    if (y > 720) { doc.addPage(); y = margin; }
    doc.setFontSize(11).setFont("helvetica", "bold").text(STRATEGY_LABELS[s.strategy] ?? s.strategy, margin, y); y += 14;
    autoTable(doc, {
      startY: y,
      body: [
        ["Revenus annuels bruts", eur(s.annualGrossRevenue)],
        ["Charges d'exploitation", eur(s.annualOperatingCharges)],
        ["Annuités emprunt", eur(s.annualMortgagePayment)],
        ["Impôt + Prélèvements Sociaux (PS)", eur(s.annualTax)],
        ["Cashflow net annuel", eur(s.annualNetCashflow)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      theme: "plain",
      margin: { left: margin, right: margin },
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Flip
  if (flip) {
    if (y > 700) { doc.addPage(); y = margin; }
    doc.setFontSize(11).setFont("helvetica", "bold").text("Flip (achat-revente)", margin, y); y += 14;
    autoTable(doc, {
      startY: y,
      body: [
        ["Coût total opération", eur(flip.totalCost)],
        ["Marge brute", eur(flip.grossMargin)],
        ["Impôt plus-value", eur(flip.tax)],
        ["Marge nette", `${eur(flip.netMargin)} (${flip.marginPct}%)`],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      theme: "plain",
      margin: { left: margin, right: margin },
    });
    // @ts-ignore
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Disclaimer (page courante ou nouvelle)
  if (y > 760) { doc.addPage(); y = margin; }
  doc.setFontSize(8).setTextColor(120).setFont("helvetica", "italic");
  const disc = "Résultats indicatifs basés sur la fiscalité 2026 connue à ce jour. Ne constitue pas un conseil en investissement. Validez auprès d'un expert-comptable et de la mairie concernée avant tout engagement.";
  doc.text(doc.splitTextToSize(disc, pageW - margin * 2), margin, Math.min(y + 10, 800));

  const filename = `rentiq-${(analysis.city_name as string).toLowerCase().replace(/\s+/g, "-")}-${analysis.id.slice(0, 8)}.pdf`;
  doc.save(filename);
}
