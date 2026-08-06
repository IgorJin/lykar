export { LykarEditor, startEditor } from './editor.js';
export type { EditingCapability, LykarEditorOptions } from './editor.js';
export { ElementInspector } from './inspector.js';
export { OverlayService } from './overlay.js';
export type { OverlayLayerName } from './overlay.js';
export { DummyProposalProvider } from './proposal.js';
export type { EditorProposal, ProposalProvider } from './proposal.js';
export { EditorSession } from './session.js';
export type {
  EditorApplyBatch,
  EditorApplyReport,
  EditorPageDraft,
  EditorPageRef,
  EditorSessionState,
} from './session.js';
export {
  buildCssSelector,
  buildTargetDescriptor,
  buildXPath,
  serializeEditableElement,
} from './target-builder.js';
