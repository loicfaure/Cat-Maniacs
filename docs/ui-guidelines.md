# Shared application UI

The renderer has one stylesheet: [`src/renderer/styles.css`](../src/renderer/styles.css), imported once by `main.tsx`. The `:root` tokens define the app's palette, fonts, spacing, radii, control sizes, shadows and focus treatment. The shared component rules follow them; screen-specific rules then arrange domain content. Update the shared rule or token when changing a common pattern so every screen benefits.

Reusable React components live in [`src/renderer/ui.tsx`](../src/renderer/ui.tsx). Use them for new screens and changes to existing screens; the renderer's `AGENTS.md` makes this the default for future development.

| Need | Shared pattern |
| --- | --- |
| Page layout | `page-stack`, `PageHeader`, `Panel` |
| List filters | `FilterBar` with labeled `Field` controls; `SpeciesFilter` for species choices |
| Actions | `Button` with `variant`, `size`, and `fullWidth` |
| Forms | `form-grid` or `stack-form`, `Field`, `FieldGroup`, `FormActions` |
| Selection | `Checkbox`, `checks`, `option-list` |
| Search | `SearchField` with an accessible label and optional trailing result count |
| Searchable suggestions | `SearchSelect`: filtered options, keyboard selection, unknown/custom values |
| Dates and date-times | `DateInput` (`date`) and `DateTimeInput` (`datetime-local`); keep native pickers |
| Record/location navigation | `RecordLink` with mouse and keyboard activation |
| Status | `Badge` with `neutral`, `success`, `warning`, `danger`, or `info` tone |
| Inline explanation/error | `Callout` with a semantic tone |
| Notifications | `Notification`; shared 30-second timeout, manual dismissal, status/alert semantics |
| Empty results | `Empty` |
| Tables | `table-wrap` and native table elements; shared header, row, hover and divider rules |

```tsx
import { Button, Field, FormActions, PageHeader, Panel } from "./ui";

<div className="page-stack">
  <PageHeader><p>Gérez les informations de votre registre.</p></PageHeader>
  <Panel title="Informations">
    <form className="form-grid" onSubmit={save}>
      <Field label="Nom *"><input name="name" required /></Field>
      <FormActions>
        <Button type="button" variant="secondary" onClick={cancel}>Annuler</Button>
        <Button type="submit" variant="primary">Enregistrer</Button>
      </FormActions>
    </form>
  </Panel>
</div>
```

`Button` forwards native button attributes and preserves native form behavior. Declare `type="button"` for actions inside forms and `type="submit"` for their submit action. A navigation link remains an anchor and can use the shared `button` classes.

Use `FieldGroup` for checkbox collections or multiple controls. It renders a fieldset and legend rather than wrapping other labels in a label. `Checkbox` associates its description automatically; use `layout="row"` for explained settings and `trailing` for a status badge. Native checkboxes and radios always get the common sizing, including controls outside these components.

Page-specific CSS may define geometry, scrolling, image cropping, resizable columns, or domain visualizations. Use shared tokens for appearance. For a compact container, override inherited `--panel-padding`, `--panel-heading-size`, and `--panel-heading-gap` rather than copying panel rules. Add a reusable component or variant when the same pattern appears again.

Dynamic values such as photo crop coordinates are passed as CSS custom properties. The stylesheet owns `object-position`, grid definitions, and responsive overrides. Extra stylesheets, embedded style tags, and inline presentation declarations are checked by `uiArchitecture.test.ts`.

Validate changes with `npm run lint`, `npm run typecheck`, renderer tests and `npm run build`. DOM tests cover field associations, native form behavior, settings safeguards and notification timing; stylesheet checks cover the single entry point and shared control rules. Visual review is still useful for substantial layout changes.

Animal tables place the species emoji in a dedicated species column, with a French tooltip and accessible label. Shared animal identity links contain only the animal name. Single-species registers continue to hide the redundant column.

Animal creation and editing use independent age and special-needs fields. Special needs is free text, weight is optional in kilograms, and adoptability offers Oui/Non/Inconnu with a required reason textarea for Non. Breed/taxon and coat/scales use species-specific suggestion catalogs; the mixed checkbox reveals a second optional value, and a blank value means unknown. New saved values are remembered per species in the register.
