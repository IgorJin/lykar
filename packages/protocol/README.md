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

`setStyle` accepts an optional `priority: 'important'` (or `''`); older
operations without `priority` remain valid. An empty `value` removes the inline
declaration. `!important` is not embedded in `value`.

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

Append-only editor history can also relate a new command to the command it
revises. `revision.previousOperationId` points to an earlier operation and
`revision.reason` is either `undo` or `target-repair`. Manifest validation
rejects missing, self, and forward revision references. Undo and repair never
delete or rewrite the previous operation, so already published Release bytes
remain reproducible.

## Replay dependencies and created-node references

Operations may declare ordered prerequisites with `dependsOn`. Every dependency
must name an earlier operation in the same manifest. A created element or text
node is addressed without serializing a DOM object:

```json
{
  "target": {"nodeRef": {"operationId": "insert-card", "path": [0, 1]}},
  "dependsOn": ["insert-card"]
}
```

`path` contains child indexes in the serialized `insertNode` tree; an empty path
means its root. Validation requires the referenced insertion to be an explicit
dependency and rejects forward, missing, duplicate, or structurally invalid
references. Legacy manifests without `dependsOn` or `nodeRef` remain valid.

Protocol validation is bounded before replay: a manifest is at most 512 KiB and
1,000 operations; serialized nodes are limited to 32 levels and 5,000 nodes;
each operation has at most 64 dependencies. The exported `PROTOCOL_LIMITS`
object is the canonical hard-limit list.
