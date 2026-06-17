import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection, LegalList } from "@/components/layout/LegalPage";

export const Route = createFileRoute("/cgu")({
  head: () => ({
    meta: [
      { title: "Conditions Générales d'Utilisation — RentIQ" },
      { name: "description", content: "Conditions générales d'utilisation du service RentIQ." },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: CguPage,
});

function CguPage() {
  return (
    <LegalPage title="Conditions Générales d'Utilisation" lastUpdated="[JJ/MM/AAAA]">
      <p className="rounded-lg border border-warning/30 bg-warning-soft/40 p-3 text-xs text-foreground">
        ⚠️ Modèle à faire valider par un juriste avant mise en ligne. Complétez les champs entre crochets [ ].
      </p>

      <LegalSection title="1. Éditeur du service">
        <p>Le service RentIQ (« le Service ») est édité par :</p>
        <LegalList
          items={[
            <>Raison sociale : <strong>[Nom de la société]</strong></>,
            <>Forme juridique et capital : [SAS / SASU / EI…], [capital]</>,
            <>Siège social : [adresse]</>,
            <>SIREN / SIRET : [numéro]</>,
            <>Directeur de la publication : [nom]</>,
            <>Contact : [email]</>,
            <>Hébergement : Cloudflare, Inc. et Supabase / Lovable Cloud.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Objet">
        <p>
          RentIQ est un <strong>outil d'aide à la décision</strong> pour l'investissement immobilier locatif en
          France : analyse d'annonces, suivi de patrimoine, détection d'opportunités, recommandations et copilote
          conversationnel. Les présentes CGU régissent l'accès et l'utilisation du Service.
        </p>
      </LegalSection>

      <LegalSection title="3. Acceptation">
        <p>
          L'utilisation du Service implique l'acceptation pleine et entière des présentes CGU. L'utilisateur déclare
          avoir la capacité juridique de contracter.
        </p>
      </LegalSection>

      <LegalSection title="4. Nature du service — avertissement essentiel">
        <p>
          RentIQ fournit des estimations et indicateurs à caractère <strong>informatif</strong>, basés sur les données
          saisies par l'utilisateur, des données publiques et la réglementation fiscale connue à la date d'édition
          (notamment 2026).
        </p>
        <p>
          <strong>
            RentIQ ne fournit aucun conseil en investissement, conseil financier, fiscal, juridique ou comptable
          </strong>{" "}
          et n'est pas un service de gestion de patrimoine au sens réglementaire. Les résultats (cashflow, rendement,
          score, verdict, prix maximum, recommandations, réponses du copilote) :
        </p>
        <LegalList
          items={[
            <>sont indicatifs et peuvent comporter des erreurs ou approximations ;</>,
            <>ne garantissent aucun résultat d'investissement ;</>,
            <>doivent être validés par des professionnels (expert-comptable, notaire, conseiller en gestion de patrimoine, mairie) avant toute décision.</>,
          ]}
        />
        <p>L'utilisateur reste <strong>seul responsable</strong> de ses décisions d'investissement.</p>
      </LegalSection>

      <LegalSection title="5. Compte utilisateur">
        <LegalList
          items={[
            <>L'inscription requiert une adresse email valide (ou une connexion Google).</>,
            <>L'utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.</>,
            <>Un compte par personne ; informations exactes et à jour.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Offres et abonnements">
        <LegalList
          items={[
            <>Le Service propose une offre gratuite (quota d'analyses mensuel limité) et des offres payantes décrites sur la page de tarification.</>,
            <>Les paiements sont gérés par <strong>Paddle</strong> (Paddle.com Market Limited), agissant en qualité de revendeur (Merchant of Record) : facturation, TVA et reçus sont assurés par Paddle.</>,
            <>Le quota gratuit se réinitialise chaque mois.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Droit de rétractation et résiliation">
        <LegalList
          items={[
            <>Le consommateur dispose d'un délai de rétractation de 14 jours ; en demandant l'accès immédiat au Service numérique, il peut y renoncer dans les conditions prévues par la loi. [À préciser]</>,
            <>L'abonnement est résiliable à tout moment et prend fin à l'échéance de la période en cours, sans remboursement au prorata sauf disposition contraire.</>,
            <>Modalités de remboursement gérées via Paddle : [préciser].</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="8. Utilisation acceptable">
        <p>L'utilisateur s'interdit notamment de :</p>
        <LegalList
          items={[
            <>détourner le Service de sa finalité, le revendre ou le sous-licencier ;</>,
            <>automatiser des requêtes massives, contourner les quotas ou la sécurité ;</>,
            <>importer des contenus illicites ou porter atteinte aux droits de tiers ;</>,
            <>réutiliser les données du Service en violation des droits des sources.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="9. Données de marché et annonces tierces">
        <p>
          Le Service peut afficher ou traiter des données issues de sources publiques et, le cas échéant, des annonces
          fournies par l'utilisateur (URL). RentIQ ne garantit ni l'exactitude, ni l'exhaustivité, ni la disponibilité
          de ces données. L'utilisateur est responsable de la licéité des URL qu'il importe et du respect des conditions
          des sites tiers concernés.
        </p>
      </LegalSection>

      <LegalSection title="10. Propriété intellectuelle">
        <p>
          Le Service, sa marque, son code, ses interfaces et ses contenus sont protégés. Aucune cession de droits n'est
          consentie hors du simple droit d'usage personnel prévu par les présentes. Les données saisies par l'utilisateur
          restent les siennes ; il concède à RentIQ une licence d'usage strictement nécessaire au fonctionnement du
          Service.
        </p>
      </LegalSection>

      <LegalSection title="11. Disponibilité et responsabilité">
        <LegalList
          items={[
            <>Le Service est fourni « en l'état », sans garantie de disponibilité continue.</>,
            <>Dans les limites permises par la loi, la responsabilité de l'éditeur est limitée aux dommages directs et plafonnée au montant payé par l'utilisateur au cours des [12] derniers mois.</>,
            <>L'éditeur n'est pas responsable des pertes financières liées à des décisions d'investissement prises sur la base du Service (cf. article 4).</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="12. Données personnelles">
        <p>
          Le traitement des données personnelles est décrit dans la Politique de confidentialité, qui fait partie
          intégrante des présentes.
        </p>
      </LegalSection>

      <LegalSection title="13. Modification des CGU">
        <p>
          L'éditeur peut modifier les CGU. Les utilisateurs sont informés des changements substantiels ; la poursuite de
          l'utilisation vaut acceptation.
        </p>
      </LegalSection>

      <LegalSection title="14. Droit applicable et litiges">
        <p>
          Les présentes sont soumises au <strong>droit français</strong>. À défaut de résolution amiable, et pour les
          consommateurs, recours possible à un médiateur de la consommation : [nom/coordonnées]. Compétence des
          tribunaux français.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
