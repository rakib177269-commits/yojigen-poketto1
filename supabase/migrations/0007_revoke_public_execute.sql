-- 0007 Close the PUBLIC execute hole.
-- Postgres grants EXECUTE on every new function to PUBLIC by default, and a
-- schema-scoped "alter default privileges ... revoke" cannot remove a GLOBAL
-- default. So anon/authenticated inherited EXECUTE on place_order & co via
-- PUBLIC, which would let a browser call them directly and skip our server's
-- rate limiting. Revoke globally, then re-grant exactly what is intended.

alter default privileges for role postgres revoke execute on functions from public;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Intentionally public, read-only, non-secret:
grant execute on function public.get_public_settings() to anon, authenticated;
grant execute on function public.get_delivery_zones() to anon, authenticated;
