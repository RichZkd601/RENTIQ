import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Sparkles } from "lucide-react";
import { createProperty, prefillFromAnalysis } from "@/lib/portfolio.functions";
import { getCityData } from "@/lib/analysis.functions";
import { getMarketSnapshot } from "@/lib/market.functions";

const reqNum = (min = 0) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().min(min));
const optNum = z.preprocess(
  (v) => (v === "" || v == null ? undefined : Number(v)),
  z.number().min(0).optional(),
);

const FormSchema = z.object({
  label: z.string().min(1, "Nom requis"),
  cityName: z.string().min(1, "Ville requise"),
  postalCode: z
    .string()
    .regex(/^\d{5}$/, "5 chiffres")
    .optional()
    .or(z.literal("")),
  propertyType: z.enum(["studio", "t2", "t3", "t4_plus", "maison"]),
  surfaceM2: reqNum(8),
  rooms: reqNum(1),
  exterior: z.enum(["aucun", "balcon", "terrasse", "rez_jardin"]).default("aucun"),
  strategy: z
    .enum([
      "location_nue",
      "lmnp_longue_duree",
      "bail_mobilite",
      "colocation",
      "coliving",
      "airbnb",
    ])
    .optional(),
  status: z.enum(["owned", "prospect", "sold", "primary_residence"]),
  purchasePrice: reqNum(10_000),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date requise"),
  currentValue: reqNum(10_000),
  worksBudget: reqNum(0),
  furnitureBudget: reqNum(0),
  loanAmount: reqNum(0),
  // Taux saisi en POURCENT (ex. "3.5" = 3,5 %). Converti en décimal au submit.
  loanRatePct: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(v)),
    z.number().min(0).max(20),
  ),
  loanYears: reqNum(1),
  propertyTax: reqNum(0),
  copro: reqNum(0),
  tmi: z.coerce.number(),
  monthlyNu: optNum,
  monthlyMeuble: optNum,
  colocRoomRent: optNum,
  colocRoomCount: optNum,
  airbnbNightly: optNum,
  airbnbOccupancy: optNum,
});
type FormValues = z.input<typeof FormSchema>;

export const Route = createFileRoute("/_authenticated/patrimoine/nouveau")({
  validateSearch: (s: Record<string, unknown>): { fromAnalysis?: string } =>
    typeof s.fromAnalysis === "string" ? { fromAnalysis: s.fromAnalysis } : {},
  head: () => ({ meta: [{ title: "Ajouter un actif — RentIQ" }] }),
  component: NouveauBienPage,
});

function NouveauBienPage() {
  const navigate = useNavigate();
  const create = useServerFn(createProperty);
  const prefill = useServerFn(prefillFromAnalysis);
  const fetchCityData = useServerFn(getCityData);
  const fetchSnapshot = useServerFn(getMarketSnapshot);
  const { fromAnalysis } = Route.useSearch();
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      label: "",
      cityName: "",
      postalCode: "",
      propertyType: "t2",
      surfaceM2: "",
      rooms: "",
      exterior: "aucun",
      strategy: "lmnp_longue_duree",
      status: "owned",
      purchasePrice: "",
      purchaseDate: today,
      currentValue: "",
      worksBudget: "0",
      furnitureBudget: "0",
      loanAmount: "0",
      loanRatePct: "3.5",
      loanYears: "20",
      propertyTax: "0",
      copro: "0",
      tmi: "0.3",
      monthlyNu: "",
      monthlyMeuble: "",
      colocRoomRent: "",
      colocRoomCount: "",
      airbnbNightly: "",
      airbnbOccupancy: "",
    } as any,
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const strategy = watch("strategy");
  const status = watch("status");
  const isRP = status === "primary_residence";
  const watchedCity = watch("cityName");
  const watchedPostal = watch("postalCode");
  const watchedSurface = Number(watch("surfaceM2")) || 0;

  // Données de marché pour suggérer le prix au m² (ville enregistrée OU code postal)
  const { data: cityData } = useQuery({
    queryKey: ["pf-cityData", watchedCity?.toLowerCase().trim()],
    queryFn: () => fetchCityData({ data: { cityName: watchedCity } }),
    enabled: !!watchedCity && watchedCity.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
  const { data: snapshot } = useQuery({
    queryKey: ["pf-snapshot", watchedPostal],
    queryFn: () => fetchSnapshot({ data: { postalCode: watchedPostal! } }),
    enabled: !!watchedPostal && /^\d{5}$/.test(watchedPostal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  // Prix au m² suggéré : city_data > snapshot > null
  const pricePerSqm =
    cityData?.priceSqmAvg ??
    (snapshot as any)?.priceSqmAvg ??
    null;
  const suggestedValue =
    pricePerSqm && watchedSurface > 0 ? Math.round(pricePerSqm * watchedSurface) : null;

  // La valeur actuelle s'estime seule (CP × prix au m² × surface) tant que
  // l'utilisateur ne l'a pas saisie/modifiée manuellement.
  const currentValueTouched = useRef(false);
  useEffect(() => {
    if (suggestedValue && !currentValueTouched.current) {
      setValue("currentValue", String(suggestedValue) as any, { shouldValidate: true });
    }
  }, [suggestedValue, setValue]);

  useEffect(() => {
    if (!fromAnalysis) return;
    prefill({ data: { analysisId: fromAnalysis } })
      .then((d: any) => {
        const map: Record<string, any> = {
          label: d.label,
          cityName: d.cityName,
          postalCode: d.postalCode ?? "",
          propertyType: d.propertyType ?? "t2",
          surfaceM2: d.surfaceM2,
          rooms: d.rooms,
          strategy: d.strategy,
          purchasePrice: d.purchasePrice,
          currentValue: d.currentValue,
          worksBudget: d.worksBudget,
          furnitureBudget: d.furnitureBudget,
          loanAmount: d.loanAmount,
          loanRatePct: d.loanRate ? +(d.loanRate * 100).toFixed(2) : 3.5,
          loanYears: d.loanYears,
          tmi: String(d.tmi),
          monthlyNu: d.monthlyNu ?? "",
          monthlyMeuble: d.monthlyMeuble ?? "",
          colocRoomRent: d.colocRoomRent ?? "",
          colocRoomCount: d.colocRoomCount ?? "",
          airbnbNightly: d.airbnbNightly ?? "",
          airbnbOccupancy: d.airbnbOccupancy ?? "",
        };
        for (const [k, v] of Object.entries(map)) setValue(k as any, v);
        currentValueTouched.current = true; // valeur issue de l'analyse : ne pas écraser
        toast.success("Pré-rempli depuis votre analyse");
      })
      .catch(() => toast.error("Analyse introuvable"));
  }, [fromAnalysis]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const v = FormSchema.parse(values);
      const payload: any = {
        ...v,
        postalCode: v.postalCode || undefined,
        // Conversion % -> décimal pour le backend
        loanRate: Number((v.loanRatePct / 100).toFixed(4)),
      };
      delete payload.loanRatePct;
      if (v.status === "primary_residence") {
        payload.strategy = undefined;
      }
      const { id } = await create({ data: payload });
      toast.success(
        v.status === "primary_residence"
          ? "Résidence principale ajoutée à votre portefeuille"
          : "Actif intégré à votre portefeuille",
      );
      navigate({ to: "/patrimoine/$id", params: { id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Ajouter un actif à votre portefeuille</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Quelques informations suffisent : RentIQ recalcule en continu la performance de votre patrimoine.
        Vous pouvez aussi suivre votre <strong>résidence principale</strong> (hors performance locative).
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Section title="Identité du bien">
          <Field label="Nom" error={errors.label?.message}>
            <Input placeholder="T2 Rennes centre / Maison familiale" {...register("label")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ville" error={errors.cityName?.message}>
              <Input placeholder="Rennes" {...register("cityName")} />
            </Field>
            <Field label="Code postal">
              <Input placeholder="35000" {...register("postalCode")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <SelectField
                value={watch("propertyType")}
                onChange={(v) => setValue("propertyType", v as any)}
                options={[
                  ["studio", "Studio"],
                  ["t2", "T2"],
                  ["t3", "T3"],
                  ["t4_plus", "T4+"],
                  ["maison", "Maison"],
                ]}
              />
            </Field>
            <Field label="Statut">
              <SelectField
                value={watch("status")}
                onChange={(v) => setValue("status", v as any)}
                options={[
                  ["owned", "Locatif détenu"],
                  ["primary_residence", "Résidence principale"],
                  ["prospect", "Prospect / à l'étude"],
                  ["sold", "Vendu"],
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Surface (m²)" error={errors.surfaceM2?.message as string}>
              <Input type="number" {...register("surfaceM2")} />
            </Field>
            <Field label="Pièces" error={errors.rooms?.message as string}>
              <Input type="number" {...register("rooms")} />
            </Field>
            <Field label="Extérieur">
              <SelectField
                value={watch("exterior") ?? "aucun"}
                onChange={(v) => setValue("exterior", v as any)}
                options={[
                  ["aucun", "Aucun"],
                  ["balcon", "Balcon"],
                  ["terrasse", "Terrasse"],
                  ["rez_jardin", "Rez-de-jardin"],
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section title="Acquisition & valeur">
          {pricePerSqm && watchedSurface > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 flex-none text-primary" />
              <span className="flex-1">
                Valeur actuelle estimée à <strong>{watchedCity || "cette localisation"}</strong> :{" "}
                <strong>{Math.round(pricePerSqm).toLocaleString("fr-FR")} €/m²</strong> × {watchedSurface} m² ≈{" "}
                <strong>{suggestedValue!.toLocaleString("fr-FR")} €</strong>
                {currentValueTouched.current && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-primary"
                      onClick={() => {
                        currentValueTouched.current = false;
                        setValue("currentValue", String(suggestedValue) as any, { shouldValidate: true });
                        toast.success("Valeur actuelle ré-estimée");
                      }}
                    >
                      ré-estimer
                    </button>
                  </>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => {
                  setValue("purchasePrice", String(suggestedValue) as any, { shouldDirty: true });
                  toast.success("Prix d'achat rempli avec l'estimation marché");
                }}
              >
                Utiliser comme prix d'achat
              </Button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix d'achat (€)" error={errors.purchasePrice?.message as string}>
              <Input type="number" {...register("purchasePrice")} />
            </Field>
            <Field label="Date d'achat" error={errors.purchaseDate?.message}>
              <Input type="date" {...register("purchaseDate")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Valeur actuelle (€)"
              error={errors.currentValue?.message as string}
              hint={
                suggestedValue && !currentValueTouched.current
                  ? "Estimée automatiquement depuis le prix au m² — modifiable"
                  : undefined
              }
            >
              {(() => {
                const cv = register("currentValue");
                return (
                  <Input
                    type="number"
                    placeholder={suggestedValue ? String(suggestedValue) : "Valeur estimée du bien"}
                    {...cv}
                    onChange={(e) => {
                      currentValueTouched.current = true;
                      cv.onChange(e);
                    }}
                  />
                );
              })()}
            </Field>
            {!isRP && (
              <Field label="Stratégie">
                <SelectField
                  value={strategy ?? "lmnp_longue_duree"}
                  onChange={(v) => setValue("strategy", v as any)}
                  options={[
                    ["location_nue", "Location nue"],
                    ["lmnp_longue_duree", "LMNP meublé"],
                    ["bail_mobilite", "Bail mobilité"],
                    ["colocation", "Colocation"],
                    ["coliving", "Coliving"],
                    ["airbnb", "Airbnb"],
                  ]}
                />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Travaux (€)">
              <Input type="number" {...register("worksBudget")} />
            </Field>
            {!isRP && (
              <Field label="Mobilier (€)">
                <Input type="number" {...register("furnitureBudget")} />
              </Field>
            )}
          </div>
        </Section>

        <Section title="Financement">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Capital emprunté (€)">
              <Input type="number" {...register("loanAmount")} />
            </Field>
            <Field label="Taux (%)" error={errors.loanRatePct?.message as string}>
              <Input type="number" step="0.05" {...register("loanRatePct")} />
            </Field>
            <Field label="Durée (ans)">
              <Input type="number" {...register("loanYears")} />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Saisir le taux annuel hors assurance (ex. <strong>3,5</strong> pour 3,5 %).
          </p>
        </Section>

        {!isRP && (
          <Section title="Charges & fiscalité">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Taxe foncière (€/an)">
                <Input type="number" {...register("propertyTax")} />
              </Field>
              <Field label="Charges copro (€/an)">
                <Input type="number" {...register("copro")} />
              </Field>
              <Field label="TMI">
                <SelectField
                  value={String(watch("tmi"))}
                  onChange={(v) => setValue("tmi", v as any)}
                  options={[
                    ["0", "0 %"],
                    ["0.11", "11 %"],
                    ["0.3", "30 %"],
                    ["0.41", "41 %"],
                    ["0.45", "45 %"],
                  ]}
                />
              </Field>
            </div>
          </Section>
        )}

        {!isRP && (
          <Section title="Loyers de marché (selon la stratégie)">
            <p className="text-xs text-muted-foreground">
              Renseignez au moins le loyer correspondant à votre stratégie pour un calcul fiable.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {strategy === "location_nue" && (
                <Field label="Loyer nu (€/mois)">
                  <Input type="number" {...register("monthlyNu")} />
                </Field>
              )}
              {(strategy === "lmnp_longue_duree" || strategy === "bail_mobilite") && (
                <Field label="Loyer meublé (€/mois)">
                  <Input type="number" {...register("monthlyMeuble")} />
                </Field>
              )}
              {(strategy === "colocation" || strategy === "coliving") && (
                <>
                  <Field label="Loyer / chambre (€/mois)">
                    <Input type="number" {...register("colocRoomRent")} />
                  </Field>
                  <Field label="Nb chambres">
                    <Input type="number" {...register("colocRoomCount")} />
                  </Field>
                </>
              )}
              {strategy === "airbnb" && (
                <>
                  <Field label="Prix / nuit (€)">
                    <Input type="number" {...register("airbnbNightly")} />
                  </Field>
                  <Field label="Occupation (0-1)">
                    <Input type="number" step="0.05" {...register("airbnbOccupancy")} />
                  </Field>
                </>
              )}
            </div>
          </Section>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/patrimoine" })}>
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Intégrer cet actif au portefeuille
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
