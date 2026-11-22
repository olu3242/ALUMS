-- Optional: schedule the idempotent event reminder sweep with pg_cron (enable the extension in Supabase first).
select cron.schedule('alums-event-reminders', '*/15 * * * *', $$select private.enqueue_event_reminders()$$);
