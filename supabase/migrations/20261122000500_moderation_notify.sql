-- Notify moderators when a member files a report, and audit it.
create function private.report_filed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.audit('moderation.reported', 'community', new.community_id, new.target_type, new.target_id, jsonb_build_object('report_id', new.id));
  perform private.notify_holders('moderation.resolve', 'community', new.community_id, 'moderation.reported',
    'New report: ' || new.target_type, left(new.reason, 280), '/admin/moderation', array[new.reporter_id]);
  return new;
end $$;
create trigger report_filed after insert on public.moderation_reports for each row execute function private.report_filed();
revoke execute on function private.report_filed() from public;
