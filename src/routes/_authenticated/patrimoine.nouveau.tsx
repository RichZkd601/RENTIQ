import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Loader2, Save } from "lucide-react";
import { createProperty, prefillFromAnalysis } from "@/lib/portfolio.functions";

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
  strategy: z.enum([
    "location_nue",
    "lmnp_longue_duree",
    "bail_mobilite",
    "colocation",
    "coliving",
    "airbnb",
  ]),
  status: z.enum(["owned", "prospect", "sold"]),
  purchasePrice: reqNum(10_000),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date requise"),
  currentValue: reqNum(10_000),
  worksBudget: reqNum(0),
  furnitureBudget: reqNum(0),
  loanAmount: reqNum(0),
  loanRate: z.preprocess((v) => Number(v), z.number().min(0).max(0.2)),
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
  head: () => ({ meta: [{ title: "Ajouter un bien — RentIQ" }] }),
  component: NouveauBienPage,
});

function NouveauBienPage() {
  const navigate = useNavigate();
  const create = useServerFn(createProperty);
  const prefill = useServerFn(prefillFromAnalysis);
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
      strategy: "lmnp_longue_duree",
      status: "owned",
      purchasePrice: "",
      purchaseDate: today,
      currentValue: "",
      worksBudget: "0",
      furnitureBudget: "0",
      loanAmount: "0",
      loanRate: "0.035",
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
          loanRate: d.loanRate,
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
        toast.success("Pré-rempli depuis votre analyse");
      })
      .catch(() => toast.error("Analyse introuvable"));
  }, [fromAnalysis]);

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const v = FormSchema.parse(values);
      const { id } = await create({ data: { ...v, postalCode: v.postalCode || undefined } as any });
      toast.success("Bien ajouté à votre patrimoine");
      navigate({ to: "/patrimoine/$id", params: { id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Ajouter un bien</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        RentIQ recalcule le cashflow et le rendement avec son moteur déterministe.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Section title="Identité du bien">
          <Field label="Nom" error={errors.label?.message}>
            <Input placeholder="T2 Rennes centre" {...register("label")} />
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
                  ["owned", "Détenu"],
                  ["prospect", "Prospect"],
                  ["sold", "Vendu"],
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Surface (m²)" error={errors.surfaceM2?.message as string}>
              <Input type="number" {...register("surfaceM2")} />
            </Field>
            <Field label="Pièces" error={errors.rooms?.message as string}>
              <Input type="number" {...register("rooms")} />
            </Field>
          </div>
        </Section>

        <Section title="Acquisition & valeur">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix d'achat (€)" error={errors.purchasePrice?.message as string}>
              <Input type="number" {...register("purchasePrice")} />
            </Field>
            <Field label="Date d'achat" error={errors.purchaseDate?.message}>
              <Input type="date" {...register("purchaseDate")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valeur actuelle (€)" error={errors.currentValue?.message as string}>
              <Input type="number" {...register("currentValue")} />
            </Field>
            <Field label="Stratégie">
              <SelectField
                value={strategy}
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Travaux (€)">
              <Input type="number" {...register("worksBudget")} />
            </Field>
            <Field label="Mobilier (€)">
              <Input type="number" {...register("furnitureBudget")} />
            </Field>
          </div>
        </Section>

        <Section title="Financement">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Capital emprunté (€)">
              <Input type="number" {...register("loanAmount")} />
            </Field>
            <Field label="Taux (ex 0.035)">
              <Input type="number" step="0.001" {...register("loanRate")} />
            </Field>
            <Field label="Durée (ans)">
              <Input type="number" {...register("loanYears")} />
            </Field>
          </div>
        </Section>

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
            Enregistrer
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
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-rose-600">{error}</p>}
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
