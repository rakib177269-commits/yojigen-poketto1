-- 0023 Run the background sweeps less often to save Netlify credits (each run is a
-- function call). Messages are still sent immediately after each order change;
-- these sweeps only retry. cron.schedule with an existing name updates that job.
select cron.schedule('notify-sweep', '*/15 * * * *', $$select private.call_sweep('/api/sweep/notify')$$);
select cron.schedule('marketing-purchase-sweep', '*/30 * * * *', $$select private.call_sweep('/api/sweep/marketing')$$);
