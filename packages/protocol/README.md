# Protocol

Versioned, serializable operations shared by the editor, runtime, SDK, and API.

Version 1 covers the static-page MVP:

- `setText`
- `setStyle`
- `setAttribute`
- `removeAttribute`
- `insertNode`
- `removeNode`
- `moveNode`

Copy is persisted as `insertNode` with a sanitized serialized snapshot. Runtime
validation in this package verifies shape and targeting data. The browser
runtime independently enforces the HTML, attribute, URL, and CSS safety policy.
