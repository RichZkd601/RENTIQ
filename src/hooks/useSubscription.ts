import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";

export function useSubscription() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const env = typeof window !== "undefined" ? getPaddleEnvironment() : "sandbox";

  const query = useQuery({
    queryKey: ["subscription", userId, env],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const sub = query.data;
  const now = new Date();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const isActive = !!sub && (
    (["active", "trialing", "past_due"].includes(sub.status) && (!periodEnd || periodEnd > now))
    || (sub.status === "canceled" && !!periodEnd && periodEnd > now)
  );

  return { subscription: sub, isActive, isLoading: query.isLoading };
}
