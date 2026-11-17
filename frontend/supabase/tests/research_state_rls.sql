-- Run after the migration. All fixture writes are rolled back. Outputs no user data.
begin;
do $$
declare owner_id uuid; stranger uuid := gen_random_uuid(); n integer;
begin
  select id into owner_id from auth.users limit 1;
  if owner_id is null then raise exception 'An existing account is required for this check'; end if;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  insert into public.research_state(user_id,key,value)
    values(owner_id,'__audit_rls_fixture__','{"test":true}')
    on conflict (user_id,key) do update set value=excluded.value;
  select count(*) into n from public.research_state where key='__audit_rls_fixture__';
  if n <> 1 then raise exception 'Owner cannot read fixture'; end if;
  perform set_config('request.jwt.claim.sub', stranger::text, true);
  select count(*) into n from public.research_state where key='__audit_rls_fixture__';
  if n <> 0 then raise exception 'Cross-account read allowed'; end if;
  update public.research_state set value='{"test":false}' where key='__audit_rls_fixture__';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-account update allowed'; end if;
  begin
    insert into public.research_state(user_id,key,value) values(owner_id,'__audit_rls_other__','{}');
    raise exception 'Cross-account insert allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  if has_table_privilege('anon','public.research_state','select') then raise exception 'Anonymous read granted'; end if;
end $$;
rollback;
select 'Research RLS checks passed; fixture writes rolled back' as result;
