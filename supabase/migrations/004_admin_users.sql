-- Keep a tombstone profile so historical games retain valid foreign keys.
alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.admin_delete_account(p_actor uuid, p_target uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 target public.profiles%rowtype;
 previous_avatar text;
begin
 -- Serialize deletions so two admins cannot concurrently remove the last admin.
 perform pg_advisory_xact_lock(724301, 1);
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and deleted_at is null) then
  raise exception 'admin_required';
 end if;
 if p_actor=p_target then raise exception 'cannot_delete_self'; end if;
 select * into target from public.profiles where id=p_target for update;
 if not found then raise exception 'account_not_found'; end if;
 if target.deleted_at is not null then return jsonb_build_object('avatarPath',null); end if;
 if target.role='admin' and (select count(*) from public.profiles where role='admin' and deleted_at is null)<=1 then
  raise exception 'last_admin';
 end if;
 previous_avatar:=target.avatar_path;
 update public.games g
 set status=case when g.status='pending' then 'declined' else 'finished' end,
     state=case when g.status='active' then g.state || jsonb_build_object(
      'status','finished','endReason','resignation',
      'resignedBy',case when g.inviter_id=p_target then 0 else 1 end,
      'history',coalesce(g.state->'history','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
       'player',case when g.inviter_id=p_target then 0 else 1 end,
       'kind','resign','words','[]'::jsonb,'score',0))) else g.state end,
     revision=g.revision+1,updated_at=now(),last_action_id=gen_random_uuid(),last_action_by=p_actor
 where (g.inviter_id=p_target or g.invitee_id=p_target) and g.status in ('pending','active');
 update public.profiles
 set deleted_at=now(),name='Compte supprimé',email='deleted+'||p_target::text||'@scrabblya.invalid',avatar_path=null
 where id=p_target;
 return jsonb_build_object('avatarPath',previous_avatar);
end;
$$;
revoke all on function public.admin_delete_account(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_delete_account(uuid,uuid) to service_role;
