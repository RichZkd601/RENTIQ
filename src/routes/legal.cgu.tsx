import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import cguMarkdown from "@/content/legal/cgu.md?raw";

export const Route = createFileRoute("/legal/cgu")({
  head: () => ({
    meta: [
      { title: "CGU — RentIQ" },
      {
        name: "description",
        content:
          "Conditions générales d'utilisation du service RentIQ : objet, compte, abonnements, responsabilité, droit applicable.",
      },
    ],
  }),
  component: CguPage,
});

function CguPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20">
        <ReactMarkdown>{cguMarkdown}</ReactMarkdown>
      </article>
    </div>
  );
}
