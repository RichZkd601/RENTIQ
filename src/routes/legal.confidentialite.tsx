import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import policyMarkdown from "@/content/legal/confidentialite.md?raw";

export const Route = createFileRoute("/legal/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — RentIQ" },
      {
        name: "description",
        content:
          "Politique de confidentialité RentIQ (RGPD) : données traitées, finalités, sous-traitants, droits des utilisateurs.",
      },
    ],
  }),
  component: PolicyPage,
});

function PolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-20">
        <ReactMarkdown>{policyMarkdown}</ReactMarkdown>
      </article>
    </div>
  );
}
