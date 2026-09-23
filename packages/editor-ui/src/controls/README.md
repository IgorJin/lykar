# Editor native controls

These factories create scoped DOM controls without a framework or target state.
`StyleManager` owns the control lifecycle and maps field events to a single
`StyleChange` callback. A focused field opens a transaction; input previews are
throttled to an animation frame; change, Enter, blur, and save flush the last
valid value; Escape cancels the transaction. The caller's EditorSession owns
history, persistence, and compare-and-restore. Destroy cancels pending frames
before detaching the UI. Reads and section expansion never call `onChange`.

Select presets always have a paired raw input. Native color input is only a
swatch: colors it cannot represent remain unchanged in the text field. Number
and unit controls accept raw CSS expressions without parsing them into a guessed
number or unit. Labels are native or provided by `aria-label`; errors stay next
to the input with `aria-invalid` and an alert message.
