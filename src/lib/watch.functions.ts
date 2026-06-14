/**
 * RentIQ — Server functions de la veille réglementaire (V2/V4).
 *
 * Croise le référentiel `regulatory_alerts` avec les villes & stratégies des
 * biens détenus et des profils investisseur de l'utilisateur, pour ne remonter
 * que ce qui le concerne — « La réglementation Airbnb à Bordeaux vient d'évoluer.
 * Votre bien pourrait être impacté. »
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRegulatoryAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Périmètre utilisateur : villes + stratégies suivies.
    const [{ data: props }, { data: profiles }] = await Promise.all([
      supabase.from("properties").select("id, label, city_name, strategy").eq("user_id", userId),
      supabase.from("investor_profiles").select("city_name, strategy").eq("user_id", userId),
    ]);

    const cities = new Set<string>();
    for (const p of props ?? []) if (p.city_name) cities.add(p.city_name.toLowerCase());
    for (const p of profiles ?? []) if (p.city_name) cities.add(p.city_name.toLowerCase());

    const { data: alerts, error } = await supabase
      .from("regulatory_alerts")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const { data: reads } = await supabase
      .from("regulatory_alert_reads")
      .select("alert_id, status")
      .eq("user_id", userId);
    const readMap = new Map((reads ?? []).map((r: any) => [r.alert_id, r.status]));

    const relevant = (alerts ?? [])
      .filter((a: any) => {
        if (readMap.get(a.id) === "dismissed") return false;
        // National (city_name null) ou ville suivie par l'utilisateur.
        return a.city_name == null || cities.has(String(a.city_name).toLowerCase());
      })
      .map((a: any) => {
        const impacted = (props ?? []).filter(
          (p: any) =>
            (a.city_name == null ||
              p.city_name?.toLowerCase() === String(a.city_name).toLowerCase()) &&
            (a.strategy == null || p.strategy === a.strategy),
        );
        return {
          id: a.id,
          cityName: a.city_name as string | null,
          strategy: a.strategy as string | null,
          severity: a.severity as string,
          title: a.title as string,
          body: a.body as string,
          sourceUrl: a.source_url as string | null,
          effectiveDate: a.effective_date as string | null,
          publishedAt: a.published_at as string,
          read: readMap.get(a.id) === "read",
          impactedProperties: impacted.map((p: any) => ({ id: p.id, label: p.label })),
        };
      });

    return relevant;
  });

export const setAlertStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ alertId: z.string().uuid(), status: z.enum(["read", "dismissed"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("regulatory_alert_reads").upsert(
      {
        alert_id: data.alertId,
        user_id: userId,
        status: data.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "alert_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
