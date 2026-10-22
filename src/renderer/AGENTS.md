# Shared renderer UI

Use the existing app style automatically for every new screen and control.

- `styles.css` is the only application stylesheet. Import it once, in `main.tsx`. Do not add CSS modules, CSS-in-JS, extra stylesheets, `<style>` tags, or hardcoded inline presentation styles.
- Reuse `ui.tsx`: `Button`, `PageHeader`, `FilterBar`, `Panel`, `Field`, `FieldGroup`, `Checkbox`, `SearchField`, `FormActions`, `Badge`, `Callout`, `Notification`, and `Empty`. Use `SpeciesFilter` from `speciesPresentation.tsx` for species filters. Extend a shared component when a pattern recurs instead of making a page-specific copy.
- Define shared colors, typography, spacing, radii, control sizes, and focus states in the `:root` tokens and shared-component section of `styles.css`. Page selectors arrange domain content; they must not reinvent standard controls.
- Use `page-stack` for pages, `PageHeader` for introductory text/actions, and `Panel` for sections. Use `form-grid` or `stack-form`, `Field` for a single control, `FieldGroup` for groups, and `FormActions` for submit/cancel controls. Never nest labels.
- Use native input elements inside the shared field components. Checkbox/radio sizing and disabled/focus states are global and must work outside Settings too.
- Use `DateInput` and `DateTimeInput` for native pickers, `SearchSelect` for editable suggestions, and `RecordLink` for record/location navigation. In animal tables, use the shared species header/cell components; never append species to an animal name. Special-needs notes are separate from age categories.
- Use shared semantic badge/callout tones. Notifications dismiss after 30 seconds. Preserve meaningful status text and accessible names; color alone is insufficient.
- Inline React styles are reserved for dynamic CSS custom properties such as crop coordinates and resizable column proportions. Keep their actual CSS properties and responsive behavior in `styles.css`.
- Keep specialized navigation, health tiles, photo-cropping behavior, and domain layouts where appropriate; use the shared tokens for their appearance.
- Read `../../docs/ui-guidelines.md` for examples. Validate renderer changes with lint, typecheck, relevant DOM tests, and a build. Keep the renderer style architecture checks passing.
