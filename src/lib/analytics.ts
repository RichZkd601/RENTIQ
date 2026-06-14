// Suivi d'événements produit — minimal, fire-and-forget.
// Jamais bloquant : si l'insertion échoue, on log en console et on continue.
import { supabase } from "@/integrations/supabase/client";

export type EventName =
  | "signup"
  | "signin"
  | "analysis_created"
  | "verdict_viewed"
  | "paywall_clicked"
  | "pdf_downloaded"
  | "checkout_started";

export function track(event: EventName, properties: Record<string, unknown> = {}): void {
  // Best-effort, non bloquant. user_id récupéré côté client si dispo.
  supabase.auth.getUser().then(({ data }) => {
    supabase
      .from("analytics_events")
      .insert({
        event_name: event,
        properties: properties as never,
        user_id: data.user?.id ?? null,
      })
      .then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.warn("[analytics] insert failed", event, error.message);
        }
      });
  });
}
