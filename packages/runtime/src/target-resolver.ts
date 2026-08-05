import type { TargetDescriptor, TargetFingerprint } from '@lykar/protocol';

import { matchesSha256 } from './hash.js';
import type { TargetStrategy } from './types.js';

export type TargetResolution = {
  element: Element | null;
  strategy?: TargetStrategy;
  issues: string[];
};

async function matchesFingerprint(element: Element, fingerprint?: TargetFingerprint): Promise<boolean> {
  if (!fingerprint) return true;

  if (fingerprint.tag && element.tagName.toLowerCase() !== fingerprint.tag.toLowerCase()) {
    return false;
  }

  if (fingerprint.attributes) {
    for (const [name, value] of Object.entries(fingerprint.attributes)) {
      if (element.getAttribute(name) !== value) return false;
    }
  }

  if (fingerprint.textHash && !await matchesSha256(element.textContent ?? '', fingerprint.textHash)) {
    return false;
  }

  return true;
}

function markerCandidates(document: Document, marker: string): Element[] {
  return Array.from(document.querySelectorAll('[data-lykar-id]'))
    .filter(element => element.getAttribute('data-lykar-id') === marker);
}

function cssCandidates(document: Document, selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector));
}

function xpathCandidates(document: Document, xpath: string): Element[] {
  const XPathResultConstructor = document.defaultView?.XPathResult;
  if (!XPathResultConstructor) throw new Error('XPath is unavailable in this document');
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResultConstructor.ORDERED_NODE_SNAPSHOT_TYPE,
    null,
  );
  const elements: Element[] = [];

  for (let index = 0; index < result.snapshotLength; index++) {
    const node = result.snapshotItem(index);
    if (node?.nodeType === 1) elements.push(node as Element);
  }

  return elements;
}

export async function resolveTarget(
  document: Document,
  target: TargetDescriptor,
): Promise<TargetResolution> {
  const issues: string[] = [];
  const locators: Array<{ strategy: TargetStrategy; read: () => Element[] }> = [];

  if (target.marker) {
    locators.push({ strategy: 'marker', read: () => markerCandidates(document, target.marker!) });
  }
  if (target.selectors?.css) {
    locators.push({ strategy: 'css', read: () => cssCandidates(document, target.selectors!.css!) });
  }
  if (target.selectors?.xpath) {
    locators.push({ strategy: 'xpath', read: () => xpathCandidates(document, target.selectors!.xpath!) });
  }

  for (const locator of locators) {
    let candidates: Element[];
    try {
      candidates = locator.read();
    } catch (error) {
      issues.push(`${locator.strategy} locator is invalid: ${errorMessage(error)}`);
      continue;
    }

    if (candidates.length === 0) {
      issues.push(`${locator.strategy} locator matched no elements`);
      continue;
    }

    for (const candidate of candidates) {
      try {
        if (await matchesFingerprint(candidate, target.fingerprint)) {
          return { element: candidate, strategy: locator.strategy, issues };
        }
      } catch (error) {
        issues.push(`${locator.strategy} fingerprint failed: ${errorMessage(error)}`);
        break;
      }
    }

    issues.push(`${locator.strategy} candidates did not match the fingerprint`);
  }

  return { element: null, issues };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
