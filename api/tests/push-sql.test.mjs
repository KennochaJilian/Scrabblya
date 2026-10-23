import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
test('PostgreSQL push outbox: reminders, stale leases, account isolation and deletion',{skip:!process.env.SCRABBLYA_PGLITE_PATH},async()=>{
 const {PGlite}=require(process.env.SCRABBLYA_PGLITE_PATH),db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  for(const file of ['001_profiles.sql','002_games.sql','004_admin_users.sql','005_push_notifications.sql'])await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',da='10000000-0000-4000-8000-000000000001',dB='10000000-0000-4000-8000-000000000002',game='20000000-0000-4000-8000-000000000001';
  for(const id of [a,b]){await db.query('insert into auth.users values($1)',[id]);await db.query("insert into profiles(id,name,email,role) values($1,$2,$3,'admin')",[id,'Player',id+'@example.test']);}
  await db.exec('set role authenticated');await assert.rejects(()=>db.query('select register_push_device($1,$2,$3)',[a,da,'a'.repeat(100)]),/permission denied/);await db.exec('reset role;set role service_role');
  for(const [user,device,token] of [[a,da,'a'],[b,dB,'b']])await db.query('select register_push_device($1,$2,$3)',[user,device,token.repeat(100)]);
  const state={current:0,status:'playing',history:[],players:[{userId:a,name:'Alice',score:0,rack:['A']},{userId:b,name:'Bob',score:0,rack:['B']}],board:[],bag:[]};
  await db.query("insert into games(id,inviter_id,invitee_id,status,state) values($1,$2,$3,'pending',$4)",[game,a,b,JSON.stringify(state)]);
  let jobs=(await db.query('select * from notification_jobs')).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'invitation');
  let leases=(await db.query('select * from claim_push_jobs()')).rows.map(r=>r.claim_push_jobs);assert.equal(leases.length,1);
  let context=(await db.query('select push_job_context($1,$2)',[leases[0].id,leases[0].leaseId])).rows[0].push_job_context;assert.equal(context.userId,b);
  await db.query("select complete_push_job($1,$2,'sent')",[leases[0].id,leases[0].leaseId]);
  await db.query("update games set status='active',revision=1,updated_at=now() where id=$1",[game]);
  jobs=(await db.query('select * from notification_jobs where revision=1 order by due_at')).rows;assert.equal(jobs.length,4);assert.equal(jobs[0].kind,'turn');assert.equal(jobs[0].user_id,a);
  assert.equal((new Date(jobs[1].due_at)-new Date(jobs[0].due_at))/3600000,6);assert.equal((new Date(jobs[2].due_at)-new Date(jobs[0].due_at))/3600000,12);assert.equal((new Date(jobs[3].due_at)-new Date(jobs[0].due_at))/3600000,24);
  await db.query("update games set revision=2,updated_at=now()-interval '13 hours' where id=$1",[game]);
  leases=(await db.query('select * from claim_push_jobs()')).rows.map(r=>r.claim_push_jobs);assert.equal(leases.length,1);
  context=(await db.query('select push_job_context($1,$2)',[leases[0].id,leases[0].leaseId])).rows[0].push_job_context;assert.equal(context.kind,'reminder12');
  const old=leases[0];await db.query("update notification_jobs set lease_until=now()-interval '1 second' where id=$1",[old.id]);
  const reclaimed=(await db.query('select * from claim_push_jobs()')).rows[0].claim_push_jobs;assert.notEqual(reclaimed.leaseId,old.leaseId);
  await db.query("select complete_push_job($1,$2,'sent')",[old.id,old.leaseId]);assert.equal((await db.query('select status from notification_jobs where id=$1',[old.id])).rows[0].status,'processing');
  state.current=1;await db.query('update games set revision=3,updated_at=now(),state=$2 where id=$1',[game,JSON.stringify(state)]);
  assert.equal((await db.query('select push_job_context($1,$2)',[reclaimed.id,reclaimed.leaseId])).rows[0].push_job_context,null);
  await db.query('select unregister_push_device($1,$2)',[a,dB]);assert.equal((await db.query('select active from push_devices where id=$1',[dB])).rows[0].active,true);
  await db.query('select register_push_device($1,$2,$3)',[a,dB,'b'.repeat(100)]);assert.equal(Number((await db.query('select count(*) as n from notification_jobs where device_id=$1 and user_id=$2',[dB,b])).rows[0].n),0);
  await db.query('select admin_delete_account($1,$2)',[b,a]);assert.equal(Number((await db.query('select count(*) as n from push_devices where user_id=$1 and active',[a])).rows[0].n),0);
  assert.equal((await db.query('select status from games where id=$1',[game])).rows[0].status,'finished');
 }finally{await db.close();}
});
