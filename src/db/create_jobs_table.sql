-- Create jobs table in Supabase
-- Optional: ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  date date not null,
  scheduled_time text null,
  start_time timestamptz null,
  end_time timestamptz null,
  status text not null check (status in ('scheduled','in-progress','completed')) default 'scheduled',
  total_time int null, -- minutes
  mow_time int null,
  trim_time int null,
  edge_time int null,
  blow_time int null,
  drive_time int null,
  notes text null,
  photo_urls text[] null,
  messages_sent text[] null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
before update on jobs
for each row execute procedure set_updated_at();

-- Helpful indexes
create index if not exists idx_jobs_date on jobs(date);
create index if not exists idx_jobs_customer_date on jobs(customer_id, date);

-- Ensure one job per customer per date
create unique index if not exists uq_jobs_customer_date on jobs(customer_id, date);

-- RLS policies
alter table jobs enable row level security;

-- For demo: allow read/write to anon role (adjust for production)
drop policy if exists jobs_select_all on jobs;
create policy jobs_select_all
  on jobs for select
  using (true);

drop policy if exists jobs_insert_all on jobs;
create policy jobs_insert_all
  on jobs for insert
  with check (true);

drop policy if exists jobs_update_all on jobs;
create policy jobs_update_all
  on jobs for update
  using (true)
  with check (true);

drop policy if exists jobs_delete_all on jobs;
create policy jobs_delete_all
  on jobs for delete
  using (true);
