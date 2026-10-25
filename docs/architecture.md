# Application architecture

The desktop application is organized around a dependency direction: the domain and application rules do not depend on Electron, the renderer, or a concrete storage format. Platform and persistence code sit at the edge and implement the contracts owned by the application.

## Layers

- `core` contains shared domain types and pure codecs such as CSV parsing and formatting. It has no runtime platform dependencies.
- `domain` contains dataset invariants, derived views, date/profile rules, and health-exposure calculations.
- `application` contains use cases and orchestration. `src/application/animalService.ts` owns animal workflows and enabled-species rules; `DatasetRepositoryPort` defines the persistence boundary; `mutateDataset` applies a change to a copy and publishes it only after saving succeeds.
- `domain/species` owns the four registered definitions, typed details, profile labels, identifier schemes, care categories, presentation labels and demo factories. Application and renderer code use these definitions for supported fields and vocabulary. Some cat- and snake-specific defaults remain explicit in the current code, so adding another species still requires reviewing shared types, validation, storage and workflows.
- `infrastructure` implements persistence. `DatasetRepository` stores model v1 in schema 8 CSV files and rejects legacy files until they are migrated. `src/infrastructure/migrations` performs inspection, verified backup, staged validation and recoverable migration transactions.
- `src/legacy/migration` contains pure schema-3 release and schema-7 development mappings. The Electron flow warns and requests consent before converting a real register; `npm run migrate:model` calls the same engine.
- `main`, `preload`, and `renderer` are desktop adapters. Main owns Electron lifecycle and IPC, preload exposes the narrow bridge, and renderer owns presentation. Desktop IPC types live in `shared/types.ts`; core types live in `core/types.ts`.
- `legacy` contains legacy import parsing and pure migration mapping; filesystem migration orchestration stays in infrastructure.

The desktop main process currently composes the local repository with application services. The [shared-storage plan](shared-storage-plan.md) targets about five users connecting directly to Google Drive, with readable operational JSON and selectively encrypted PII. Shared mode uses independent feature edit leases acquired through explicit mutation actions, with atomic acquisition of every scope needed by a cross-feature workflow. One control object holds the lease map and committed snapshot pointer. Saves apply typed changes to the latest state and conditionally publish while preserving unrelated edits and leases. All pages and main-process write paths share the command-to-feature boundary. Soft deletion precedes delayed, resumable cleanup scoped to affected features when an authorized desktop is running. `DatasetRepositoryPort` remains the local contract; shared mode requires lease, revision and cleanup contracts. Domain behavior remains independent of Drive and Electron. The mode is planned, pending conditional-write and deletion-permission feasibility tests.

## Tests and coverage

The renderer uses one stylesheet and shared UI components for consistent presentation. Follow the [shared UI guidelines](ui-guidelines.md) when adding or changing screens; `src/renderer/AGENTS.md` records the defaults for future changes. Automated renderer checks enforce the stylesheet entry point and keep inline dynamic values limited to CSS custom properties.

Run `npm run test:coverage` to execute the suite and emit text and HTML coverage reports. Coverage includes core, domain, application, legacy import and migration, and infrastructure. Renderer DOM tests cover integrated single- and mixed-species controls. Global and layer-specific thresholds keep core/domain/application coverage from regressing unnoticed.

## Model and migration

The application model version is independent of both the storage schema and the installed app release. Current manifests store `modelVersion: 1`, `schemaVersion: 8`, and `settings.enabledSpecies`; `package.json` keeps the separate release version. Animal rows use `animals.csv` and include a species ID, validated species details, identification scheme and compatibility map. Relationships use `animalId`.

The legacy migration supports release tag `v0.1.0` schema 3 and workspace schema 7. Other legacy schemas, malformed manifests and unknown future versions are rejected without migration. Use `npm run build` before `npm run migrate:model`. `--dry-run` inspects and validates supported source rows without creating files, locks or backups; if an earlier migration is interrupted, it reports that recovery is required without changing the register. Default CLI mode prints a report and asks before migration; noninteractive conversion requires `--yes`.

After consent, the engine makes a sibling backup of the full register, verifies file sizes and SHA-256 checksums, stages and validates the target tables, publishes the manifest last, retires the old cat-table filenames, and records a receipt. Recovery completes a previously approved interrupted transaction before the register is opened. A live process lock cannot be recovered: close its owner first. `--recover-lock` asks before removing a dead owner's lock or completing its journal; noninteractive recovery requires `--yes`.

Downgrade requires closing both app versions and restoring the complete verified backup to a separate directory for the older version. Keep the converted register and backup intact. V1 edits cannot be reverse-migrated safely, and the v1 manifest intentionally remains incompatible with older releases. See [the model v1 migration guide](model-v1-migration.md) for commands, consent flow, recovery and restoration steps.

## Species support

The current model registers cats, dogs, rabbits and snakes. Each real dataset enables one or more of these in **Paramètres**; new and migrated real datasets default to cats. In single-species mode, the renderer uses that species' vocabulary and hides species selection, filters and mixed-list badges. Mixed-species mode shows species identity and offers selectors or filters where records need one.

Cats use the existing age-based profiles. Dog, rabbit and snake profiles are selected manually; no maturity thresholds are inferred for them. Snake care metadata offers no routine sterilization, flea or vaccination controls. Other species expose the care categories listed in their definitions; these categories describe available record actions, not veterinary timing guidance.

New animal forms keep age categories separate from free-text special needs. Optional weight, mixed breed/taxon and coat/scales characteristics are validated extensions of the existing `speciesData` JSON column, so the CSV table layout and schema remain unchanged. Historical `SPECIAL_NEEDS` profiles and `ON_HOLD` adoption values remain readable. New forms offer explicit unknown adoptability. Custom breed/color suggestions are accumulated per species in the optional `settings.appearanceCatalog` manifest field and retained after an animal is edited; old manifests without a catalog still load. Demo resets retain their existing policy of replacing demo data.

The registry supplies field descriptors and validation for the current four species, but the model is not yet a plug-in registry for arbitrary IDs. A fifth species needs an addition to the core `SpeciesId` and `SpeciesDataById` types, its validator and definition, storage validation, and review of species-specific default behavior before it can be used in persisted datasets. The renderer can consume descriptor-based fields, but that alone does not make a new species persistable.
