import type {OperationNodeReferenceV1} from '@lykar/protocol';

export const LYKAR_OPERATION_ATTRIBUTE = 'data-lykar-operation-id';
export const LYKAR_NODE_ATTRIBUTE = 'data-lykar-node-id';

export type ReplayIdentityScope = {
  projectId: string;
  pageId: string;
  releaseId: string;
  draftId?: string;
  generation?: number;
};

export type LedgerNodeHandle = {
  identity: string;
  operationId: string;
  node: Node;
  marker?: Comment;
};

/**
 * Keeps live DOM references in memory while persisting only opaque string
 * markers in the document. Text-node markers are comments because text nodes
 * cannot carry attributes.
 */
export class ReplayLedger {
  private readonly entries = new Map<string, LedgerNodeHandle>();

  constructor(
    private readonly document: Document,
    private readonly root: Document | Element,
    readonly scope: ReplayIdentityScope,
  ) {}

  identity(reference: OperationNodeReferenceV1): string {
    return JSON.stringify([
      this.scope.projectId,
      this.scope.pageId,
      this.scope.releaseId,
      this.scope.draftId ?? null,
      this.scope.generation ?? 0,
      reference.operationId,
      reference.path ?? [],
    ]);
  }

  persistentIdentity(reference: OperationNodeReferenceV1): string {
    return JSON.stringify([
      this.scope.projectId,
      this.scope.pageId,
      this.scope.releaseId,
      reference.operationId,
      reference.path ?? [],
    ]);
  }

  register(reference: OperationNodeReferenceV1, node: Node, marker?: Comment): LedgerNodeHandle {
    const handle = {
      identity: this.identity(reference),
      operationId: reference.operationId,
      node,
      ...(marker ? {marker} : {}),
    };
    this.entries.set(handle.identity, handle);
    return handle;
  }

  markerForText(reference: OperationNodeReferenceV1): Comment {
    return this.document.createComment(`lykar-node:${hex(this.persistentIdentity(reference))}`);
  }

  markElement(reference: OperationNodeReferenceV1, element: Element, rootInsertion = false): void {
    element.setAttribute(LYKAR_NODE_ATTRIBUTE, this.persistentIdentity(reference));
    if (rootInsertion) element.setAttribute(LYKAR_OPERATION_ATTRIBUTE, reference.operationId);
  }

  resolve(reference: OperationNodeReferenceV1): LedgerNodeHandle | null {
    const key = this.identity(reference);
    const existing = this.entries.get(key);
    if (existing && this.isOwnedAndConnected(existing)) return existing;

    const recovered = this.recover(reference);
    if (recovered) this.entries.set(key, recovered);
    return recovered;
  }

  hasInsertion(operationId: string): boolean {
    return this.resolve({operationId, path: []}) !== null;
  }

  forgetOperation(operationId: string): void {
    for (const handle of this.entries.values()) {
      if (handle.operationId === operationId) {
        this.entries.delete(handle.identity);
      }
    }
  }

  isWithinRoot(node: Node): boolean {
    if (!node.isConnected) return false;
    if (this.root.nodeType === 9) return node.ownerDocument === this.document;
    return node === this.root || this.root.contains(node);
  }

  private recover(reference: OperationNodeReferenceV1): LedgerNodeHandle | null {
    const persistent = this.persistentIdentity(reference);
    const elements = this.root.nodeType === 1
      ? [this.root as Element, ...Array.from(this.root.querySelectorAll(`[${LYKAR_NODE_ATTRIBUTE}]`))]
      : Array.from(this.root.querySelectorAll(`[${LYKAR_NODE_ATTRIBUTE}]`));
    const element = elements.find(candidate => candidate.getAttribute(LYKAR_NODE_ATTRIBUTE) === persistent);
    if (element) return {identity: this.identity(reference), operationId: reference.operationId, node: element};

    const markerData = `lykar-node:${hex(persistent)}`;
    const walker = this.document.createTreeWalker(this.root, this.document.defaultView?.NodeFilter.SHOW_COMMENT ?? 128);
    let current = walker.nextNode();
    while (current) {
      if (current.nodeValue === markerData && current.nextSibling?.nodeType === 3) {
        return {
          identity: this.identity(reference),
          operationId: reference.operationId,
          node: current.nextSibling,
          marker: current as Comment,
        };
      }
      current = walker.nextNode();
    }
    return null;
  }

  private isOwnedAndConnected(handle: LedgerNodeHandle): boolean {
    return this.isWithinRoot(handle.node)
      && (!handle.marker || (this.isWithinRoot(handle.marker) && handle.marker.nextSibling === handle.node));
  }
}

function hex(value: string): string {
  return Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, '0')).join('');
}
