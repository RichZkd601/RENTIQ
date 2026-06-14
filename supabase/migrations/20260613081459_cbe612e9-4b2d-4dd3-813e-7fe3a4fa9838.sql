
ALTER FUNCTION public.consume_analysis_quota(int) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.consume_analysis_quota(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_analysis_quota(int) TO authenticated;
