-- 0015 The shop moved to its own domain. Background jobs (pg_cron -> /api/sweep/*)
-- call the site at this address.
update private.app_config set value = 'https://yojigen-pokettobd.com' where key = 'site_url';
