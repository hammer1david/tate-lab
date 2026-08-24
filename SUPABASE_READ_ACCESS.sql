-- TATE Lab read-only Data API access.
-- Workout definitions are public to the lab; no INSERT/UPDATE/DELETE is granted.
-- RLS remains enabled on all six tables.

grant select on table
  public.tate_workout_families,
  public.tate_workout_blocks,
  public.tate_workout_band_defaults,
  public.tate_workout_pace_defaults,
  public.tate_workout_steps,
  public.tate_workout_step_pace_defaults
  to anon, authenticated;

create policy "tate_lab_read_tate_workout_families"
  on public.tate_workout_families
  for select
  to anon, authenticated
  using (true);

create policy "tate_lab_read_tate_workout_blocks"
  on public.tate_workout_blocks
  for select
  to anon, authenticated
  using (true);

create policy "tate_lab_read_tate_workout_band_defaults"
  on public.tate_workout_band_defaults
  for select
  to anon, authenticated
  using (true);

create policy "tate_lab_read_tate_workout_pace_defaults"
  on public.tate_workout_pace_defaults
  for select
  to anon, authenticated
  using (true);

create policy "tate_lab_read_tate_workout_steps"
  on public.tate_workout_steps
  for select
  to anon, authenticated
  using (true);

create policy "tate_lab_read_tate_workout_step_pace_defaults"
  on public.tate_workout_step_pace_defaults
  for select
  to anon, authenticated
  using (true);
