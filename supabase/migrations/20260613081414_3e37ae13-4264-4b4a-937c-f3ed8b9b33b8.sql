
CREATE OR REPLACE FUNCTION public.consume_analysis_quota(p_limit int)
RETURNS TABLE(used int, remaining int, reset_at date, plan text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used int;
  v_reset date;
  v_plan text;
BEGIN
  SELECT analyses_used_this_month, quota_reset_at, plan
    INTO v_used, v_reset, v_plan
  FROM profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  -- Réinitialisation mensuelle automatique
  IF v_reset IS NULL OR CURRENT_DATE >= v_reset THEN
    v_used := 0;
    v_reset := (date_trunc('month', (now() + interval '1 month')))::date;
    UPDATE profiles
       SET analyses_used_this_month = 0,
           quota_reset_at = v_reset
     WHERE id = auth.uid();
  END IF;

  IF v_used >= p_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED' USING DETAIL = format('%s/%s', v_used, p_limit);
  END IF;

  UPDATE profiles
     SET analyses_used_this_month = analyses_used_this_month + 1
   WHERE id = auth.uid()
   RETURNING analyses_used_this_month, quota_reset_at INTO v_used, v_reset;

  RETURN QUERY SELECT v_used, GREATEST(0, p_limit - v_used), v_reset, v_plan;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_analysis_quota(int) TO authenticated;
