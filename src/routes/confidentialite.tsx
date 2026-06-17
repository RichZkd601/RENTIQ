import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection, LegalList } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — RentIQ" },
      { name: "description", content: "Politique de confidentialité et traitement des données (RGPD) de RentIQ." },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: ConfidentialitePage,
});

function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" lastUpdated="[JJ/MM/AAAA]">
      <p className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-xs text-foreground">
        ⚠️ Modèle RGPD à faire valider par un juriste / DPO. Complétez les champs [ ] et vérifiez la liste réelle des
        sous-traitants.
      </p>

      <LegalSection title="1. Responsable du traitement">
        <p>
          [Nom de la société], [adresse], contact : [email]. Délégué à la protection des données (DPO), le cas échéant :
          [email DPO].
        </p>
      </LegalSection>

      <LegalSection title="2. Données que nous traitons">
        <LegalList
          items={[
            <><strong>Identité / compte</strong> : email, nom, identifiant, plan d'abonnement (source : utilisateur / Google OAuth).</>,
            <><strong>Données d'investissement</strong> : biens, prix, loyers, financement, valorisations, profils investisseur, analyses (source : utilisateur).</>,
            <><strong>Échanges avec le copilote IA</strong> : messages et contexte patrimonial utilisé.</>,
            <><strong>Usage</strong> : événements (analyse créée, PDF téléchargé, clic paywall) et logs techniques.</>,
            <><strong>Paiement</strong> : identifiants d'abonnement / transaction Paddle. Nous ne stockons pas les numéros de carte.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Finalités et bases légales">
        <LegalList
          items={[
            <>Fournir le Service (analyses, cockpit, radar, recommandations, copilote) — exécution du contrat (art. 6.1.b).</>,
            <>Gérer l'abonnement et la facturation — exécution du contrat / obligation légale.</>,
            <>Améliorer le produit, statistiques d'usage — intérêt légitime (art. 6.1.f).</>,
            <>Veille réglementaire et notifications — exécution du contrat / intérêt légitime.</>,
            <>Sécurité, prévention de la fraude — intérêt légitime.</>,
            <>Communications marketing, le cas échéant — consentement (art. 6.1.a).</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Traitement par l'IA">
        <p>
          Pour répondre à vos questions, le copilote et l'arbitre d'analyse transmettent à un fournisseur de modèle
          ([Lovable AI Gateway / fournisseur sous-jacent]) une synthèse de vos données de portefeuille strictement
          nécessaire à la réponse. Aucune décision produisant des effets juridiques n'est prise de manière
          automatisée ; les résultats sont indicatifs et restent sous votre contrôle. [Vérifier les engagements de
          non-réutilisation / non-entraînement du fournisseur.]
        </p>
      </LegalSection>

      <LegalSection title="5. Sous-traitants et destinataires">
        <p>Vos données peuvent être traitées par nos sous-traitants techniques, uniquement pour les finalités ci-dessus :</p>
        <LegalList
          items={[
            <>Supabase / Lovable Cloud — hébergement base de données et authentification ;</>,
            <>Cloudflare — hébergement applicatif / CDN ;</>,
            <>Paddle — paiement (Merchant of Record) ;</>,
            <>[Lovable AI Gateway / fournisseur IA] — génération de réponses ;</>,
            <>Firecrawl — extraction des pages d'annonces que vous fournissez (si activé) ;</>,
            <>[Outil d'emailing / analytics éventuel].</>,
          ]}
        />
        <p>Nous ne <strong>vendons pas</strong> vos données.</p>
      </LegalSection>

      <LegalSection title="6. Transferts hors UE">
        <p>
          Certains sous-traitants peuvent traiter des données hors de l'Union européenne. Dans ce cas, les transferts
          sont encadrés par des clauses contractuelles types de la Commission européenne ou un mécanisme équivalent.
          [Vérifier la localisation réelle de chaque sous-traitant.]
        </p>
      </LegalSection>

      <LegalSection title="7. Durées de conservation">
        <LegalList
          items={[
            <>Compte et données d'investissement : pendant la durée du compte, puis [ex. 12 mois] après suppression, sauf obligation légale.</>,
            <>Données de facturation : durée légale de conservation comptable ([10 ans]).</>,
            <>Logs techniques : [ex. 12 mois].</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Vos droits">
        <p>
          Vous disposez des droits d'accès, rectification, effacement, limitation, opposition, portabilité, et du droit
          de définir des directives post-mortem. Pour les exercer : [email]. Vous pouvez retirer votre consentement à
          tout moment (sans effet rétroactif) et introduire une réclamation auprès de la <strong>CNIL</strong>{" "}
          (www.cnil.fr).
        </p>
      </LegalSection>

      <LegalSection title="9. Sécurité">
        <p>
          Les données sont protégées par le chiffrement en transit (HTTPS), un cloisonnement par utilisateur au niveau
          base de données (Row Level Security), et un accès aux clés sensibles limité au serveur. En cas de violation de
          données, nous appliquons les obligations de notification prévues par le RGPD.
        </p>
      </LegalSection>

      <LegalSection title="10. Cookies / stockage local">
        <p>
          L'application utilise le stockage local du navigateur pour la session d'authentification (strictement
          nécessaire). Si des outils de mesure d'audience ou marketing sont ajoutés, un bandeau de consentement sera mis
          en place. [À compléter selon les outils réellement utilisés.]
        </p>
      </LegalSection>

      <LegalSection title="11. Mineurs">
        <p>Le Service n'est pas destiné aux personnes de moins de [16/18] ans.</p>
      </LegalSection>

      <LegalSection title="12. Modifications">
        <p>
          Cette politique peut évoluer ; la date de mise à jour en tête de document fait foi. Les changements
          substantiels vous seront notifiés.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
