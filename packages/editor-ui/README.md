# Editor UI

Framework-independent editor controls and the declarative style catalog used by
the active SDK editor. This package belongs only to the lazy editor asset; it is
not a visitor-runtime dependency.

## Extending the style catalog

Fields live in `src/styles/styles-config.ts`; `StyleManager` renders the catalog
inside the active SDK panel. It sends property/value changes to the editor's
existing preview and history flow. Adding a normal
text field is one config entry plus its section reference:

```ts
input('hyphens', 'Hyphens', 'hyphens', 'raw', 'none, manual or auto')
```

A preset field uses `select(...)`; all selects retain a custom-value path for
valid CSS outside the presets. Color fields use `color(...)`, preserving raw
values such as `rgba()`, `currentColor` and `var(--brand)`. Number/unit fields
declare their units explicitly; unitless properties use `units: []` and
`unitless: true`.

`ui.defaultValue` and `ui.placeholder` are display metadata only. Every field
has `writeOnMount: false`: selecting an element, reading computed style or
opening a section must never write to the DOM or create an operation.

Spacing, radius and border composites decode common authored shorthands for
display, including four-side values and elliptical radii. Editing a part writes
only its corresponding longhand, so existing shorthand and other side/corner
declarations remain intact. Clearing a part removes only that explicit
longhand. When a shorthand is mixed with related longhands, the raw shorthand
field refuses a replacement that could overwrite the mixed values. Unknown or
ambiguous shorthand syntax stays in the raw field; the part controls remain
independent longhand edits.

Stack fields retain a full raw value and provide conservative layer lists.
Background layers split only on top-level commas, while transform functions
split only on top-level whitespace; nested functions and quoted text remain
intact and order is preserved. If a background shorthand is mixed with explicit
`background-*` longhands, changing the shorthand is blocked with a hint so it
cannot silently reset those declarations. Full per-layer position/size/color
controls and an atomic UI flow that preserves mixed background longhands remain
open. Virtual parts are schema metadata; for example `shadow-x` affects
`box-shadow`, but is not itself a CSS property and must never be emitted as an
independent `setStyle` operation. `StyleFieldState` keeps authored and computed
values separate and carries priority, dirty state, validation, affected
properties and applicability hints.

Advanced mode is deliberately open-ended. It accepts any CSS declaration the
target browser accepts and preserves the case of custom properties beginning
with `--`; the catalog is a discoverability layer, not a protocol allowlist.
The per-field Delete button removes the inline declaration; Restore original
uses the EditorSession history to reinstate the value and priority from before
Lykar's first operation on that field. Undo restores the previous edit. The UI
exposes `!important` separately from the CSS value.

`legacy-style-coverage.ts` maps every active legacy `STYLES_LIST` key and the
capabilities hidden in its commented sections. The schema test fails if a
legacy key is removed from coverage, a field/section reference is broken, a
virtual part becomes serializable, or a unitless field accidentally gains px.
