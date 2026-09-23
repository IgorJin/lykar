export { EditorPersistenceError, LykarEditor, startEditor } from './editor.js';
export type { EditingCapability, EditorCommitResult, EditorDraftPersistence, LykarEditorOptions } from './editor.js';
export { exchangeEditorLaunch, exchangeShareAccess } from './access-client.js';
export type { ShareRuntimeAccess } from './access-client.js';
export { ElementInspector } from './inspector.js';
export { OverlayService } from './overlay.js';
export type { OverlayLayerName } from './overlay.js';
export { DummyProposalProvider } from './proposal.js';
export type { EditorProposal, ProposalProvider } from './proposal.js';
export { EditorSession } from './session.js';
export type {
  EditorApplyBatch,
  EditorApplyReport,
  EditorGroupedPreviewReport,
  GroupedPreviewOperationReport,
  EditorChange,
  EditorPageDraft,
  EditorPageRef,
  EditorSessionState,
  PendingSaveBatch,
} from './session.js';
export {
  buildCssSelector,
  buildTargetDescriptor,
  buildXPath,
  serializeEditableElement,
} from './target-builder.js';
