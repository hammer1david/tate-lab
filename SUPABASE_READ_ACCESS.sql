-- TATE Lab read-only Data API access.
-- Workout definitions/config are public to the Lab; no INSERT/UPDATE/DELETE is granted.
-- RLS remains enabled on all exposed TATE tables.

alter table public.tate_stride_generation_rules enable row level security;
alter table public.tate_stride_variants enable row level security;
alter table public.tate_hill_sprint_generation_rules enable row level security;
alter table public.tate_hill_sprint_variants enable row level security;
alter table public.tate_hillwork_generation_rules enable row level security;

grant select on table
  public.tate_workout_families,
  public.tate_workout_blocks,
  public.tate_workout_band_defaults,
  public.tate_workout_pace_defaults,
  public.tate_workout_steps,
  public.tate_workout_step_pace_defaults,
  public.tate_aerobic_generation_rules,
  public.tate_aerobic_pace_profiles,
  public.tate_aerobic_distance_profiles,
  public.tate_aerobic_phase_rules,
  public.tate_long_run_profiles,
  public.tate_long_run_phase_rules,
  public.tate_recovery_generation_rules,
  public.tate_stride_generation_rules,
  public.tate_stride_variants,
  public.tate_hill_sprint_generation_rules,
  public.tate_hill_sprint_variants,
  public.tate_hillwork_generation_rules
  to anon, authenticated;

-- Existing six fixed-library policies.
drop policy if exists "tate_lab_read_tate_workout_families" on public.tate_workout_families;
create policy "tate_lab_read_tate_workout_families" on public.tate_workout_families for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_workout_blocks" on public.tate_workout_blocks;
create policy "tate_lab_read_tate_workout_blocks" on public.tate_workout_blocks for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_workout_band_defaults" on public.tate_workout_band_defaults;
create policy "tate_lab_read_tate_workout_band_defaults" on public.tate_workout_band_defaults for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_workout_pace_defaults" on public.tate_workout_pace_defaults;
create policy "tate_lab_read_tate_workout_pace_defaults" on public.tate_workout_pace_defaults for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_workout_steps" on public.tate_workout_steps;
create policy "tate_lab_read_tate_workout_steps" on public.tate_workout_steps for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_workout_step_pace_defaults" on public.tate_workout_step_pace_defaults;
create policy "tate_lab_read_tate_workout_step_pace_defaults" on public.tate_workout_step_pace_defaults for select to anon, authenticated using (true);

-- Dynamic workout/config policies.
drop policy if exists "tate_lab_read_tate_aerobic_generation_rules" on public.tate_aerobic_generation_rules;
create policy "tate_lab_read_tate_aerobic_generation_rules" on public.tate_aerobic_generation_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_aerobic_pace_profiles" on public.tate_aerobic_pace_profiles;
create policy "tate_lab_read_tate_aerobic_pace_profiles" on public.tate_aerobic_pace_profiles for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_aerobic_distance_profiles" on public.tate_aerobic_distance_profiles;
create policy "tate_lab_read_tate_aerobic_distance_profiles" on public.tate_aerobic_distance_profiles for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_aerobic_phase_rules" on public.tate_aerobic_phase_rules;
create policy "tate_lab_read_tate_aerobic_phase_rules" on public.tate_aerobic_phase_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_long_run_profiles" on public.tate_long_run_profiles;
create policy "tate_lab_read_tate_long_run_profiles" on public.tate_long_run_profiles for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_long_run_phase_rules" on public.tate_long_run_phase_rules;
create policy "tate_lab_read_tate_long_run_phase_rules" on public.tate_long_run_phase_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_recovery_generation_rules" on public.tate_recovery_generation_rules;
create policy "tate_lab_read_tate_recovery_generation_rules" on public.tate_recovery_generation_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_stride_generation_rules" on public.tate_stride_generation_rules;
create policy "tate_lab_read_tate_stride_generation_rules" on public.tate_stride_generation_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_stride_variants" on public.tate_stride_variants;
create policy "tate_lab_read_tate_stride_variants" on public.tate_stride_variants for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_hill_sprint_generation_rules" on public.tate_hill_sprint_generation_rules;
create policy "tate_lab_read_tate_hill_sprint_generation_rules" on public.tate_hill_sprint_generation_rules for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_hill_sprint_variants" on public.tate_hill_sprint_variants;
create policy "tate_lab_read_tate_hill_sprint_variants" on public.tate_hill_sprint_variants for select to anon, authenticated using (true);

drop policy if exists "tate_lab_read_tate_hillwork_generation_rules" on public.tate_hillwork_generation_rules;
create policy "tate_lab_read_tate_hillwork_generation_rules" on public.tate_hillwork_generation_rules for select to anon, authenticated using (true);
