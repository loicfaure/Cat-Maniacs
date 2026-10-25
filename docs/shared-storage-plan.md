# Google Drive sharing: feature locks, selective PII encryption and delayed deletion

Status: proposed implementation plan, revised 25 October 2026. Synchronization, authentication and encryption are not implemented by this document.

## Decision and scope

The association cannot host a server. Each Electron app will connect directly to Google Drive using the member's own account. A private folder will contain readable operational JSON with encrypted PII sections. Attachments containing PII are encrypted; reviewed attachments without PII can remain readable. Encryption, validation and conflict resolution run on members' computers. No application server, hosted database, relay or always-on computer is required.

Keep local CSV mode and CSV import/export. Shared mode uses JSON to preserve nested species/settings data, UUID relationships and complete business transactions. The current CSV directory must not become the synchronized authority.

Target approximately five trusted users, each able to read the complete register. Use one edit lease per feature: all users can browse, and users can edit different features simultaneously. Clicking Edit acquires the feature leases required by that specific action; another editor blocks only overlapping features. An association owner manages invitations and recovery from their desktop; no computer must stay online. Benchmark synthetic datasets before declaring supported sizes.

```mermaid
flowchart LR
    A[Electron member A] <-->|Snapshots with sealed PII| D[Private Google Drive folder]
    B[Electron member B] <-->|Snapshots with sealed PII| D
    A --> LA[Local validation and protected PII]
    B --> LB[Local validation and protected PII]
```

Readers refresh to the published register revision. Shared writes require connectivity, the required feature leases and an atomic conditional publication. Offline users can browse cached data and retain local drafts, but cannot publish shared changes. Soft deletion provides a recovery window before a desktop cleanup task performs permanent deletion.

## Libraries and Google setup

Use Google's `googleapis` client or Drive submodule for transport/OAuth, and built-in `node:crypto` for PII encryption and signatures. With exclusive editing within each feature, use a snapshot/lease adapter with typed changes applied to the latest state rather than introducing a CRDT and automatic field merging. Google's [official client](https://github.com/googleapis/google-api-nodejs-client#support-and-maintenance) supplies API access, not edit-session semantics. Pin compatible dependencies during implementation.

RxDB remains a possible component, but its [Drive plugin](https://rxdb.info/replication-google-drive.html) is beta and documented for one account across devices. Its [transaction source](https://raw.githubusercontent.com/pubkey/rxdb/master/src/plugins/replication-google-drive/transaction.ts) uses ETag-conditional updates, providing a concrete pattern to investigate. That short transaction mechanism is not automatically a safe lease covering minutes spent filling a form. Automerge and experimental group-sync libraries are unnecessary for the initial feature-lock workflow.

The application maintainer must configure a Google Cloud project, enable Drive API and create a desktop OAuth client/consent screen. This is API configuration without hosting. Address OAuth consent/verification requirements for production distribution; a temporary testing configuration is insufficient for permanent access.

Each member signs in through the system browser with PKCE and a validated loopback callback, following [Google's desktop OAuth flow](https://developers.google.com/identity/protocols/oauth2/native-app). Store individual refresh tokens locally; distribute no shared Google password or service credentials.

The owner creates a private folder through the app and shares it with named accounts. Test ordinary shared folders; do not require paid Workspace shared drives. Verify inherited permissions on new files. Use a normal folder because [appDataFolder cannot share files/folders](https://developers.google.com/workspace/drive/api/guides/appdata#constraints_on_the_application_data_folder).

Prefer `drive.file`, but the first spike must prove that two separately authorized accounts can discover, read and create all required files, including files newly created by the other member. Selecting a folder must not be assumed to authorize every child. If narrow scopes fail, document broader-scope consent/verification requirements before committing to the integration. See [Google's scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Drive permissions govern storage access; signed membership governs which device commands the app accepts. Readers have decryption access and Drive viewer permissions; editors have Drive edit access and enrolled signing keys. Editors can potentially delete/alter files outside the app. This is a trusted-team design with tampering detection and independent backups, without a server enforcing application rules against malicious editors.

## PII classification and JSON representation

Encryption is selective, not applied to the whole register. Readable operational data remains inside the private Drive folder; readable does not mean publicly shared or anonymous. Use a typed, versioned classification at the persistence boundary so commands, snapshots, retained history, saved drafts and derived values follow the same policy.

| Data from the current model | Planned storage |
| --- | --- |
| Animal UUID, species, sex, age/profile, structured care/status fields, task types/dates, enabled species and schema versions | Clear operational JSON. Animal names can be clear when they name only the animal; protect human-identifying content separately. |
| Family/adopter labels, courtesy titles, first/last names, email, phone and home address | Encrypted PII block; labels can contain a person's name. Opaque record IDs and non-identifying capacity/rule fields can remain clear. |
| Personal relationship fields: placement `familyId`, adoption/booking `adopterId`, family-linked activity data and family holiday schedules | Encrypt personal links/schedules; an opaque ID alone does not make identifiable personal history safe to expose. Reassemble locally for validation. |
| Sponsor identities/contacts, person-linked payment amounts/dates and payment notes | Encrypted PII block. Aggregates can be clear only after removing personal links. |
| Free text: notes, descriptions, reasons, follow-up responses, history labels/titles, custom catalogs and free-form locations/partners | Encrypt by default because these fields may contain PII. Reviewed non-personal text may be explicitly classified clear; a regex is insufficient to establish safety. |
| Animal identification numbers such as ICAD, private locations and private partner contact details | Protect when linkable to a person; default identifiers to protected pending classification. Reviewed public organizational venue details can be clear. |
| Generated reminder recipients/names, rendered subjects/bodies, personal filenames and contact-derived display labels | Encrypted, including copies in preferences, history and draft views. Reviewed generic templates with placeholders can be clear. |
| Photos, contracts, invoices, documents and original names/metadata | Encrypt when PII-bearing; unreviewed files default to protected. Reviewed animal-only images/documents without identifying content or metadata can stay clear. |
| Protocol IDs, signatures, public device keys and sync metadata | Clear with opaque identifiers; no emails, usernames or person-derived paths. Private keys/tokens remain in secure local storage. |

For example, store a family's capacity as readable JSON while sealing its identity:

```json
{
  "id": "family-opaque-id",
  "maxCapacity": 4,
  "pii": {
    "formatVersion": 1,
    "keyEpoch": 2,
    "nonce": "<base64>",
    "ciphertext": "<encrypted contact fields and notes>",
    "tag": "<base64>"
  }
}
```

Apply the split inside commands and snapshots too. Encrypting contacts is insufficient if an adoption command, imported source row or event label repeats their names in clear text. Store dependent public/private changes in one signed snapshot publication and apply them atomically after decryption and validation. A device without a PII key may show a marked redacted operational view; it cannot edit when private preconditions cannot be validated.

Explicitly allow fields into clear JSON. Unknown/new fields require classification before publication; never spread arbitrary dataset/settings/input objects into clear output. Include a privacy-policy version and reject unsupported classifications. Search private fields locally after unlock; upload neither plaintext search indexes nor simple email/phone hashes. Test with synthetic marker PII in every protected field and inspect emitted files, metadata, logs and retry/draft paths for leaks; also assert allowed operational fields remain readable.

## Canonical state and feature edit leases

Use one fixed control-file ID recorded in the owner-signed bootstrap. Store a map of independent feature leases alongside the current snapshot pointer. A shared control object permits atomic lease-set acquisition and snapshot publication; it is not a register-wide edit lock. An animal editor and family editor can both hold valid leases for as long as their forms are open.

```text
register-<opaque-id>/
  bootstrap.json
  control.json
  membership/<opaque-event-id>.json
  snapshots/<opaque-commit-id>.json
  objects/<opaque-object-id>.bin
  objects/<opaque-object-id>.bin.enc
```

`control.json` contains protocol version, committed snapshot ID/digest, global data revision, membership epoch, purge generation, and a feature map. Each feature has its own data revision, lease generation and optional lease with opaque device/session IDs, acquisition token, expiry and pinned base-snapshot ID. Locks and heartbeats change the control ETag without changing unrelated feature data revisions. Lease expiry or takeover advances only that feature's generation. Do not include human names in clear lock metadata; resolve labels locally from protected membership data.

The bootstrap pins the owner key and control ID; verify its fingerprint through the invitation/recovery channel. Never discover/create locks by filename, silently recreate missing control files or select the newest snapshot by timestamp. The committed control pointer is authoritative; uploaded snapshots without successful pointer publication are candidates. Snapshots contain readable operational fields, sealed PII, deletion metadata, purge markers and recent idempotency receipts.

### Feature ownership and action scope

A lock follows the data being changed, not the page from which a button is clicked. The same animal update must acquire `animals` whether launched from the animal list, a dashboard or another feature. Feature names and command footprints are application contracts, shared by renderer and main.

| Feature lock | Main ownership |
| --- | --- |
| `animals` | Animal records, photos, health alerts and animal event/history rows. |
| `families` | Foster family contacts, capacity/acceptance rules, holidays and foster placements. |
| `adopters` | Adopter contact records. |
| `adoptions` | Adoptions, grouped adoption state, returns and follow-ups. |
| `adoptionDays` | Adoption events, participation, attendance and bookings. |
| `refuge` | Refuge zones and stays. |
| `care` | Care tasks, schedules and completion state. |
| `sponsorships` | Sponsorship identities, contributions and payment notes. |
| `activities` | Activity/bill records and their document references. |
| `emails` | Shared reminder identities, acknowledgements and templates. |
| `partners` | Reusable partner venues and their contact/location data. |
| `settings` | Shared register configuration, privacy/retention policy and membership administration. |

These are coarse feature locks, not one lock per animal/family. Two animal editors block one another; editing animal details and updating family contact details can proceed together. A command writing several features requests the complete lock set atomically, before enabling its form. Do not acquire only a page's nominal feature and mutate other tables under it.

Examples of command scopes, to finalize against actual use-case effects:

| Action | Required write locks |
| --- | --- |
| Edit animal details | `animals`; also `settings` only if the action changes the shared appearance catalog. |
| Edit family contact/capacity or add family holiday | `families`. |
| Create/update adopter contact | `adopters`. |
| Begin/end foster placement | `families` + `animals` for placement/history; add `refuge` if closing/opening a refuge stay. |
| Adopt using an existing adopter | `adoptions` + `animals`; add `families`, `refuge` or `adoptionDays` when updating those records. Merely reading adopter contact does not require its edit lock. |
| Adopt with a new adopter | The adoption scope plus `adopters`. |
| Record care | `care` + `animals` when the operation also changes animal fields/history. |
| Update sponsorship | `sponsorships`; add `animals` if animal history is appended. |
| Confirm booking, transfer or return | Union of the feature owners whose rows the workflow actually writes. |
| Import, soft delete, restore, cleanup | Union of the affected write scopes, including any explicitly changed references. Import preview takes no lease. |

Validate this registry against every use case before implementation is complete. Derived fields such as animal status should be calculated rather than persisted as extra writes. Avoid incidental writes to shared settings on every animal save: accumulate appearance suggestions locally or publish catalog changes as a separate `settings` action if appropriate.

Read dependencies do not automatically acquire edit locks: refresh them and revalidate the entire command at publication. If another feature changes a prerequisite, the publication ETag fails and the command is checked again against the newest snapshot. A dependency that must remain fixed throughout editing belongs in the action's lock set. This preserves independent editing while protecting capacity, location, species and referential constraints.

### Acquisition, renewal and publication without lost updates

This is a proposed protocol pending real API tests:

1. Read a coherent control representation and ETag. Resolve the command's complete feature scope. In one conditional update, acquire all required available/expired leases, preserving the head and every other user's lease. If any required feature is busy, acquire none and show the affected feature. Never wait indefinitely while holding a partial lock set.
2. Fetch and verify the committed snapshot after acquisition, then enable editing. Record each acquired feature revision, generation and token. Serialize local heartbeats, saves and navigation across windows. If a workflow expands its scope, acquire the complete enlarged set atomically; on contention preserve the draft, release the current set and require a reviewed retry rather than deadlocking another editor.
3. Renew the owned set without replacing another session's entries. Proposed starting values: heartbeat every 15 seconds, expiry after 2 minutes without successful renewal. Use provider time where available and conservative safety margins. Clock changes, sleep, background throttling or uncertain connectivity freeze submission and preserve protected drafts. End abandoned sessions after an inactivity warning.
4. On Save, reread control and the latest committed snapshot. Verify all required tokens/generations and feature base revisions. Apply only the typed command/owned-field changes to that latest dataset, then revalidate all read dependencies and business invariants. **Never upload an old whole-register form snapshot:** it would discard independent feature edits even if both editors held valid locks. Generate stable operation/entity IDs for retries and avoid side effects during replay.
5. Upload needed objects and one immutable signed candidate snapshot. Publish through a conditional update to the same control object, updating the head/global revision, incrementing only touched feature revisions and releasing only this session's leases. Preserve all unrelated leases, revisions and current data.
6. If an unrelated edit, acquisition or heartbeat changes the ETag first, refetch and retry with bounded backoff. While this session still owns the same feature set, rebuild the candidate on the latest head and revalidate rather than asking the user to resolve an automatic-merge conflict. If a dependency is now invalid, explain it and preserve the draft; if an owned lease/revision changed, stop and require reacquisition/review. Never bypass the conditional write.
7. A successful pointer change publishes the whole multi-feature workflow atomically. Distinguish uploading from confirmed saving. On an ambiguous response, inspect committed operation receipts before repeating the command. Cancel/navigation conditionally releases only matching owned tokens. A stale save/release cannot clear or overwrite a newer owner's leases.

Example: Alice edits an animal while Bob changes a family phone number. Bob saves first. Alice's save applies her animal command to the latest snapshot containing Bob's phone edit and publishes both. If Alice's workflow instead starts a foster placement, it also needs `families` and waits until Bob releases it.

Admin release invalidates only the targeted acquisition group, advancing its feature generations and preserving other editors. Membership revocation is a separate security event that can invalidate all sessions through the membership epoch. Cleanup/purge must not advance unrelated feature generations just because it publishes a new global snapshot.

**Feasibility gate:** prove coherent reads and conditional content writes on the actual Drive API/client. The RxDB implementation uses Drive v2 ETags; a v3 version indicator alone is not proof. Test exactly one winner for the same feature, simultaneous success for disjoint features after retry, atomic multi-feature acquisition, independent-save preservation, heartbeat contention, lease expiry, delayed/ambiguous saves and targeted admin release. If safe conditional publication cannot be demonstrated, do not claim feature isolation works.

Poll published head and feature statuses on startup, while active and on manual refresh, with backoff and no webhook hosting. Readers keep access while features are edited. Refresh published changes without resetting another feature's dirty form. Missing keys or invalid snapshots produce an incomplete/read-only state. Offline drafts must reacquire their feature set, refresh and be reviewed before submission.

### Shared edit behavior across all pages

Default every shared screen to reading. Reuse an `EditSessionProvider`/hook with a feature scope and shared `EditActions`/`EditGuard` controls using existing UI primitives. Only actions requiring a busy feature are disabled; unrelated sections and navigation stay available. Validate command scope and lease ownership in main/application code too, rather than trusting the renderer's requested scope.

Provide Save/Cancel, dirty-navigation handling, per-feature editor status and `reading`, `acquiring`, `editing`, `saving`, `blocked`, `lease-lost` states. A multi-feature form identifies its full scope. Losing any required lease freezes the transaction and preserves the draft. Never steal a healthy feature lease merely because a different user clicks Edit.

Cover dashboard shortcuts, animal details/history/photos/health, family/holiday/placement forms, adopters/adoptions, refuge, events/bookings, care completion, sponsorships, activities/documents, email acknowledgements, imports, settings and Trash/Restore. Shared mutations behind quick buttons use the same acquire-refresh-validate-commit-release path. Local filters/paths, file exports without shared acknowledgement changes and demo/local datasets do not require shared feature leases.

Background profile recalculation should be derived or use `animals`; reminder persistence uses `emails` plus any written dependencies. Attachment staging belongs to the active operation and its scope. Read-only page loads must not write shared state. Audit every direct save/IPC handler and assert actual write footprints fit the declared feature set.

## Soft deletion and delayed cleanup

Use application-level soft deletion, separate from Drive trash. Proposed configurable recovery window: **30 days**, pending product preference. Until this is implemented, no retention setting or actual deletion changes.

Store deletion metadata in the shared persistence envelope keyed by entity type and UUID: `deletedAt`, opaque `deletedBy`, and `purgeAfter`. Apply the PII classification to actor labels/reasons. Soft delete holds the deleted record’s feature lease and any additional features whose references are changed: hide the record from active lists, selectors and counts, retain its payload for recovery, and expose it in a Trash view with the purge deadline. Restore before the deadline acquires the affected feature set and revalidates current domain constraints.

Reject deletion that would leave an active placement, adoption, booking or required relationship dangling, or require an explicit validated multi-record action resolving those dependencies. Completed/adopted/deceased are lifecycle states, not deletion. Historical references must be deliberately removed or anonymized before permanent payload deletion; never silently cascade through unrelated contacts/animals.

Cleanup runs opportunistically on startup and periodically while an authorized app is open. It plans the affected feature set, acquires that set only when available, reloads current state, selects overdue records and rechecks references. Busy features are skipped for a later batch; unrelated editors keep working. Eligibility begins at the deadline; execution may be later when all apps are closed, access is unavailable or a file owner has not connected. Show last cleanup, pending items and failures. An explicit Run cleanup action uses the same pathway.

Permanent removal has two recoverable phases:

1. Publish a sanitized snapshot that removes expired payloads and unneeded personal links while retaining only non-payload UUID/type purge markers and an updated purge generation, incrementing only the affected feature revisions. Keep no names, reasons or plaintext hashes in those markers. Record an idempotent deletion job for obsolete snapshot/attachment file IDs. A crash before publication leaves the old state intact; a crash after publication resumes the job.
2. Delete unreferenced attachment objects and every app-managed historical snapshot/command copy that still contains the purged payload. Verify current references before each batch, renew the affected feature leases and stop if any is lost. Cross-feature shared objects require all relevant owner/reference scopes; skip deletion if the scope is uncertain. Exclude the current head, snapshots pinned by any active edit session and in-flight work from physical deletion. A historical snapshot containing expired PII but still pinned remains visibly pending until its session ends; do not disrupt unrelated editors. Clean orphan candidates only after these checks. Keep the verified current snapshot available. Mark physical deletion complete only after Drive confirms all deletable copies; permissions/retry failures remain visible.

Do not restore a pre-purge snapshot into the active register without applying the current purge markers. A stale device must refresh current data, purge markers and feature generations before any edit; old drafts referencing purged UUIDs are rejected rather than resurrecting records. Restoration after purge is not a normal Trash action.

Drive trash is not permanent deletion. File deletion permissions differ from edit permissions: check `capabilities.canDelete` and ownership for snapshots and attachments created by **each of the five accounts**. In ordinary My Drive folders, the folder owner must not be assumed able to permanently delete another member's uploads. Route pending deletions to an authorized/owning desktop, or select a suitable shared-drive ownership setup if available. This is a second feasibility gate for the promised cleanup behavior. See [Google's deletion guide](https://developers.google.com/workspace/drive/api/guides/delete).

Backups need a bounded retention policy too; soft deletion plus current-row removal does not erase old PII from backups or other devices' caches/exports. Purge app-managed copies when they next synchronize and expire backups according to the documented schedule. Report the recovery-window deadline separately from confirmed physical removal. No claim of deletion from independently saved/exported copies is possible.

## Encryption, invitations and recovery

Encrypt only classified PII blocks and PII-bearing/unreviewed attachments before upload, with a random register PII key per membership epoch, AES-256-GCM, fresh 96-bit nonces and 128-bit tags. Authenticate register/object IDs, field paths, object kind, privacy-policy version, epoch and a digest of the clear context before parsing private content. Sign clear and encrypted content together to prevent substitution or changes to attachment privacy flags. The [Node crypto API](https://nodejs.org/api/crypto.html) provides primitives; choose a documented key-wrapping construction and test vectors in the security spike. Do not invent cryptographic algorithms.

Devices generate separate signing and key-agreement keys. The owner verifies a device fingerprint through a separate trusted channel, signs enrollment and wraps the register key for that device. Folder sharing alone never discloses a plaintext key. Exchange invitation packages manually if needed; no invitation service is required.

Protect private keys, register keys and OAuth tokens with OS-backed Electron `safeStorage`. Apply the same field classification to cache, outbox, drafts, reminders and document metadata; never persist the fully decrypted mixed dataset as a plain cache. Operational fields can remain readable. Tokens and private keys are technical secrets and remain protected separately from PII. Linux `basic_text` offers no effective key protection: use session-only persistence or an explicit unlock secret. See [Electron's notes](https://github.com/electron/electron/blob/main/docs/api/safe-storage.md). Keep cryptography, secrets and network access in main behind the preload bridge.

Maintain an association recovery package outside Drive, containing necessary keys, register fingerprint and instructions; test on a new machine. Account access alone cannot recover encrypted data after every key is lost. Keep contacts and PII-bearing original document names encrypted; redact payloads/tokens from logs. Drive still exposes sizes, activity times and sharing metadata.

Removal requires an owner-signed membership event, removal of Drive access and a new data-key epoch distributed to remaining devices. Perform membership changes under `settings` with current-revision validation. Bind security updates to the committed head and advance the membership epoch to invalidate existing acquisitions, preserving unrelated data. Reject old-epoch submissions; offline clients refresh membership before requesting a new lease. Never trust device timestamps. Rotation protects new writes once clients learn the epoch; revocation is not instantaneous on disconnected devices and cannot erase old keys/downloads.

Keep an independent backup outside the shared folder/account, including attachments and retained signed snapshots with the same selective PII protection. Whole-archive encryption can be optional rather than required for operational data. A member's desktop can create it when used. Test account loss, corruption and deletion. Apply the soft-delete and cleanup retention policy to historical snapshots and backups. CSV/email exports are explicit plaintext outputs.

## Integration and delivery

| Existing area | Required change |
| --- | --- |
| `application/ports/datasetRepository.ts` | Preserve local load/save; add shared load/acquire-set/renew-set/commit/release-set and cleanup contracts with typed per-feature errors. |
| `application/mutateDataset.ts` and use cases | Reuse clone/validate/publish behavior; add command-to-feature scopes, lease-set guards, rebasing typed changes onto current data, per-feature revisions, idempotent receipts and deletion/reference rules. |
| `main/main.ts`, preferences and IPC | Centralize all shared writes, session lifecycle and protected draft storage. Cover direct saves, background profile updates, reminders, imports and attachments. |
| Shared storage adapter | Implement selective PII codecs, staged snapshots, conditional control publication preserving unrelated leases/changes, resumable scoped cleanup and per-file ownership tracking. |
| Renderer/preload | Introduce scoped edit-session controls across all page actions plus Trash/Restore/cleanup status. Follow existing UI guidance; expose no tokens or keys. |

Delivery sequence:

1. **Two-account feasibility spike:** prove shared-file discovery, OAuth scopes and conditional control-file content updates. Test same-feature exclusion, disjoint-feature acquisition, independent-save preservation and stale saves after feature takeover. Check deletion rights for files created by both accounts; document any dependence on an uploader returning online. Complete this before a broad UI rework.
2. **Classification/security boundary:** inventory persisted fields and derived copies; implement the typed clear/PII codec, signing/key wrapping, invitations and recovery. Test that allowed operational fields remain readable and synthetic PII never leaks through files, metadata or logs.
3. **Snapshot/lease engine:** test acquire/renew/release of feature sets, contention/retries, sleep, disconnection, failed/ambiguous saves, idempotency, multi-window requests, targeted release and recovery. Ensure disjoint saves preserve one another, cross-feature dependency changes are revalidated, stale writers cannot publish and multi-feature actions appear atomically.
4. **Shared edit UX:** add reusable controls and cover every page/quick action in the audit above. Add main-process guards alongside UI checks. Test that overlapping feature actions block while unrelated editing and browsing continue, local/demo use remains functional and drafts survive lease loss. Run lint, typecheck, relevant DOM tests and build for renderer changes.
5. **Deletion and cleanup:** implement Trash/Restore, configurable delay, reference checks, sanitized publication and resumable physical deletion. Test undo before the deadline, expired restore, purge crashes, cleanup alongside unrelated editing and deferral for busy/pinned data, permission failures, shared attachments and stale-client resurrection attempts.
6. **Migration/pilot:** import a verified copy of a closed local register as a selectively protected snapshot, preserving UUIDs, model/schema versions, settings, documents and history. Inventory preference-only PII; retain the original local copy as a separate history. Pilot with about five users and rehearse lease recovery, cleanup, key recovery and bounded backups. Run existing checks and shared-storage integration tests.

No Google account, permission, production record or page behavior is changed by this documentation. No hosting is required. The first implementation milestone is the conditional-write/deletion-rights feasibility spike, followed by the per-feature edit-session boundary.
