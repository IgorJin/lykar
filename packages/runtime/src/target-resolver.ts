import type {
  LocatorTargetDescriptor,
  TargetDescriptor,
  TargetEnvironment,
  TargetFingerprint,
  TargetRegistrySnapshotV1,
} from '@lykar/protocol';

import { matchesSha256 } from './hash.js';
import type { TargetStrategy } from './types.js';

export type TargetResolutionStatus = 'unique' | 'missing' | 'ambiguous' | 'invalid';

export type TargetResolutionReason =
  | 'UNIQUE_CANDIDATE'
  | 'NO_CANDIDATES'
  | 'FINGERPRINT_MISMATCH'
  | 'LOCATOR_INVALID'
  | 'MULTIPLE_CANDIDATES'
  | 'BINDING_REGISTRY_REQUIRED'
  | 'BINDING_NOT_FOUND'
  | 'BINDING_ENVIRONMENT_MISMATCH'
  | 'TARGET_SCOPE_MISMATCH'
  | 'ROOT_NOT_UNIQUE';

export type TargetResolutionAttempt = {
  strategy: TargetStrategy;
  status: 'matched' | 'missing' | 'rejected' | 'invalid';
  candidateCount: number;
  acceptedCount: number;
  message: string;
};

export type TargetResolutionCandidateEvidence = {
  index: number;
  tag: string;
  strategies: TargetStrategy[];
  attributes: Record<string, string>;
};

export type TargetResolutionEvidence = {
  reason: TargetResolutionReason;
  rootId: string;
  candidateCount: number;
  candidates: TargetResolutionCandidateEvidence[];
  attempts: TargetResolutionAttempt[];
};

export type TargetResolution = {
  status: TargetResolutionStatus;
  element: Element | null;
  strategy?: TargetStrategy;
  evidence: TargetResolutionEvidence;
  candidates: Element[];
  /** @deprecated Read evidence.attempts instead. */
  issues: string[];
};

export type TargetResolutionOptions = {
  root?: Document | Element;
  registry?: TargetRegistrySnapshotV1;
  projectId?: string;
  pageId?: string;
  environment?: TargetEnvironment;
};

async function matchesFingerprint(element: Element, fingerprint?: TargetFingerprint): Promise<boolean> {
  if (!fingerprint) return true;

  if (fingerprint.tag && element.tagName.toLowerCase() !== fingerprint.tag.toLowerCase()) return false;

  if (fingerprint.attributes) {
    for (const [name, value] of Object.entries(fingerprint.attributes)) {
      if (element.getAttribute(name) !== value) return false;
    }
  }

  if (fingerprint.textHash && !await matchesSha256(element.textContent ?? '', fingerprint.textHash)) return false;
  return true;
}

function markerCandidates(root: Document | Element, marker: string): Element[] {
  return Array.from(root.querySelectorAll('[data-lykar-id]'))
    .filter(element => element.getAttribute('data-lykar-id') === marker);
}

function cssCandidates(root: Document | Element, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

function xpathCandidates(document: Document, root: Document | Element, xpath: string): Element[] {
  const XPathResultConstructor = document.defaultView?.XPathResult;
  if (!XPathResultConstructor) throw new Error('XPath is unavailable in this document');
  const result = document.evaluate(
    xpath,
    root,
    null,
    XPathResultConstructor.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  const elements: Element[] = [];

  for (let index = 0; index < result.snapshotLength; index++) {
    const node = result.snapshotItem(index);
    if (node?.nodeType !== 1) continue;
    const element = node as Element;
    if (root.nodeType === 9 || root === element || root.contains(element)) elements.push(element);
  }

  return elements;
}

export async function resolveTarget(
  document: Document,
  target: TargetDescriptor,
  options: TargetResolutionOptions = {},
): Promise<TargetResolution> {
  let descriptor: LocatorTargetDescriptor = target;
  let root = options.root ?? document;
  let rootId = root.nodeType === 9 ? 'document' : 'provided-root';

  if (target.binding) {
    const registry = options.registry;
    if (!registry) return terminal('invalid', 'BINDING_REGISTRY_REQUIRED', rootId, 'Target binding requires a registry snapshot');
    if (options.environment && target.binding.environment !== options.environment) {
      return terminal('invalid', 'BINDING_ENVIRONMENT_MISMATCH', rootId, 'Target binding environment does not match the resolver environment');
    }

    const binding = registry.bindings.find(candidate =>
      candidate.targetId === target.binding!.targetId
      && candidate.bindingVersion === target.binding!.bindingVersion
      && candidate.environment === target.binding!.environment);
    const logicalTarget = registry.targets.find(candidate => candidate.id === target.binding!.targetId);
    if (!binding || !logicalTarget) {
      return terminal('invalid', 'BINDING_NOT_FOUND', rootId, 'The exact target binding is absent from the immutable registry snapshot');
    }
    if (
      (options.projectId && logicalTarget.scope.projectId !== options.projectId)
      || (options.pageId && logicalTarget.scope.pageId !== options.pageId)
    ) {
      return terminal('invalid', 'TARGET_SCOPE_MISMATCH', logicalTarget.scope.root.id, 'Target is outside the requested project/page scope');
    }

    descriptor = binding.descriptor;
    rootId = logicalTarget.scope.root.id;
    if (logicalTarget.scope.root.kind === 'element') {
      const rootResolution = await resolveLocators(document, logicalTarget.scope.root.descriptor, root, rootId);
      if (rootResolution.status !== 'unique') {
        return {
          ...rootResolution,
          evidence: { ...rootResolution.evidence, reason: 'ROOT_NOT_UNIQUE', rootId },
          issues: [`Root ${rootId} did not resolve uniquely`, ...rootResolution.issues],
        };
      }
      root = rootResolution.element!;
    } else if (!options.root) {
      root = document;
    }
  }

  return resolveLocators(document, descriptor, root, rootId);
}

async function resolveLocators(
  document: Document,
  target: LocatorTargetDescriptor,
  root: Document | Element,
  rootId: string,
): Promise<TargetResolution> {
  const attempts: TargetResolutionAttempt[] = [];
  const accepted = new Map<Element, TargetStrategy[]>();
  const locators: Array<{ strategy: TargetStrategy; read: () => Element[] }> = [];

  if (target.marker) locators.push({ strategy: 'marker', read: () => markerCandidates(root, target.marker!) });
  if (target.selectors?.css) {
    locators.push({ strategy: 'css', read: () => cssCandidates(root, target.selectors!.css!) });
  }
  if (target.selectors?.xpath) {
    locators.push({ strategy: 'xpath', read: () => xpathCandidates(document, root, target.selectors!.xpath!) });
  }

  for (const locator of locators) {
    let candidates: Element[];
    try {
      candidates = locator.read();
    } catch (error) {
      attempts.push({ strategy: locator.strategy, status: 'invalid', candidateCount: 0, acceptedCount: 0,
        message: `${locator.strategy} locator is invalid: ${errorMessage(error)}` });
      continue;
    }

    if (candidates.length === 0) {
      attempts.push({ strategy: locator.strategy, status: 'missing', candidateCount: 0, acceptedCount: 0,
        message: `${locator.strategy} locator matched no elements` });
      continue;
    }

    const matches: Element[] = [];
    try {
      for (const candidate of candidates) {
        if (await matchesFingerprint(candidate, target.fingerprint)) matches.push(candidate);
      }
    } catch (error) {
      attempts.push({ strategy: locator.strategy, status: 'invalid', candidateCount: candidates.length, acceptedCount: 0,
        message: `${locator.strategy} fingerprint is invalid: ${errorMessage(error)}` });
      continue;
    }

    attempts.push({
      strategy: locator.strategy,
      status: matches.length > 0 ? 'matched' : 'rejected',
      candidateCount: candidates.length,
      acceptedCount: matches.length,
      message: matches.length > 0
        ? `${locator.strategy} accepted ${matches.length} of ${candidates.length} candidate(s)`
        : `${locator.strategy} candidates did not match the fingerprint`,
    });
    for (const match of matches) {
      const strategies = accepted.get(match) ?? [];
      strategies.push(locator.strategy);
      accepted.set(match, strategies);
    }
  }

  const elements = [...accepted.keys()];
  if (elements.length === 1) {
    return outcome('unique', elements[0], accepted.get(elements[0])![0], 'UNIQUE_CANDIDATE', rootId, attempts, elements, accepted);
  }
  if (elements.length > 1) {
    return outcome('ambiguous', null, undefined, 'MULTIPLE_CANDIDATES', rootId, attempts, elements, accepted);
  }
  if (attempts.some(attempt => attempt.status === 'invalid')) {
    return outcome('invalid', null, undefined, 'LOCATOR_INVALID', rootId, attempts);
  }
  const reason = attempts.some(attempt => attempt.status === 'rejected')
    ? 'FINGERPRINT_MISMATCH'
    : 'NO_CANDIDATES';
  return outcome('missing', null, undefined, reason, rootId, attempts);
}

function terminal(
  status: Exclude<TargetResolutionStatus, 'unique'>,
  reason: TargetResolutionReason,
  rootId: string,
  message: string,
): TargetResolution {
  return outcome(status, null, undefined, reason, rootId, [{
    strategy: 'binding', status: 'invalid', candidateCount: 0, acceptedCount: 0, message,
  }]);
}

function outcome(
  status: TargetResolutionStatus,
  element: Element | null,
  strategy: TargetStrategy | undefined,
  reason: TargetResolutionReason,
  rootId: string,
  attempts: TargetResolutionAttempt[],
  candidates: Element[] = element ? [element] : [],
  strategies = new Map<Element, TargetStrategy[]>(),
): TargetResolution {
  return {
    status,
    element,
    ...(strategy ? { strategy } : {}),
    evidence: {
      reason,
      rootId,
      candidateCount: candidates.length,
      candidates: candidates.map((candidate, index) => candidateEvidence(candidate, strategies.get(candidate) ?? [], index)),
      attempts,
    },
    candidates,
    issues: attempts.filter(attempt => attempt.status !== 'matched').map(attempt => attempt.message),
  };
}

function candidateEvidence(
  element: Element,
  strategies: TargetStrategy[],
  index: number,
): TargetResolutionCandidateEvidence {
  const attributes: Record<string, string> = {};
  for (const name of ['id', 'data-lykar-id', 'data-testid', 'role', 'aria-label']) {
    const value = element.getAttribute(name)?.trim();
    if (value) attributes[name] = value;
  }
  return { index, tag: element.tagName.toLowerCase(), strategies, attributes };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
