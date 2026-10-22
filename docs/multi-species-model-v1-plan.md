# Multi-species support and model v1

## Scope and baseline

Implement cats, dogs, rabbits, and snakes in the existing Electron application. Keep all current adoption, foster, refuge, care, history, sponsorship, import, and demo workflows. This is the first explicitly versioned animal model: `modelVersion: 1`. App release versions and storage schema numbers remain separate concepts.

The verified migration baseline is tag `v0.1.0`, commit `ad9772c1f0660eeb3875ec8b2063466a9735a891`. Its `CURRENT_SCHEMA_VERSION` is **3**, not 1. The current workspace has schema **7**, extra cat fields and sponsorships, architecture changes, and date-relative editable demo sessions. Preserve those existing changes. Do not reset the working tree or base the new implementation solely on the release tag.

The new manifest uses `modelVersion: 1` and `schemaVersion: 8`. Keep schema numbers increasing so v0.1.0 and the current schema-7 app reject the newer files. Never reset `schemaVersion` to 1. Future model changes use explicit sequential migrations; storage-only changes can advance the schema independently.

## Product decisions

1. Supported species are configurable **per dataset**, through a new French-language **Paramètres** page. Default new real datasets and migrated cat datasets to cats only. Require at least one enabled, registered species. A setting change is validated and saved through the main process, using the normal transactional mutation boundary.
2. A single-species dataset automatically assigns that species during creation and import. Hide species selectors, columns, badges, grouping and filters throughout everyday workflows. Use the configured species' French vocabulary, such as Chats or Chiens. Keep the species checkboxes visible in Settings so users can enable another species.
3. A multi-species dataset uses Animaux as the main navigation label, exposes a required species choice when creating an animal, and offers species filtering in lists and workflows where an animal is selected. Show species on mixed result lists, identities, summaries and capacity views. Default filters to all enabled species. Changing a filter resets pagination and stale selections.
4. Reject disabling a species if **any stored animal**, including adopted, deceased or lost animals, uses it. Explain the reason and show the count for every species in Settings, including zero. Gray out the locked checkbox. Apply the same lock before regenerating demo data. This avoids hiding records and histories. Never delete, relabel or silently omit those records. Enabling another species does not automatically make families accept it.
5. Species of an existing animal is immutable in v1. Correcting an incorrectly registered species requires a future explicit conversion operation. This prevents incompatible fields, profiles and histories from changing silently.
6. Demo remains separate and editable. Each activation/start/reset discards its previous animal data and generates a current-date model-v1 dataset. Remember the demo's enabled species separately from real dataset settings, so users can test both single- and multi-species behavior. Resetting animal data retains that demo configuration. Invalid/unreadable demo configuration can fall back to cats only.
7. Keep the application identity and user-data directory stable; this work does not rename the installed product or move existing users' files.

## Model and extension contracts

Use a shared animal aggregate and composition, rather than duplicating the entire application for each species. Interfaces belong at the species rules and persistence boundaries. Status transitions, contact records, placements, adoptions and history remain common.

Replace public/domain `Cat`, `CatInput`, `CatView`, `CatStatus`, `CatEvent`, `CatService` and related identifiers with animal equivalents. Rename `cats` to `animals`, `catViews` to `animalViews`, `catEvents` to `animalEvents`, `adoptionDayCats` to `adoptionDayAnimals`, `catId` to `animalId`, and bulk `catIds` to `animalIds` consistently across types, services, persistence, IPC, preload, renderer, import, scripts and tests. A thin temporary alias is acceptable only during implementation; the final canonical model and storage must use animal names. Keep legacy names inside frozen migration/import adapters where they describe actual legacy files.

The animal core retains the current fields, IDs, timestamps and meaning wherever applicable: name, birth/intake dates, sex, identification, health/adoption status, description, photo, medications, compatibility with children, notes and history. Add a required stable `speciesId` (`cat`, `dog`, `rabbit`, `snake` initially) and validated `speciesData`. Use a typed species-to-data map and discriminated animal/input types, or an equivalent validated generic boundary. Do not accept arbitrary unvalidated JSON from IPC.

Convert `okWithCats` and `okWithDogs` to `compatibilityBySpecies` with true/false/null values; missing means unknown. Keep `okWithChildren` separate. Existing true, false and unknown values must survive migration exactly. All registered species can be represented without adding a column each time another species is implemented.

Keep common identification values and a supported scheme/type. Species definitions control available schemes and field labels; the existing ICAD check must not be applied universally to snakes and rabbits. Do not introduce new legal claims or regulatory validation as part of this change.

Use a `SpeciesDefinition` registry in the domain layer, importing only core/domain code. Each definition supplies:

- Stable ID and French singular/plural labels, grammatical display forms where used, and an icon key.
- Supported profile IDs and labels; optional age-based derivation and species-data validation.
- Supported identification schemes, relevant care categories, and simple field descriptors/capabilities.
- A demo factory or demo-data contract that creates coherent birth dates and species details from a supplied local reference date.

Keep React components out of this registry. Render metadata-driven species fields with common controls, or keep renderer implementations in a separate registry keyed by the same IDs. Domain code owns validation and policies; renderer code owns layout. Add an architecture test for this boundary.

Initial definitions:

| Species | Presentation and optional details | Profile/age behavior |
| --- | --- | --- |
| Cat | Chats; optional breed; existing cat care and identification behavior | Preserve current bottle kitten / kitten / adult / senior / special-needs IDs and date thresholds. Demo kittens stay below six months. |
| Dog | Chiens; optional breed and size | Species-specific puppy/adult/senior/special-needs labels. Manual profile selection initially; do not reuse cat thresholds. |
| Rabbit | Lapins; optional breed | Species-specific young/adult/senior/special-needs labels. Manual profiles initially. |
| Snake | Serpents; optional taxon and length in cm | Juvenile/adult/special-needs and unknown where appropriate; manual stage because maturity varies by taxon. Hide irrelevant routine sterilization/flea/vaccine controls. |

Unknown birth dates remain allowed and do not erase a manually selected profile. Preserve SPECIAL_NEEDS semantics rather than replacing them during daily age synchronization. Capabilities control offered new care actions; pre-existing records stay readable even if their category is no longer offered. No veterinary schedules or new medical thresholds are inferred in this implementation.

Adding a fifth species should require a definition, typed details/validation, display descriptors, demo data and contract tests, plus registry registration. Shared service, storage, adoption and foster algorithms should not need a new species-specific branch. JSON columns store extensible validated maps and details without schema changes for every added species. Unknown species IDs from a newer app produce an explicit unsupported-data error and never default to cat.

## Families, refuge and cross-species workflows

Replace `acceptedProfiles: CatProfile[]` with per-species foster acceptance rules, keyed by species ID and containing that species' profile IDs. Store explicit acceptance; absence means not accepted. Keep `maxCapacity` as a total number of animals. Optionally support a per-species maximum inside an acceptance rule; an absent maximum means only the total limit applies. Migrated families accept cats with exactly their existing profiles and total capacity. They do not acquire permission for the other species.

Placement assessment checks animal state, enabled species, family species acceptance, relevant profiles, total capacity, optional species capacity, and holiday dates. A species the family does not accept is a blocking error. Existing profile/capacity/holiday warnings retain their current explicit override/reason workflow. Switching one existing placement must exclude that animal from its own occupancy count. Family forms and capacity summaries follow the single/multiple-species display rules. Never present a total free-space number as proof that every species is accepted.

Refuge zones gain optional allowed species, with an empty/unrestricted representation defined explicitly. Migrated zones allow cats. New zone forms can select supported species in multi-species mode; in single-species mode assignment is automatic. Placement/zone changes validate these rules through application services. A nursery's name is a label, not the source of a hard-coded cat policy.

Adopters remain species-neutral contacts. Adoption groups may contain different species if otherwise valid. Search, bookings, event registrations, returns, foster transfers and bulk household selection all use animals. Mixed bulk operations validate the whole proposed selection before persistence, with failures leaving no partial mutations.

Co-location tracing stays species-neutral by default: do not assume different species eliminate an exposure. Preserve the existing interval algorithm and show each animal's species in mixed contexts. Health alerts, tasks, follow-ups, sponsorships, deceased/lost behavior, email templates and histories must reference `animalId` and species vocabulary. Do not drop completed or inapplicable historical care records.

## Storage v1

Persist `modelVersion`, `schemaVersion`, dataset identity/timestamps and `settings.enabledSpecies` in `dataset.json`. Use a strict typed manifest parser. Exclude manifest/configuration properties explicitly from stored table keys; the current `Exclude<keyof Dataset, ...>` list must be updated when new properties are added.

- `animals.csv` replaces `cats.csv`; add `speciesId`, validated JSON `speciesData`, identification scheme and JSON `compatibilityBySpecies`.
- `animal_events.csv` replaces `cat_events.csv`.
- `adoption_day_animals.csv` replaces `adoption_day_cats.csv`.
- All foreign-key headers become `animalId`; table identities for placements, stays, adoptions, alerts, tasks, follow-ups and sponsorships otherwise remain stable.
- Family acceptance rules and zone species constraints use validated JSON columns. All current fields not explicitly renamed are preserved, including later schema-7 optional detail fields and sponsorships.
- Parse serialized JSON as unknown, validate its exact structure and registry values, and return actionable errors. Validate IDs, references, version numbers and enum values before making new data writable. Do not silently coerce unknown nonempty legacy values into defaults.

Repository opening must distinguish new, current, migratable legacy, unsupported future, and malformed datasets. Inspect the manifest **before** the existing auto-migrating `DatasetRepository.open`; the old open function currently saves/normalizes on load. Refactor that behavior so no legacy write occurs before the upgrade warning and backup. Current-format normalizations must also not conceal failed validation.

## Migration from v0.1.0 and current development data

Implement one migration engine used both by Electron and a CLI. Put pure legacy-to-v1 mapping in a migration module, filesystem transaction/backup orchestration in infrastructure, and dialogs in main. Freeze the release schema-3 reader from the tag's actual headers and types; don't feed old files through a mutable new-model parser. Also support schema 7 from this workspace without losing optional fields or sponsorships. Preserve existing schema-1/2 upgrade capability through explicit legacy adapters if retained; at minimum clearly reject unsupported old versions before any write, never claim successful migration.

Detection is format-based, not based only on installed app version. `modelVersion` absent and a supported legacy `schemaVersion` indicates a migration candidate. `modelVersion: 1` and schema 8 indicate current. Unknown future model/schema values must be rejected unchanged. A malformed model-v1 manifest is not a legacy dataset. Check both startup's selected real dataset and every later folder selection. First launch into demo must not migrate the real folder in the background; inspect it only when the user opens it.

Electron sequence:

1. Read-only inspection and report: source version, dataset path, record counts, planned changes, problems, and available backup location. Block editing while an upgrade is pending. Do not overwrite last successful active dataset/preferences if opening another folder is cancelled or fails.
2. Show a French warning: the local register needs conversion to model v1; a backup will be created; this format cannot be opened by the previous release. Offer **Sauvegarder et migrer** and **Annuler**. A refusal leaves files unchanged and offers demo/another folder/exit, rather than silently opening or migrating.
3. On consent, obtain exclusive access (including normal app mutations and the CLI). Avoid stale-lock dead ends; report the owner and provide a safe explicit recovery path. If another app window/process holds the dataset, abort before conversion.
4. Create a unique, complete pre-migration backup with raw originals and a source inventory/checksums, outside ordinary 20-backup rotation. Include legacy-only files and an unfinished legacy transaction's journal/temporary files where present. Verify the backup before replacing any source file. If unfinished transactions need recovery, do so only after consent and after preserving their raw state.
5. Parse the supported legacy format and map in memory; validate all new entities and references. Refuse/report invalid rows or unexpected nonempty columns rather than silently dropping them. Do not run age synchronization, terminal-status repairs, or other unrelated normalizations during conversion.
6. Stage the complete target dataset in the same filesystem. Reopen and validate the staged output; verify entity counts and ID/reference preservation. Preserve datasetId, entity IDs, relationships, historical dates and original createdAt/updatedAt values. Record the migration time separately.
7. Commit through a recoverable transaction, publishing the new manifest/version last. Handle retired filenames in that transaction so stale cat CSV files cannot become an accidental second source of truth. Keep legacy originals in the verified backup. Record migration ID, source/target versions, counts, backup location and completion state in a receipt.
8. Reopen through the current-format repository and enable editing. Show a completion message and the backup location. Rerunning migration against current data is a no-op. A failure reports the backup and recovery status and never opens partially converted data for editing.

An app/CLI crash at any commit boundary must be recoverable deterministically on next open, before edits. Recovery must not trust arbitrary journal paths outside the chosen dataset. Downgrade means restoring the complete verified legacy backup to a separate directory with the older application closed; don't attempt to reverse changes made in v1. Document this procedure.

Legacy mapping:

| Legacy data | Model-v1 mapping |
| --- | --- |
| Every cat | Same ID/data, `speciesId: cat`, validated default cat details, cat-compatible identification scheme |
| `cats`, `catViews`, `catEvents`, `adoptionDayCats` | Generic animal equivalents |
| Every `catId` / `catIds` | `animalId` / `animalIds`, preserving referenced IDs |
| Family accepted cat profiles | Cat acceptance rule only, preserving explicit empty lists and maxCapacity |
| Refuge zone | Cat allowed; preserve ID/name/description/stays |
| `okWithCats`, `okWithDogs` | Corresponding compatibility map values, including false and unknown |
| Schema-3 missing later fields/sponsorship table | Documented empty/unknown values; no invented historical records |
| Schema-7 details, sponsors, care and custom event labels | Preserve all values |
| Missing species settings | Cats only |

CLI contract after the project build:

```sh
npm run build
npm run migrate:model -- --dataset "path/to/register" --dry-run
npm run migrate:model -- --dataset "path/to/register"
npm run migrate:model -- --dataset "path/to/register" --yes
```

Provide `scripts/migrate-model.mjs` and a bundled Node migration entry point so the CLI and app call the same engine without importing Electron. Dry-run does not create a dataset, backups, locks or files. Default execution prints the warning/report and asks for confirmation; noninteractive execution requires explicit `--yes`. Exit codes distinguish success/no-op, cancellation, unsupported format/validation and I/O failure. Never prompt for migration in demo mode; replace demo storage before attempting to parse obsolete animal rows. No actual user dataset is migrated during development/tests.

## Implementation work packages (in order)

| Phase | Files / work | Completion evidence |
| --- | --- | --- |
| 1. Model and registry | `src/core/types.ts`, `src/domain/species/*`, domain dataset helpers, age rules, architecture test | All four definitions validate details; species-dependent labels/capabilities exist; shared services need no four-way switch. |
| 2. Versioned storage and migration | Manifest/records/tables, repository, migration engine/adapters, CLI bundle and package script | Real schema-3 and schema-7 synthetic fixtures migrate without lost fields/references; new/future/corrupt data paths covered. |
| 3. Shared application rules | Animal service and inputs, settings mutation, placement/refuge checks, tracing, sponsorships, bulk workflows | Domain settings are enforced outside UI; existing workflows pass for cats and representative other species. |
| 4. Desktop integration | Main startup/folder selection, preferences, IPC, preload, snapshots, migration dialog | No legacy write before consent; cancellation/failure preserves selected real dataset; demo bypasses migration. |
| 5. Renderer | Animal pages/components/search/table, Settings, species fields, vocabulary, filters, families/refuge/care/adoption/email/import | All four species can be created, edited and used; single-species controls are absent; multi-species controls work. |
| 6. Demo and import | Demo registry factories, reset/settings integration, legacy CSV adapter and CLI/UI replay scripts | Demo dates coherent per species and independent of real settings; old cat imports target cat and are blocked if cat isn't enabled; future generic imports accept explicit species. |
| 7. Verification and documentation | Regression/contract/migration/UI tests, README and architecture/migration guides, full project check | All acceptance criteria below verified; no real records or committed CSV fixture files. |

Implement coherent phases and keep type errors temporary only while a phase is in progress. Do not finish with merely cat aliases, an unconnected Settings page, a standalone converter that startup never calls, or species labels without actual validation/storage/UI support. Do not change the app's package release version or publish a release as part of this work.

## Required verification

Use synthetic test data in TypeScript/JSON that writes CSV to temporary directories at runtime: the publication checker prohibits committed CSV files. Base the schema-3 fixture on the tag's actual table headers and include every relationship table, returned/group adoptions, holidays, registrations/bookings, history, care and follow-ups. Add a schema-7 fixture with false/null compatibility, rich descriptions, photos, medication dates, sponsors, custom event labels and empty family acceptance. Verify preserved IDs, counts, references and historical values explicitly.

Migration tests cover dry-run byte-for-byte immutability, declined consent, backup verification/failure, invalid/unknown nonempty source values, already-current no-op, future versions, corrupt files, duplicate/missing references, interrupted source transactions, injected failures between staged writes/renames/manifest publication, successful recovery, process lock conflicts, CLI `--yes` and noninteractive refusal. Test that the old release's schema comparison would reject the new manifest. Mock dialogs/filesystem failures where a real Electron process is unnecessary.

Application/renderer tests cover cats-only, dogs-only, cats+dogs, and all four species; enabling/disabling settings with and without records; stale filter reset; species creation auto-assignment/choice; species details round trips; incompatible families/zones; total and optional species capacity; mixed household adoption events; neutral co-location tracing; care capability presentation and retention of history; sponsorships and death; species-appropriate email language. Test species selector/filter **absence** in single-species mode with DOM assertions, not only helper functions.

Demo tests freeze local time around New Year, leap day and DST, check valid ages and ordered timelines, exercise each supported species configuration and reset, and prove real settings/records remain unchanged. An additional test species registered through the extension contract should work through generic settings, storage, placement and presentation metadata without modifying shared algorithms.

Run `npm run check` (publication, lint, typecheck, coverage thresholds, build) and relevant CLI/UI smoke checks. Fix failures caused by the implementation without weakening coverage thresholds or deleting existing tests. Inspect the final diff for accidental removal of staged user work and for remaining cat-only assumptions outside legacy/cat-definition code.

## Final acceptance

- A previous-release cat register opens only after a clear warning and verified backup, with all relationships retained and model v1 persisted.
- A cats-only user sees a coherent cat app with no redundant species selection/filter/category UI.
- A dogs-only user can use the same workflows with dog terminology and fields, with no cat-only controls.
- A user with several species can select/filter them and constrain foster/refuge acceptance correctly.
- A user can change enabled species without losing or hiding any existing animal history.
- Adding another species extends the registry and typed data/metadata instead of duplicating the application.
- Demo data can always be overwritten, retains date coherence, and never triggers a real-data conversion.

## Delegation

This plan is the implementation brief for GPT-6 Luna, requested by the user. Implement the full scope in the shared workspace, preserve existing staged/unstaged changes, report phase progress and verification results, and flag any requirement that cannot be completed. The primary agent reviews the result and runs final checks before reporting completion.
