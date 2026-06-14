/**
 * RentIQ — Server functions du conseiller patrimonial IA (V5).
 *
 * Chaque message construit un contexte à partir des données RÉELLES du
 * portefeuille (buildPortfolioContext), produit une réponse chiffrée
 * déterministe (answerDeterministic), puis — si une clé IA est disponible —
 * demande au LLM de reformuler en s'appuyant STRICTEMENT sur ces faits.
 * Sans clé, la réponse déterministe est renvoyée telle quelle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildPortfolioContext,
  detectIntent,
  answerDeterministic,
  type AssistantContext,
} from "./assistant";
import { projectCashflow, type PortfolioProperty } from "./portfolio";
import type { StrategyKey } from "./calculator";

function rowToPortfolioProperty(row: any): PortfolioProperty {
  const hasLoan = Number(row.loan_amount) > 0 && row.loan_start_date;
  return {
    id: row.id,
    label: row.label,
    cityName: row.city_name,
    propertyType: row.property_type,
    strategy: (row.strategy ?? null) as StrategyKey | null,
    purchasePrice: Number(row.purchase_price),
    capitalInvested: row.capital_invested == null ? null : Number(row.capital_invested),
    purchaseDate: row.purchase_date,
    currentValue: Number(row.current_value),
    monthlyRentGross: Number(row.monthly_rent_gross),
    monthlyCashflowNet: Number(row.monthly_cashflow_net),
    loan: hasLoan
      ? {
          principal: Number(row.loan_amount),
          rateAPR: Number(row.loan_rate ?? 0.035),
          durationYears: Number(row.loan_years ?? 20),
          startDate: row.loan_start_date,
        }
      : null,
    status: row.status,
  };
}

// -------------------- Conversations --------------------
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("assistant_conversations")
      .select("id, title, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("assistant_conversations")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Création échouée");
    return { id: data.id as string };
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: conv, error } = await supabase
      .from("assistant_conversations")
      .select("id, title")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error || !conv) throw new Error("Conversation introuvable");
    const { data: messages } = await supabase
      .from("assistant_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", data.id)
      .order("created_at", { ascending: true });
    return { conversation: conv, messages: messages ?? [] };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("assistant_conversations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Envoi de message --------------------
export const sendAssistantMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid(), message: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Charger le portefeuille réel.
    const { data: rows } = await supabase
      .from("properties")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "owned");
    const properties = (rows ?? []).map(rowToPortfolioProperty);
    const ctx = buildPortfolioContext(properties);
    const intent = detectIntent(data.message);

    // Projection si l'intention l'exige.
    let projection: { years: number; annual: number } | undefined;
    const yearsMatch = data.message.match(/(\d+)\s*an/);
    if (intent === "projection") {
      const years = yearsMatch ? Math.min(40, Math.max(1, parseInt(yearsMatch[1], 10))) : 5;
      projection = { years, annual: projectCashflow(properties, years) };
    }

    const deterministic = answerDeterministic(intent, ctx, projection);

    // 2. Historique récent de la conversation.
    const { data: history } = await supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(12);

    // 3. Enregistrer le message utilisateur.
    await supabase.from("assistant_messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "user",
      content: data.message,
    });

    // 4. Réponse : LLM (reformule les faits) ou repli déterministe.
    const answer = await composeAnswer({
      ctx,
      intent,
      deterministic,
      history: history ?? [],
      question: data.message,
    });

    await supabase.from("assistant_messages").insert({
      conversation_id: data.conversationId,
      user_id: userId,
      role: "assistant",
      content: answer,
      context: { intent, factSheet: ctx.factSheet } as any,
    });

    // 5. Titre auto sur le premier échange.
    if (!history || history.length === 0) {
      const title = data.message.length > 60 ? data.message.slice(0, 57) + "…" : data.message;
      await supabase
        .from("assistant_conversations")
        .update({ title })
        .eq("id", data.conversationId)
        .eq("user_id", userId);
    } else {
      await supabase
        .from("assistant_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", data.conversationId);
    }

    return { answer, intent, grounded: ctx.factSheet };
  });

async function composeAnswer(args: {
  ctx: AssistantContext;
  intent: string;
  deterministic: string;
  history: Array<{ role: string; content: string }>;
  question: string;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return args.deterministic;

  try {
    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const system = `Tu es le conseiller patrimonial IA de RentIQ. Tu réponds en français, de façon concise, factuelle et bienveillante.
RÈGLE ABSOLUE : tu ne calcules JAMAIS et tu n'inventes JAMAIS de chiffre. Tu t'appuies EXCLUSIVEMENT sur la fiche de données ci-dessous et sur la réponse déterministe fournie. Si une information manque, dis-le et invite l'utilisateur à compléter son portefeuille. Termine toujours par un rappel que ce n'est pas un conseil en investissement.

=== FICHE DE DONNÉES DU PORTEFEUILLE (source de vérité) ===
${args.ctx.factSheet}

=== RÉPONSE DÉTERMINISTE PRÉ-CALCULÉE (à reformuler, sans en changer les chiffres) ===
${args.deterministic}`;

    const messages = [
      ...args.history.slice(-8).map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user" as const, content: args.question },
    ];

    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      messages,
      maxOutputTokens: 600,
    });
    return text?.trim() || args.deterministic;
  } catch (e) {
    console.error("Assistant LLM failed, using deterministic answer", e);
    return args.deterministic;
  }
}
