import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getQuota } from "@/lib/analysis.functions";
import { usePaddleCheckout } from "@/hooks/usePaddleCheckout";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/upgrade")({
  head: () => ({
    meta: [
      { title: "Plans & tarifs — RentIQ" },
      { name: "description", content: "Choisissez le plan adapté à votre rythme d'analyses immobilières." },
    ],
  }),
  component: UpgradePage,
});

type Cycle = "monthly" | "yearly";

const PLANS = [
  {
    key: "free",
    name: "Free",
    quota: "3 analyses / mois",
    features: [
      "Comparatif 6 stratégies",
      "Bandeau réglementaire local",
      "Export PDF de l'analyse",
      "1 bien suivi dans le patrimoine",
    ],
    monthly: { price: 0, priceId: null as string | null },
    yearly: { price: 0, priceId: null as string | null },
  },
  {
    key: "pro",
    name: "Pro",
    quota: "Analyses illimitées",
    features: [
      "Tout RentIQ débloqué",
      "Patrimoine multi-biens illimité",
      "Historique d'analyses complet",
      "Veille & radar Firecrawl en continu",
      "Assistant IA prioritaire",
      "Support email prioritaire",
    ],
    monthly: { price: 9, priceId: "pro_monthly" },
    yearly: { price: 7.2, priceId: "pro_yearly" },
    highlight: true,
  },
];



function UpgradePage() {
  const fetchQuota = useServerFn(getQuota);
  const quota = useQuery({ queryKey: ["quota"], queryFn: () => fetchQuota({}) });
  const { subscription, isActive } = useSubscription();
  const { openCheckout, loading } = usePaddleCheckout();
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      toast.success("Paiement reçu — votre plan sera activé d'ici quelques secondes.");
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const currentPlan = isActive ? "pro" : "free";

  const handleCheckout = async (priceId: string, planName: string) => {
    if (!userId) {
      toast.error("Connectez-vous pour souscrire.");
      return;
    }
    track("checkout_started", { plan: planName, price_id: priceId });
    try {
      await openCheckout({
        priceId,
        customerEmail: userEmail ?? undefined,
        customData: { userId },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'ouvrir le paiement.");
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Choisissez votre plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fiscalité 2026, comparatif 6 stratégies, conformité réglementaire locale.
        </p>
        {quota.data && (
          <Badge variant="outline" className="mt-4 text-xs">
            Plan actuel : {currentPlan} · {quota.data.used}/{quota.data.limit} ce mois
          </Badge>
        )}
      </div>

      <div className="flex justify-center">
        <div className="inline-flex rounded-full border bg-muted/30 p-1 text-sm">
          <button
            onClick={() => setCycle("monthly")}
            className={`rounded-full px-4 py-1.5 transition ${cycle === "monthly" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Mensuel
          </button>
          <button
            onClick={() => setCycle("yearly")}
            className={`rounded-full px-4 py-1.5 transition ${cycle === "yearly" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Annuel <span className="ml-1 text-xs text-emerald-600">−20%</span>
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 md:grid-cols-2">
        {PLANS.map((p) => {
          const isCurrent = p.key === currentPlan;
          const priceInfo = p[cycle];
          const isFree = p.key === "free";
          const highlight = "highlight" in p && p.highlight;

          return (
            <Card key={p.key} className={highlight ? "border-primary shadow-lg" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{p.name}</CardTitle>
                  {highlight && <Badge>Recommandé</Badge>}
                </div>
                <p className="mt-2">
                  <span className="text-3xl font-bold">{priceInfo.price} €</span>
                  {!isFree && <span className="text-sm text-muted-foreground">/mois</span>}
                </p>
                {!isFree && cycle === "yearly" && (
                  <p className="text-xs text-muted-foreground">
                    Facturé {Math.round(priceInfo.price * 12)} €/an
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{p.quota}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button className="w-full" variant="outline" disabled>
                    Plan actuel
                  </Button>
                ) : isFree ? (
                  <Button className="w-full" variant="outline" disabled>
                    Inclus par défaut
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={highlight ? "default" : "outline"}
                    disabled={loading || !priceInfo.priceId}
                    onClick={() => priceInfo.priceId && handleCheckout(priceInfo.priceId, p.key)}
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Choisir {p.name}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Sans engagement. Annulable à tout moment. Paiement sécurisé.
      </p>
    </div>
  );
}
