import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateAnalysis, getCities, getCityData, requestCity } from "@/lib/analysis.functions";
import { getMarketSnapshot } from "@/lib/market.functions";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { track } from "@/lib/analytics";

const optNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
  z.number().min(0).optional(),
);
const reqNum = (min = 0) => z.preprocess((v) => Number(v), z.number().min(min));

const FormSchema = z.object({
  cityName: z.string().min(1, "Ville requise"),
  postalCode: z.string().regex(/^\d{5}$/, "Code postal à 5 chiffres requis"),
  propertyType: z.enum(["studio", "t2", "t3", "t4_plus", "maison"]).optional().or(z.literal("").transform(() => undefined)),
  surfaceM2: reqNum(8),
  rooms: reqNum(1),
  price: reqNum(10_000),
  worksBudget: reqNum(0),
  furnitureBudget: reqNum(0),
  propertyTax: reqNum(0),
  copro: reqNum(0),
  downPayment: reqNum(0),
  monthlyNu: optNum,
  monthlyMeuble: optNum,
  colocRoomRent: optNum,
  colocRoomCount: optNum,
  airbnbNightly: optNum,
  airbnbOccupancy: optNum,
  isClasseTourisme: z.boolean().default(false),
  loanAmount: reqNum(0),
  // Taux saisi en POURCENT (ex. "3.5" = 3,5 %). Converti en décimal au submit.
  loanRatePct: z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0).max(20)),
  loanYears: reqNum(1),
  tmi: z.coerce.number(),
  objective: z.enum(["cashflow", "patrimoine", "equilibre", "defisc"]),
  effort: z.enum(["passif", "modere", "actif"]),
  exterior: z.enum(["aucun", "balcon", "terrasse", "rez_jardin"]).default("aucun"),
});

type FormValues = z.input<typeof FormSchema>;
const DRAFT_KEY = "rentiq:analyse-draft";

export const Route = createFileRoute("/_authenticated/analyser")({
  head: () => ({
    meta: [
      { title: "Nouvelle opportunité — RentIQ" },
      { name: "description", content: "Évaluez l'impact d'une opportunité sur votre patrimoine : 6 stratégies comparées en 60 secondes." },
    ],
  }),
  component: AnalyserPage,
});

function AnalyserPage() {
  const navigate = useNavigate();
  const generate = useServerFn(generateAnalysis);
  const fetchCities = useServerFn(getCities);
  const fetchCityData = useServerFn(getCityData);
  const submitCityRequest = useServerFn(requestCity);
  const { data: registeredCities = [] } = useQuery({
    queryKey: ["cities"],
    queryFn: () => fetchCities({ data: undefined }),
  });
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [cityMode, setCityMode] = useState<"registered" | "custom">("registered");
  const [requestingCity, setRequestingCity] = useState(false);
  const [requestedCities, setRequestedCities] = useState<string[]>([]);
  const [selectedInsee, setSelectedInsee] = useState<string | undefined>(undefined);
  type HypothesisKey = "nu" | "meuble" | "coloc" | "airbnb";
  const [enabledHyp, setEnabledHyp] = useState<Record<HypothesisKey, boolean>>({
    nu: true,
    meuble: false,
    coloc: false,
    airbnb: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema) as any,
    defaultValues: {
      cityName: "",
      postalCode: "",
      surfaceM2: 50,
      rooms: 2,
      price: 150_000,
      worksBudget: 5_000,
      furnitureBudget: 4_000,
      propertyTax: 900,
      copro: 1_200,
      downPayment: 0,
      isClasseTourisme: false,
      loanAmount: 150_000,
      loanRatePct: 4,
      loanYears: 25,
      tmi: 0.30,
      objective: "equilibre",
      effort: "modere",
      exterior: "aucun",
    },
    mode: "onTouched",
  });

  const { register, handleSubmit, watch, setValue, getValues, formState, reset } = form;

  // Pré-remplissage depuis "Modifier le formulaire" sur la page d'analyse
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("rentiq:prefill");
    if (!raw) {
      const draftRaw = sessionStorage.getItem(DRAFT_KEY);
      if (!draftRaw) return;
      try {
        const draft = JSON.parse(draftRaw) as { step?: number; values?: Partial<FormValues>; enabled?: Partial<Record<HypothesisKey, boolean>> };
        if (draft.values) reset(draft.values, { keepDefaultValues: true });
        if (draft.step && draft.step >= 1 && draft.step <= 3) setStep(draft.step);
        if (draft.enabled) setEnabledHyp((s) => ({ ...s, ...draft.enabled }));
      } catch {
        sessionStorage.removeItem(DRAFT_KEY);
      }
      return;
    }
    try {
      const prefill = JSON.parse(raw);
      reset({ ...prefill }, { keepDefaultValues: false });
      // Marquer tous les champs renseignés comme "dirty" pour éviter
      // que le smart prefill ne les écrase ensuite.
      Object.keys(prefill).forEach((k) => {
        if (prefill[k] !== undefined && prefill[k] !== null && prefill[k] !== "") {
          setValue(k as any, prefill[k], { shouldDirty: true });
        }
      });
      // Active automatiquement les hypothèses renseignées lors du pré-remplissage
      setEnabledHyp((s) => ({
        nu: !!prefill.monthlyNu || s.nu,
        meuble: !!prefill.monthlyMeuble || s.meuble,
        coloc: !!(prefill.colocRoomRent || prefill.colocRoomCount) || s.coloc,
        airbnb: !!(prefill.airbnbNightly || prefill.airbnbOccupancy) || s.airbnb,
      }));
      setStep(3);
      toast.success("Formulaire pré-rempli avec votre dernière analyse");
    } catch {
      // ignore
    } finally {
      sessionStorage.removeItem("rentiq:prefill");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, values: getValues(), enabled: enabledHyp }));
  }, [step, getValues, enabledHyp]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const subscription = watch((values) => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, values, enabled: enabledHyp }));
    });
    return () => subscription.unsubscribe();
  }, [watch, step, enabledHyp]);

  // Note : la ville est désormais résolue dynamiquement depuis le CP via
  // geo.api.gouv.fr (toutes les communes FR). Pas de fallback "ville enregistrée".

  // Smart prefill : remplit automatiquement les champs liés tant que
  // l'utilisateur ne les a pas saisis manuellement.
  const watchedPrice = watch("price");
  const watchedDownPayment = watch("downPayment");
  const watchedSurface = watch("surfaceM2");
  const watchedRooms = watch("rooms");
  const watchedType = watch("propertyType");
  const watchedCity = watch("cityName");

  const watchedPostal = watch("postalCode");

  // Données de marché de la ville (depuis city_data) — prioritaires sur les heuristiques.
  const { data: cityData } = useQuery({
    queryKey: ["cityData", watchedCity?.toLowerCase().trim()],
    queryFn: () => fetchCityData({ data: { cityName: watchedCity } }),
    enabled: !!watchedCity && watchedCity.length >= 2 && registeredCities.includes(watchedCity),
    staleTime: 5 * 60 * 1000,
  });

  // Snapshot de marché par code postal (geo.api.gouv.fr + encadrement Paris, cache 30j)
  const fetchSnapshot = useServerFn(getMarketSnapshot);
  const { data: marketSnapshot, isFetching: marketLoading, error: marketError } = useQuery({
    queryKey: ["marketSnapshot", watchedPostal, selectedInsee],
    queryFn: () => fetchSnapshot({ data: { postalCode: watchedPostal!, preferredInsee: selectedInsee } }),
    enabled: !!watchedPostal && /^\d{5}$/.test(watchedPostal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  // Reset l'INSEE choisi si le CP change
  useEffect(() => {
    setSelectedInsee(undefined);
  }, [watchedPostal]);

  // Auto-fill la ville lorsque le snapshot arrive
  useEffect(() => {
    if (!marketSnapshot) return;
    const current = (watch("cityName") || "").trim();
    if (!current || current.toLowerCase() !== marketSnapshot.communeName.toLowerCase()) {
      setValue("cityName", marketSnapshot.communeName, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketSnapshot?.inseeCode]);

  useEffect(() => {
    const dirty = formState.dirtyFields as Record<string, boolean>;
    const price = Number(watchedPrice) || 0;
    const surface = Number(watchedSurface) || 0;
    const rooms = Number(watchedRooms) || 0;
    const type = watchedType as string | undefined;
    const city = (watchedCity || "").toLowerCase().trim();

    // Loyer nu €/m² par défaut (heuristique de marché FR)
    const cityRentPerM2: Record<string, number> = {
      paris: 28, "boulogne-billancourt": 24, neuilly: 28,
      lyon: 16, villeurbanne: 15,
      marseille: 14, "aix-en-provence": 17,
      bordeaux: 15, toulouse: 13, nantes: 14, rennes: 13,
      lille: 14, strasbourg: 13, montpellier: 14, nice: 18,
      "saint-malo": 14, annecy: 17, grenoble: 13,
    };
    // Priorité 1 : données réelles depuis city_data ; sinon heuristique locale.
    const baseRentDb = cityData?.rentSqmUnfurnished ?? cityData?.rentSqmFurnished ?? null;
    const baseRent = baseRentDb ?? cityRentPerM2[city] ?? 12;
    const typeFactor =
      type === "studio" ? 1.3 :
      type === "t2" ? 1.15 :
      type === "t3" ? 1.0 :
      type === "t4_plus" ? 0.9 :
      type === "maison" ? 0.85 : 1.0;
    const rentPerM2 = baseRent * typeFactor;

    // Prix d'achat suggéré depuis le prix m² moyen de la ville (uniquement si l'utilisateur n'a pas saisi)
    if (cityData?.priceSqmAvg && surface > 0 && !dirty.price) {
      setValue("price", Math.round(cityData.priceSqmAvg * surface) as any, { shouldDirty: false });
    }

    // Financement : montant emprunté = prix FAI - apport personnel par défaut
    if (price > 0 && !dirty.loanAmount) {
      const downPayment = Number(watchedDownPayment) || 0;
      setValue("loanAmount", Math.max(0, price - downPayment) as any, { shouldDirty: false });
    }

    if (surface > 0) {
      if (!dirty.furnitureBudget) {
        setValue("furnitureBudget", Math.round(Math.min(surface * 120, 15000)) as any, { shouldDirty: false });
      }
      if (!dirty.worksBudget) {
        setValue("worksBudget", Math.round(surface * 150) as any, { shouldDirty: false });
      }
      if (!dirty.propertyTax) {
        setValue("propertyTax", Math.round(surface * 12) as any, { shouldDirty: false });
      }
      if (!dirty.copro) {
        setValue("copro", Math.round(surface * 25) as any, { shouldDirty: false });
      }

      // Encadrement des loyers : si présent, le plafond €/m² remplace l'heuristique
      const capNu = marketSnapshot?.rentCapUnfurnished ?? null;
      const capMeuble = marketSnapshot?.rentCapFurnished ?? null;
      const nuPerM2 = capNu ?? cityData?.rentSqmUnfurnished ?? baseRent;
      const meublePerM2 = capMeuble ?? cityData?.rentSqmFurnished ?? nuPerM2 * 1.12;
      const nu = Math.round(surface * nuPerM2 * typeFactor);
      const meuble = Math.round(surface * meublePerM2 * typeFactor);
      if (enabledHyp.nu && !dirty.monthlyNu) setValue("monthlyNu", nu as any, { shouldDirty: false });
      if (enabledHyp.meuble && !dirty.monthlyMeuble) setValue("monthlyMeuble", meuble as any, { shouldDirty: false });

      // Airbnb : ADR depuis city_data en priorité
      const adrDb =
        type === "studio" ? cityData?.adrStudio :
        type === "t2" ? cityData?.adrT2 :
        type === "t3" ? cityData?.adrT3 :
        cityData?.adrT3;
      if (enabledHyp.airbnb && !dirty.airbnbNightly) {
        const nightly = adrDb ?? Math.max(45, Math.round(meuble / 15));
        setValue("airbnbNightly", nightly as any, { shouldDirty: false });
      }
      if (enabledHyp.airbnb && !dirty.airbnbOccupancy) {
        setValue("airbnbOccupancy", (cityData?.occupancyRate ?? 0.6) as any, { shouldDirty: false });
      }
    }

    // Colocation : nb chambres = pièces - 1 (séjour)
    if (enabledHyp.coloc && rooms > 1 && !dirty.colocRoomCount) {
      setValue("colocRoomCount", Math.max(1, rooms - 1) as any, { shouldDirty: false });
    }
    if (enabledHyp.coloc && rooms > 1 && !dirty.colocRoomRent) {
      const roomsAvail = Math.max(1, rooms - 1);
      const perRoom = cityData?.rentRoomColiving
        ? Math.round(cityData.rentRoomColiving)
        : Math.round((surface * rentPerM2 * 1.15) / roomsAvail);
      if (perRoom > 0) setValue("colocRoomRent", perRoom as any, { shouldDirty: false });
    }
  }, [watchedPrice, watchedDownPayment, watchedSurface, watchedRooms, watchedType, watchedCity, cityData, marketSnapshot, formState.dirtyFields, setValue, enabledHyp]);

  const handleRequestCity = async () => {
    const name = (watch("cityName") || "").trim();
    if (name.length < 2) {
      toast.error("Saisis d'abord le nom de la ville.");
      return;
    }
    if (requestedCities.includes(name.toLowerCase())) {
      toast.info("Demande déjà envoyée pour cette ville.");
      return;
    }
    setRequestingCity(true);
    try {
      await submitCityRequest({ data: { cityName: name } });
      setRequestedCities((s) => [...s, name.toLowerCase()]);
      toast.success(`Merci ! ${name} est ajoutée à notre liste de villes à intégrer.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'envoyer la demande.");
    } finally {
      setRequestingCity(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const { loanRatePct, ...rest } = values as any;
      const res = await generate({
        data: {
          ...rest,
          loanRate: Number((Number(loanRatePct ?? 0) / 100).toFixed(4)),
          postalCode: values.postalCode,
          propertyType: values.propertyType ? values.propertyType : undefined,
          monthlyNu: enabledHyp.nu ? (values.monthlyNu || undefined) : undefined,
          monthlyMeuble: enabledHyp.meuble ? (values.monthlyMeuble || undefined) : undefined,
          colocRoomRent: enabledHyp.coloc ? (values.colocRoomRent || undefined) : undefined,
          colocRoomCount: enabledHyp.coloc ? (values.colocRoomCount || undefined) : undefined,
          airbnbNightly: enabledHyp.airbnb ? (values.airbnbNightly || undefined) : undefined,
          airbnbOccupancy: enabledHyp.airbnb ? (values.airbnbOccupancy || undefined) : undefined,
        } as any,
      });
      track("analysis_created", {
        analysis_id: res.id,
        city: values.cityName,
        surface_m2: values.surfaceM2,
        price: values.price,
        property_type: values.propertyType,
      });
      if (typeof window !== "undefined") sessionStorage.removeItem(DRAFT_KEY);
      navigate({ to: "/analyse/$id", params: { id: res.id } });
    } catch (e: any) {
      const msg = e?.message ?? "Erreur lors de l'analyse";
      if (msg.includes("Quota mensuel atteint")) {
        track("paywall_clicked", { reason: "quota_exceeded" });
        toast.error(msg);
        navigate({ to: "/upgrade" });
        return;
      }
      toast.error(msg);
      setSubmitting(false);
    }
  };

  const submitAnalysis = handleSubmit(onSubmit, (errors) => {
    const firstField = Object.keys(errors)[0] as keyof FormValues | undefined;
    const stepByField: Partial<Record<keyof FormValues, number>> = {
      postalCode: 1,
      cityName: 1,
      propertyType: 1,
      surfaceM2: 1,
      rooms: 1,
      price: 1,
      worksBudget: 1,
      furnitureBudget: 1,
      propertyTax: 1,
      copro: 1,
      downPayment: 2,
      loanAmount: 2,
      loanRatePct: 2,
      loanYears: 2,
      tmi: 2,
      objective: 3,
      effort: 3,
      exterior: 1,
      monthlyNu: 3,
      monthlyMeuble: 3,
      colocRoomRent: 3,
      colocRoomCount: 3,
      airbnbNightly: 3,
      airbnbOccupancy: 3,
      isClasseTourisme: 3,
    };
    if (firstField && stepByField[firstField]) setStep(stepByField[firstField]!);
    toast.error("Certains champs sont à compléter avant l'évaluation.");
  });

  const next = async () => {
    const fields: Record<number, (keyof FormValues)[]> = {
      1: ["postalCode", "cityName", "surfaceM2", "rooms", "price"],
      2: ["downPayment", "loanAmount", "loanRatePct", "loanYears"],
    };
    const ok = await form.trigger(fields[step] as any);
    if (ok) setStep(step + 1);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle opportunité</h1>
        <p className="text-sm text-muted-foreground">Étape {step}/3 — {step === 1 ? "Le bien" : step === 2 ? "Votre financement" : "Stratégies à comparer"}</p>
        <div className="mt-3 flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none text-primary" />
        <span>RentIQ pré-remplit les champs avec des références de marché dès que vous saisissez la ville, la surface et le type. Vos saisies restent prioritaires sur toute estimation.</span>
      </div>
      <form
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Entrée ne doit jamais lancer l'analyse : seul le bouton final le fait.
          if (e.key === "Enter") {
            const t = e.target as HTMLElement;
            if (t.tagName === "INPUT") e.preventDefault();
          }
        }}
        className="space-y-6"
      >



        <div hidden={step !== 1} className={step !== 1 ? "hidden" : undefined}>
          <Card>
            <CardHeader>
              <CardTitle>Le bien</CardTitle>
              <CardDescription>Localisation, surface et prix d'achat frais d'agence inclus.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Code postal" error={formState.errors.postalCode?.message}>
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="ex. 75011"
                  {...register("postalCode")}
                />
                {watchedPostal && /^\d{5}$/.test(watchedPostal) && (
                  <div className="mt-2 space-y-1 text-xs">
                    {marketLoading && <p className="text-muted-foreground">Récupération des données de marché…</p>}
                    {marketError && <p className="text-destructive">Code postal introuvable ou source indisponible.</p>}
                    {marketSnapshot && (
                      <>
                        <p className="text-muted-foreground">
                          ✓ {marketSnapshot.communeName}
                          {marketSnapshot.departmentCode ? ` · dpt ${marketSnapshot.departmentCode}` : ""}
                          {marketSnapshot.communes && marketSnapshot.communes.length > 1
                            ? ` · ${marketSnapshot.communes.length} communes partagent ce CP`
                            : ""}
                        </p>
                        {marketSnapshot.rentControlled && (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                            <p className="font-medium">⚠ Loyers encadrés ({marketSnapshot.regulationZone ?? "zone réglementée"})</p>
                            {(marketSnapshot.rentCapUnfurnished || marketSnapshot.rentCapFurnished) && (
                              <p className="mt-0.5">
                                Plafond €/m² :{" "}
                                {marketSnapshot.rentCapUnfurnished ? `nu ${marketSnapshot.rentCapUnfurnished}` : ""}
                                {marketSnapshot.rentCapUnfurnished && marketSnapshot.rentCapFurnished ? " · " : ""}
                                {marketSnapshot.rentCapFurnished ? `meublé ${marketSnapshot.rentCapFurnished}` : ""}
                              </p>
                            )}
                            {marketSnapshot.regulationSource && (
                              <p className="mt-0.5 opacity-70">Source : {marketSnapshot.regulationSource}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </Field>
              <Field label="Ville" error={formState.errors.cityName?.message}>
                {(() => {
                  const communes = marketSnapshot?.communes ?? [];
                  const hasCommunes = communes.length > 0;
                  const currentCity = watch("cityName") || "";
                  if (cityMode === "custom" || !hasCommunes) {
                    return (
                      <div className="space-y-2">
                        <Input
                          placeholder={hasCommunes ? "Saisir le nom de la ville" : "Saisis d'abord un code postal"}
                          value={currentCity}
                          onChange={(e) => setValue("cityName", e.target.value, { shouldDirty: true })}
                        />
                        {hasCommunes && (
                          <Button type="button" size="sm" variant="ghost" onClick={() => setCityMode("registered")}>
                            ← Revenir aux communes du CP
                          </Button>
                        )}
                        {!hasCommunes && watchedPostal && /^\d{5}$/.test(watchedPostal) && marketLoading && (
                          <p className="text-xs text-muted-foreground">Recherche des communes pour ce CP…</p>
                        )}
                      </div>
                    );
                  }
                  const selectedValue =
                    communes.find((c) => c.communeName.toLowerCase() === currentCity.toLowerCase())?.inseeCode
                    ?? selectedInsee
                    ?? marketSnapshot?.inseeCode
                    ?? "__choose__";
                  return (
                    <>
                      <Select
                        value={selectedValue}
                        onValueChange={(v) => {
                          if (v === "__custom__") {
                            setCityMode("custom");
                            return;
                          }
                          const commune = communes.find((c) => c.inseeCode === v);
                          if (commune) {
                            setSelectedInsee(commune.inseeCode);
                            setValue("cityName", commune.communeName, { shouldDirty: true });
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une commune" />
                        </SelectTrigger>
                        <SelectContent>
                          {communes.map((c) => (
                            <SelectItem key={c.inseeCode} value={c.inseeCode}>
                              {c.communeName}
                            </SelectItem>
                          ))}
                          <SelectItem value="__custom__">Autre (saisie manuelle)</SelectItem>
                        </SelectContent>
                      </Select>
                      {communes.length > 1 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {communes.length} communes partagent ce code postal. Choisis la bonne pour des données précises.
                        </p>
                      )}
                      {cityData && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          ✓ Données de marché enrichies
                          {cityData.priceSqmAvg ? ` · ${Math.round(cityData.priceSqmAvg).toLocaleString("fr-FR")} €/m²` : ""}
                          {cityData.rentSqmUnfurnished ? ` · loyer nu ${cityData.rentSqmUnfurnished} €/m²` : ""}
                        </p>
                      )}
                    </>
                  );
                })()}
              </Field>
              <Field label="Type">
                <Select
                  value={(watch("propertyType") as string) || "__none__"}
                  onValueChange={(v) => setValue("propertyType", v === "__none__" ? "" : v as any, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="studio">Studio</SelectItem>
                    <SelectItem value="t2">T2</SelectItem>
                    <SelectItem value="t3">T3</SelectItem>
                    <SelectItem value="t4_plus">T4+</SelectItem>
                    <SelectItem value="maison">Maison</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Surface (m²)" error={formState.errors.surfaceM2?.message}>
                <Input type="number" {...register("surfaceM2")} />
              </Field>
              <Field label="Nombre de pièces" error={formState.errors.rooms?.message}>
                <Input type="number" {...register("rooms")} />
              </Field>
              <Field label="Extérieur">
                <Select
                  value={(watch("exterior") as string) ?? "aucun"}
                  onValueChange={(v) => setValue("exterior", v as any, { shouldDirty: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aucun">Aucun</SelectItem>
                    <SelectItem value="balcon">Balcon</SelectItem>
                    <SelectItem value="terrasse">Terrasse</SelectItem>
                    <SelectItem value="rez_jardin">Rez-de-jardin</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prix FAI (€) — frais d'agence inclus" error={formState.errors.price?.message}>
                <Input type="number" {...register("price")} />
                {(() => {
                  const pricePerSqm = cityData?.priceSqmAvg ?? (marketSnapshot as any)?.priceSqmAvg ?? null;
                  const surface = Number(watchedSurface) || 0;
                  const suggested = pricePerSqm && surface > 0 ? Math.round(pricePerSqm * surface) : null;
                  if (!suggested) return null;
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs">
                      <Sparkles className="h-3.5 w-3.5 flex-none text-primary" />
                      <span className="flex-1">
                        Référence marché : <strong>{Math.round(pricePerSqm!).toLocaleString("fr-FR")} €/m²</strong> × {surface} m² ≈{" "}
                        <strong>{suggested.toLocaleString("fr-FR")} €</strong>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          setValue("price", suggested as any, { shouldDirty: true });
                          toast.success("Prix rempli avec la référence marché");
                        }}
                      >
                        Utiliser
                      </Button>
                    </div>
                  );
                })()}
                <p className="text-xs text-muted-foreground">
                  Prix affiché par l'agence ou le vendeur, honoraires d'agence inclus. Les frais de notaire sont estimés séparément dans le calcul.
                </p>
              </Field>
              <Field label="Travaux (€)">
                <Input type="number" {...register("worksBudget")} />
              </Field>
              <Field label="Mobilier (€)">
                <Input type="number" {...register("furnitureBudget")} />
              </Field>
              <Field label="Taxe foncière (€/an)">
                <Input type="number" {...register("propertyTax")} />
              </Field>
              <Field label="Charges copro non récup. (€/an)">
                <Input type="number" {...register("copro")} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div hidden={step !== 2} className={step !== 2 ? "hidden" : undefined}>
          <Card>
            <CardHeader>
              <CardTitle>Financement</CardTitle>
              <CardDescription>Renseignez l'apport puis le capital réellement emprunté. Mettez 0 en emprunt pour un achat comptant.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Apport personnel (€)" error={formState.errors.downPayment?.message}>
                <Input type="number" {...register("downPayment")} />
              </Field>
              <Field label="Montant emprunté (€)">
                <Input type="number" {...register("loanAmount")} />
                <p className="text-xs text-muted-foreground">
                  Capital financé par la banque. Par défaut : prix FAI moins apport, mais vous pouvez l'ajuster si la banque finance aussi les frais ou travaux.
                </p>
              </Field>
              <Field label="Taux annuel (%)" error={formState.errors.loanRatePct?.message as string}>
                <Input type="number" step="0.05" placeholder="ex. 3.5" {...register("loanRatePct")} />
                <p className="text-xs text-muted-foreground">Taux hors assurance, exprimé en pourcentage (ex. 3,5 pour 3,5 %).</p>
              </Field>
              <Field label="Durée (années)">
                <Input type="number" {...register("loanYears")} />
              </Field>
              <Field label="Tranche Marginale d'Imposition (TMI)">
                <Select value={String(watch("tmi"))} onValueChange={(v) => setValue("tmi", Number(v) as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0%</SelectItem>
                    <SelectItem value="0.11">11%</SelectItem>
                    <SelectItem value="0.3">30%</SelectItem>
                    <SelectItem value="0.41">41%</SelectItem>
                    <SelectItem value="0.45">45%</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </div>

        <div hidden={step !== 3} className={step !== 3 ? "hidden" : undefined}>
          <Card>
            <CardHeader>
              <CardTitle>Objectif & loyers de marché</CardTitle>
              <CardDescription>Renseignez au moins une hypothèse de loyer. Plus vous en remplissez, plus l'analyse est complète.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Objectif">
                <Select value={watch("objective")} onValueChange={(v) => setValue("objective", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashflow">Cashflow max</SelectItem>
                    <SelectItem value="patrimoine">Patrimoine long terme</SelectItem>
                    <SelectItem value="equilibre">Équilibré</SelectItem>
                    <SelectItem value="defisc">Défiscalisation</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Effort de gestion">
                <Select value={watch("effort")} onValueChange={(v) => setValue("effort", v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passif">Passif</SelectItem>
                    <SelectItem value="modere">Modéré</SelectItem>
                    <SelectItem value="actif">Actif</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <div className="sm:col-span-2 text-xs text-muted-foreground -mb-2">
                Activez les hypothèses de location que vous souhaitez tester. Désactivées, elles sont exclues de l'analyse.
              </div>

              <HypothesisBlock
                title="Location nue (vide)"
                description="Loyer mensuel hors charges"
                enabled={enabledHyp.nu}
                onToggle={(v) => {
                  setEnabledHyp((s) => ({ ...s, nu: v }));
                  if (!v) setValue("monthlyNu", undefined as any, { shouldDirty: true });
                }}
              >
                <Field label="Loyer nu (€/mois)">
                  <Input type="number" disabled={!enabledHyp.nu} {...register("monthlyNu")} />
                </Field>
              </HypothesisBlock>

              <HypothesisBlock
                title="Location meublée (LMNP)"
                description="Loyer meublé classique, hors tourisme"
                enabled={enabledHyp.meuble}
                onToggle={(v) => {
                  setEnabledHyp((s) => ({ ...s, meuble: v }));
                  if (!v) setValue("monthlyMeuble", undefined as any, { shouldDirty: true });
                }}
              >
                <Field label="Loyer meublé (€/mois)">
                  <Input type="number" disabled={!enabledHyp.meuble} {...register("monthlyMeuble")} />
                </Field>
              </HypothesisBlock>

              <HypothesisBlock
                title="Colocation"
                description="Loyer par chambre × nombre de chambres louables"
                enabled={enabledHyp.coloc}
                onToggle={(v) => {
                  setEnabledHyp((s) => ({ ...s, coloc: v }));
                  if (!v) {
                    setValue("colocRoomRent", undefined as any, { shouldDirty: true });
                    setValue("colocRoomCount", undefined as any, { shouldDirty: true });
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Loyer par chambre (€/mois)">
                    <Input type="number" disabled={!enabledHyp.coloc} {...register("colocRoomRent")} />
                  </Field>
                  <Field label="Nb chambres louables">
                    <Input type="number" disabled={!enabledHyp.coloc} {...register("colocRoomCount")} />
                  </Field>
                </div>
              </HypothesisBlock>

              <HypothesisBlock
                title="Location courte durée (Airbnb)"
                description="Tarif moyen par nuit et taux d'occupation annuel"
                enabled={enabledHyp.airbnb}
                onToggle={(v) => {
                  setEnabledHyp((s) => ({ ...s, airbnb: v }));
                  if (!v) {
                    setValue("airbnbNightly", undefined as any, { shouldDirty: true });
                    setValue("airbnbOccupancy", undefined as any, { shouldDirty: true });
                  }
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tarif moyen / nuit (€)">
                    <Input type="number" disabled={!enabledHyp.airbnb} {...register("airbnbNightly")} />
                  </Field>
                  <Field label="Taux d'occupation (0-1)">
                    <Input type="number" step="0.05" disabled={!enabledHyp.airbnb} {...register("airbnbOccupancy")} />
                  </Field>
                </div>
              </HypothesisBlock>
              <div className="sm:col-span-2 flex items-center gap-2">
                <Checkbox
                  id="classe"
                  checked={watch("isClasseTourisme")}
                  onCheckedChange={(c) => setValue("isClasseTourisme", !!c)}
                />
                <Label htmlFor="classe" className="cursor-pointer text-sm">
                  Le bien est classé "Meublé de tourisme" (abattement 50%)
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between">
          {step > 1 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
            </Button>
          ) : <div />}
          {step < 3 ? (
            <Button type="button" onClick={next}>
              Suivant <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={() => submitAnalysis()}>
              {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Votre copilote arbitre les stratégies…</> : "Évaluer cette opportunité"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function HypothesisBlock({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`sm:col-span-2 rounded-lg border p-3 transition-colors ${enabled ? "bg-background" : "bg-muted/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} aria-label={`Activer ${title}`} />
      </div>
      {enabled && <div className="mt-3">{children}</div>}
    </div>
  );
}
