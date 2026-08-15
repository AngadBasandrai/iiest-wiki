create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('iiest-notify')
where exists (select 1 from cron.job where jobname = 'iiest-notify');

select cron.schedule(
  'iiest-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://djuenrrpmlqgpfpihgff.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer PASTE_SERVICE_ROLE_KEY',
      'x-notify-secret', 'PASTE_NOTIFY_SECRET'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select jobid, jobname, schedule, active from cron.job where jobname = 'iiest-notify';
