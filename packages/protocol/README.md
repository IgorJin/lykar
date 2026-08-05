# Protocol

Versioned, serializable operations shared by the editor, runtime, SDK, and API.

Version 1 covers the static-page MVP:

- `setText`
- `setStyle`
- `insertNode`
- `removeNode`
- `moveNode`

Copy is persisted as `insertNode` with a sanitized serialized snapshot. Runtime
validation in this package verifies shape and targeting data; HTML/CSS security
policy remains the responsibility of the release compiler.
