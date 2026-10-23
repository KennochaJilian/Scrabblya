-- Durable per-device outbox. Games and notification jobs commit together.
create table if not exists public.push_devices (
 id uuid primary key,user_id uuid not null references public.profiles(id),
 token text unique,active boolean not null default true,
 updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days'
);
create table if not exists public.notification_jobs (
 id uuid primary key default gen_random_uuid(),device_id uuid not null references public.push_devices(id) on delete cascade,
 user_id uuid not null references public.profiles(id),game_id uuid not null references public.games(id) on delete cascade,
 revision integer not null,kind text not null check(kind in ('invitation','turn','reminder6','reminder12','reminder24')),
 due_at timestamptz not null,expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','cancelled','failed')),
 attempts integer not null default 0,lease_id uuid,lease_until timestamptz,last_error text,sent_at timestamptz,
 unique(device_id,game_id,revision,kind)
);
create index if not exists notification_jobs_due on public.notification_jobs(due_at) where status in ('pending','processing');
alter table public.push_devices enable row level security;
alter table public.notification_jobs enable row level security;
revoke all on public.push_devices,public.notification_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.push_devices,public.notification_jobs to service_role;

create or replace function public.enqueue_game_push(p_game uuid,p_device uuid default null)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare g public.games%rowtype; recipient uuid;
begin
 select * into g from public.games where id=p_game;
 if not found or g.status not in ('pending','active') then return; end if;
 recipient:=case when g.status='pending' then g.invitee_id else (g.state->'players'->((g.state->>'current')::integer)->>'userId')::uuid end;
 insert into public.notification_jobs(device_id,user_id,game_id,revision,kind,due_at,expires_at)
 select d.id,recipient,g.id,g.revision,j.kind,g.updated_at+j.delay,g.updated_at+j.lifetime
 from public.push_devices d join public.profiles p on p.id=d.user_id
 cross join lateral (
  select 'invitation'::text kind,interval '0' delay,interval '7 days' lifetime where g.status='pending'
  union all select 'turn',interval '0',interval '6 hours' where g.status='active'
  union all select 'reminder6',interval '6 hours',interval '12 hours' where g.status='active'
  union all select 'reminder12',interval '12 hours',interval '24 hours' where g.status='active'
  union all select 'reminder24',interval '24 hours',interval '48 hours' where g.status='active'
 ) j
 where d.user_id=recipient and d.active and d.token is not null and d.expires_at>now()
 and p.deleted_at is null and (p_device is null or d.id=p_device) and g.updated_at+j.lifetime>now()
 on conflict(device_id,game_id,revision,kind) do update set status='pending',due_at=excluded.due_at,last_error=null
 where notification_jobs.status='cancelled';
end; $$;

create or replace function public.game_push_outbox_trigger()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.notification_jobs set status='cancelled',lease_id=null,lease_until=null
 where game_id=new.id and status in ('pending','processing') and (revision<>new.revision or new.status not in ('pending','active'));
 perform public.enqueue_game_push(new.id);
 return new;
end; $$;
drop trigger if exists game_push_outbox on public.games;
create trigger game_push_outbox after insert or update on public.games for each row execute function public.game_push_outbox_trigger();

create or replace function public.register_push_device(p_user uuid,p_device uuid,p_token text)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare g record;
begin
 perform pg_advisory_xact_lock(724301,2);
 if not exists(select 1 from public.profiles where id=p_user and deleted_at is null) then raise exception 'account_inactive'; end if;
 if length(p_token)<20 or length(p_token)>4096 then raise exception 'invalid_token'; end if;
 delete from public.push_devices where token=p_token and id<>p_device;
 delete from public.notification_jobs where device_id=p_device and user_id<>p_user;
 insert into public.push_devices(id,user_id,token,active,updated_at,expires_at)
 values(p_device,p_user,p_token,true,now(),now()+interval '30 days')
 on conflict(id) do update set user_id=excluded.user_id,token=excluded.token,active=true,updated_at=now(),expires_at=excluded.expires_at;
 delete from public.push_devices where user_id=p_user and id in (select id from public.push_devices where user_id=p_user order by updated_at desc offset 10);
 for g in select id from public.games where (inviter_id=p_user or invitee_id=p_user) and status in ('pending','active') loop
  perform public.enqueue_game_push(g.id,p_device);
 end loop;
end; $$;

create or replace function public.unregister_push_device(p_user uuid,p_device uuid)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 update public.push_devices set active=false,token=null where id=p_device and user_id=p_user;
 update public.notification_jobs set status='cancelled',lease_id=null,lease_until=null where device_id=p_device and user_id=p_user and status in ('pending','processing');
end; $$;

create or replace function public.deleted_account_push_trigger()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.deleted_at is not null then
  update public.push_devices set active=false,token=null where user_id=new.id;
  update public.notification_jobs set status='cancelled',lease_id=null,lease_until=null where user_id=new.id and status in ('pending','processing');
 end if;
 return new;
end; $$;
drop trigger if exists deleted_account_push on public.profiles;
create trigger deleted_account_push after update of deleted_at on public.profiles for each row execute function public.deleted_account_push_trigger();

create or replace function public.push_job_context(p_job uuid,p_lease uuid)
returns jsonb language sql security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('id',j.id,'leaseId',j.lease_id,'deviceId',d.id,'userId',j.user_id,'gameId',j.game_id,'revision',j.revision,'kind',j.kind,'token',d.token,'attempts',j.attempts,'expiresAt',j.expires_at)
 from public.notification_jobs j join public.push_devices d on d.id=j.device_id join public.games g on g.id=j.game_id join public.profiles p on p.id=j.user_id
 where j.id=p_job and j.lease_id=p_lease and j.status='processing' and j.lease_until>now() and j.expires_at>now()
 and d.user_id=j.user_id and d.active and d.token is not null and d.expires_at>now() and p.deleted_at is null and g.revision=j.revision
 and ((j.kind='invitation' and g.status='pending' and g.invitee_id=j.user_id)
 or (j.kind<>'invitation' and g.status='active' and (g.state->'players'->((g.state->>'current')::integer)->>'userId')::uuid=j.user_id));
$$;

create or replace function public.claim_push_jobs()
returns setof jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare j record;
begin
 update public.notification_jobs set status='cancelled',lease_id=null,lease_until=null where status in ('pending','processing') and expires_at<=now();
 update public.notification_jobs set status='failed',last_error='retry_exhausted' where status in ('pending','processing') and attempts>=5 and (lease_until is null or lease_until<=now());
 for j in
  with due as (
   select id from public.notification_jobs where attempts<5 and due_at<=now() and expires_at>now()
   and (status='pending' or (status='processing' and lease_until<=now()))
   order by due_at for update skip locked limit 20
  )
  update public.notification_jobs n set status='processing',attempts=n.attempts+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
  from due where n.id=due.id returning n.id,n.lease_id
 loop
  return next jsonb_build_object('id',j.id,'leaseId',j.lease_id);
 end loop;
end; $$;

create or replace function public.complete_push_job(p_job uuid,p_lease uuid,p_status text,p_error text default null)
returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_status not in ('sent','pending','cancelled','failed') then raise exception 'invalid_status'; end if;
 update public.notification_jobs set status=p_status,last_error=left(p_error,100),lease_id=null,lease_until=null,
 sent_at=case when p_status='sent' then now() else sent_at end,
 due_at=case when p_status='pending' then now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) else due_at end
 where id=p_job and lease_id=p_lease and status='processing';
end; $$;

revoke all on function public.enqueue_game_push(uuid,uuid),public.game_push_outbox_trigger(),public.register_push_device(uuid,uuid,text),public.unregister_push_device(uuid,uuid),public.deleted_account_push_trigger(),public.push_job_context(uuid,uuid),public.claim_push_jobs(),public.complete_push_job(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_game_push(uuid,uuid),public.game_push_outbox_trigger(),public.register_push_device(uuid,uuid,text),public.unregister_push_device(uuid,uuid),public.deleted_account_push_trigger(),public.push_job_context(uuid,uuid),public.claim_push_jobs(),public.complete_push_job(uuid,uuid,text,text) to service_role;
