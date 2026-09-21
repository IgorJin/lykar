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

## TargetRegistry V1

`TargetRegistrySnapshotV1` is the immutable release-side representation of
logical targets. A target owns a stable ID plus `projectId`, `pageId`, and a
named document/element root. Bindings are append-only and addressed by the full
tuple `(targetId, environment, bindingVersion)`; the storage boundary is
`TargetRegistryStoreV1`.

A registry-backed operation pins that tuple in `target.binding`. Its Release
must include the exact binding in `targetRegistry` and declare one matching
`targetEnvironment`. Validation rejects missing versions, cross-page targets,
and mixed environments, so changing a later binding cannot change old Release
bytes or replay behavior.

Legacy `TargetDescriptor` values containing `marker`, `selectors`, and optional
`fingerprint` remain valid without a registry. This is the compatibility path
for existing drafts and Releases. New authoring may migrate incrementally by
creating a logical target and then emitting a descriptor with `binding`; it
must not reinterpret an old descriptor as a mutable "latest" binding.

Mutable facts are deliberately outside locator identity. New operations put
captured hashes/attributes/styles in `precondition.before` and the intended
post-operation facts in `desiredState`. This lets `setText` change text without
making the target itself unresolvable. The legacy `precondition.textHash` and
`fingerprint.textHash` fields remain accepted for old manifests.

Manual repair uses `appendTargetBindingV1`: it creates the next environment-
specific binding version and a new snapshot without mutating the previous
snapshot. A repaired Draft/Release must point at the returned reference; an old
Release continues to carry its original bytes and binding version.
