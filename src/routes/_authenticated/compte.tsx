import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, LogOut, ExternalLink, Trash2, CreditCard, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { getPaddleEnvironment } from "@/lib/paddle";
import { createCustomerPortalSession, cancelMySubscription } from "@/lib/billing.functions";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/compte")({
  head: () => ({
    meta: [
      { title: "Mon compte — RentIQ" },
      { name: "description", content: "Gérez votre compte, votre abonnement et la sécurité de votre espace RentIQ." },
    ],
  }),
  component: ComptePage,
});

function ComptePage() {
  const router = useRouter();
  const { subscription, isActive, isLoading } = useSubscription();
  const openPortal = useServerFn(createCustomerPortalSession);
  const cancelSub = useServerFn(cancelMySubscription);
  const deleteAccount = useServerFn(deleteMyAccount);

  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setFullName((data.user?.user_metadata?.full_name as string) ?? "");
      setCreatedAt(data.user?.created_at ?? null);
    });
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/" });
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await openPortal({ data: { environment: getPaddleEnvironment() } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message ?? "Impossible d'ouvrir le portail client.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelSub({ data: { environment: getPaddleEnvironment() } });
      toast.success(
        "Annulation enregistrée. Votre accès reste actif jusqu'à la fin de la période en cours.",
      );
      setCancelOpen(false);
      // Le webhook Paddle met à jour la table — on rafraîchit la vue.
      setTimeout(() => router.invalidate(), 1500);
    } catch (e: any) {
      toast.error(e?.message ?? "Annulation impossible.");
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== "SUPPRIMER") {
      toast.error("Tapez SUPPRIMER pour confirmer.");
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount({});
      await supabase.auth.signOut();
      toast.success("Votre compte a été supprimé.");
      router.navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e?.message ?? "Suppression impossible.");
      setDeleting(false);
    }
  };

  const planLabel = isActive ? "Pro" : "Free";


  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Mon compte</h1>
        <p className="text-sm text-muted-foreground">
          Vos informations, votre abonnement et la suppression de votre espace.
        </p>
      </header>

      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Identifiants liés à votre espace RentIQ.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Nom</span>
            <span className="col-span-2 font-medium">{fullName || "—"}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <span className="text-muted-foreground">Email</span>
            <span className="col-span-2 font-medium">{email ?? "—"}</span>
          </div>
          {createdAt && (
            <div className="grid grid-cols-3 gap-2">
              <span className="text-muted-foreground">Compte créé le</span>
              <span className="col-span-2">{new Date(createdAt).toLocaleDateString("fr-FR")}</span>
            </div>
          )}
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Abonnement */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> Abonnement
              </CardTitle>
              <CardDescription>Plan actuel et gestion de la facturation.</CardDescription>
            </div>
            <Badge variant={isActive ? "default" : "outline"}>{planLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isActive && subscription ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">Statut</span>
                <span className="col-span-2 font-medium capitalize">{subscription.status}</span>
              </div>
              {subscription.current_period_end && (
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-muted-foreground">
                    {subscription.cancel_at_period_end || subscription.status === "canceled"
                      ? "Accès jusqu'au"
                      : "Prochain renouvellement"}
                  </span>
                  <span className="col-span-2">
                    {new Date(subscription.current_period_end).toLocaleDateString("fr-FR")}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={handlePortal} disabled={portalLoading} variant="outline">
                  {portalLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Gérer mon abonnement
                </Button>
                <Button asChild variant="ghost">
                  <Link to="/upgrade">Changer de plan</Link>
                </Button>
                {!subscription.cancel_at_period_end && subscription.status !== "canceled" && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Annuler l'abonnement
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                L'annulation prend effet à la fin de la période en cours — vous gardez l'accès jusqu'à cette date.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                Vous êtes sur le plan gratuit (3 analyses par mois).
              </p>
              <Button asChild>
                <Link to="/upgrade">Voir les plans</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Sécurité & confidentialité
          </CardTitle>
          <CardDescription>Vos droits sur vos données.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Vos données sont stockées chiffrées en Europe et ne sont jamais revendues.
            Consultez notre{" "}
            <Link to="/legal/confidentialite" className="underline">
              politique de confidentialité
            </Link>{" "}
            et nos{" "}
            <Link to="/legal/cgu" className="underline">
              CGU
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {/* Zone dangereuse */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Supprimer mon compte</CardTitle>
          <CardDescription>
            Action irréversible : votre patrimoine, vos analyses et votre historique seront définitivement effacés.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Supprimer définitivement
          </Button>
          {isActive && (
            <p className="mt-3 text-xs text-muted-foreground">
              Pensez à annuler votre abonnement depuis le portail avant suppression.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Cette action est définitive. Tapez <strong>SUPPRIMER</strong> pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirmation</Label>
            <Input
              id="confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="SUPPRIMER"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || deleteConfirm !== "SUPPRIMER"}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Supprimer mon compte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={(o) => !cancelling && setCancelOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Annuler votre abonnement&nbsp;?</DialogTitle>
            <DialogDescription>
              Votre accès Pro reste actif jusqu'à la fin de la période en cours
              {subscription?.current_period_end
                ? ` (${new Date(subscription.current_period_end).toLocaleDateString("fr-FR")})`
                : ""}
              . Aucun prélèvement supplémentaire ne sera effectué.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Conserver mon abonnement
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
