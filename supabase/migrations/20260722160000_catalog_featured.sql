-- ============================================================
-- Catalog featured tool + public stats (for the redesigned /tools hero).
-- ============================================================

-- Which tool is showcased in the catalog's featured hero. Admin-toggled in the
-- tool editor. Only one is shown at a time (the first, by sort_order).
alter table tools add column if not exists is_featured boolean not null default false;

-- Partial index: "the featured tool" is a hot, tiny lookup.
create index if not exists tools_featured_idx on tools (sort_order) where is_featured;

-- Public aggregate stats for a tool — used by the featured hero (total successful
-- runs + average duration). SECURITY DEFINER so the PUBLIC catalog can show these
-- WITHOUT a policy that would expose individual run rows: tool_runs is select-own
-- only, and these are vanity counts, never PII.
create or replace function public.tool_public_stats(p_tool_id uuid)
returns table(run_count bigint, avg_ms numeric)
language sql stable security definer set search_path = public as $$
  select
    count(*)::bigint as run_count,
    avg(duration_ms) filter (where duration_ms is not null) as avg_ms
  from tool_runs
  where tool_id = p_tool_id and status = 'success';
$$;

grant execute on function public.tool_public_stats(uuid) to anon, authenticated;
