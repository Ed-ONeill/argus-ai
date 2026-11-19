# Argus isolated recovery rehearsal

Backups protect two separate systems: Railway persistent-volume state and
Supabase account/research data. A successful restore of one does not validate
the other. Production connection strings, volume attachments and authentication
settings must remain unchanged during this rehearsal.

## Supabase

1. Select a completed backup under **Restore to new project**, not the ordinary
   production Restore action. Record its UTC timestamp and the original project
   reference. Review the additional project cost with the owner.
2. Inspect enabled external-operation extensions before cloning. Supabase warns
   that copied jobs can start immediately. If cron/webhook/wrapper state cannot
   be safely excluded, use a logical export into an isolated destination instead.
3. Let the owner enter and retain the new database password privately. Restore to
   `argus-recovery-check-2026-11-19`; record the new project reference and completion
   time. Never point Argus production at it.
4. In the restored project, inspect the expected public tables, constraints,
   ownership foreign keys, row-level security, policies and enabled extensions.
   Check counts without exposing names, emails, passwords or research contents.
   Inspect Storage separately: physical database backups exclude stored objects.
5. On the **restored project only**, run the existing transaction/rollback check
   in `frontend/supabase/tests/research_state_rls.sql`. Verify that the owner can
   access the fixture, another account cannot read/update/insert it, and anonymous
   access is denied. All fixture writes must roll back.
6. Verify a restored Saved checkpoint only where such a record existed at the
   backup timestamp. If the restored table is empty, record that limitation;
   an empty table plus passing fixture is not proof of real-note recovery.
7. Compare data only against an appropriate backup-time baseline. Current live
   counts can legitimately differ. Preserve both observations without forcing a
   match or rewriting production.
8. Record restore duration and the chosen backup age as observed values, not a
   promised recovery SLA. Request final confirmation before permanently deleting
   the disposable project, after checking its exact reference differs from live.

## Railway

The documented native Restore action stages replacement of the volume attached
to the existing service. Do not deploy this as an isolated test. Before a cloud
restore exercise, obtain a supported way to access a restored copy independently,
or produce an application-consistent export with coordinated writers.

A file-by-file copy of a running volume is not sufficient consistency evidence.
SQLite needs its online backup API or a quiescent snapshot including journal
state; event registry and identity journal must agree at the captured boundary.
Copying a live cache pickle does not establish consistency of all runtime files.
Do not introduce a public backup/download endpoint to bypass operator access.

Once an approved copy exists: retain a manifest and hashes, restore only into a
new local/test directory, check SQLite integrity, load all identities, replay the
identity journal without its registry snapshot, and compare reconstructed state.
Use disabled ingestion/network writes in the restored application. Verify caches
can be rebuilt from durable records, and verify production source hashes/state
were not modified. The existing local exercise is a starting control, not proof
of the cloud backup.

## Provider guidance request — prepared, not sent

Railway Support: We use one persistent volume containing SQLite, an event identity
registry, append-only journals and recomputable caches. Scheduled volume backups
are enabled and a daily backup has completed. We need to validate a backup in
isolation without swapping the live service's volume. Is there a supported way
to mount or export a restored backup to a separate test target? If not, what is
the supported application-consistent export procedure? Please provide guidance
only; do not restore, detach, delete or change any production resources.

## References

- [Railway backup behavior](https://docs.railway.com/volumes/backups)
- [Railway volume commands](https://docs.railway.com/cli/volume)
- [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)
- [Supabase isolated restore and copied-job caveats](https://supabase.com/docs/guides/platform/clone-project)
