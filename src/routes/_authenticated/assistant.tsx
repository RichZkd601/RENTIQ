import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Send, User } from "lucide-react";
import { toast } from "sonner";
import {
  listConversations,
  createConversation,
  getConversation,
  sendAssistantMessage,
} from "@/lib/assistant.functions";

type Msg = { id?: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Puis-je financer un actif supplémentaire ?",
  "Quel sera mon cashflow dans 5 ans ?",
  "Quel actif sous-performe mon portefeuille ?",
  "Dois-je arbitrer un actif de mon portefeuille ?",
  "Quel régime fiscal optimise mon patrimoine ?",
];

export const Route = createFileRoute("/_authenticated/assistant")({
  head: () => ({ meta: [{ title: "Copilote patrimonial — RentIQ" }] }),
  component: AssistantPage,
});

function AssistantPage() {
  const listConv = useServerFn(listConversations);
  const createConv = useServerFn(createConversation);
  const getConv = useServerFn(getConversation);
  const send = useServerFn(sendAssistantMessage);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const convs = await listConv({});
        if (convs.length > 0) {
          setConversationId(convs[0].id);
          const { messages } = await getConv({ data: { id: convs[0].id } });
          setMessages(messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
        } else {
          const { id } = await createConv({});
          setConversationId(id);
        }
      } catch {
        /* l'utilisateur verra l'écran vide */
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const submit = async (text: string) => {
    if (!text.trim() || !conversationId || sending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const { answer } = await send({ data: { conversationId, message: text } });
      setMessages((m) => [...m, { role: "assistant", content: answer }]);
    } catch (e: any) {
      toast.error(e?.message ?? "Échec de l'envoi");
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Désolé, une erreur est survenue. Réessayez." },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100svh-3.5rem-1px)] max-w-3xl flex-col px-4 py-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Sparkles className="h-6 w-6 text-primary" />
          Copilote patrimonial
        </h1>
        <p className="text-sm text-muted-foreground">
          Un copilote entraîné sur votre patrimoine, vos opportunités et le marché.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4"
      >
        {booting ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Posez-moi une question, ou commencez par :
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={m.id ?? i}
              className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "assistant" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border"}`}
              >
                {m.content}
              </div>
              {m.role === "user" && (
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))
        )}
        {sending && (
          <div className="flex gap-2">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="rounded-2xl border bg-background px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Demandez un arbitrage, une simulation, une explication…"
          disabled={sending || booting}
        />
        <Button type="submit" disabled={sending || booting || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Estimations indicatives — ne constitue pas un conseil en investissement.
      </p>
    </div>
  );
}
