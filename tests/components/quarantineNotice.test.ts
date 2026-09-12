import AsyncStorage from '@react-native-async-storage/async-storage';
import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The notice is React Native UI, and this suite runs in node with no native renderer installed.
// Mocking the primitives to their element names lets the returned element tree be inspected
// directly: it verifies the props the notice is responsible for — the live region, the dismiss
// button's role and handler, the flex layout — without pretending to verify native rendering.
vi.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (sheet: unknown) => sheet },
}));

import {
  QuarantineNotice,
  isQuarantineNoticeVisible,
  type QuarantineReport,
} from '../../src/components/common/QuarantineNotice';
import {
  getQuarantinedTrackingEntries,
  initializeAppStore,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  createInitialState,
} from '../../src/store/persistence';
import { makeAppState, makeTrackingEntry } from '../helpers/builders';

const noticeColors = { surface: '#FFFFFF', text: '#111111', primary: '#2F6FED' };

function propsOf(element: ReactElement): Record<string, unknown> {
  return element.props as Record<string, unknown>;
}

/** Every element in the tree, depth first, so assertions can name what they are looking for. */
function collectElements(node: unknown, found: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, found));
    return found;
  }
  if (!isValidElement(node)) return found;
  found.push(node);
  collectElements(propsOf(node).children, found);
  return found;
}

function elementsOfType(tree: unknown, type: string): ReactElement[] {
  return collectElements(tree).filter((element) => element.type === type);
}

function textOf(element: ReactElement): string {
  return collectElements(propsOf(element).children)
    .concat(element)
    .filter((candidate) => candidate.type === 'Text')
    .map((candidate) => String(propsOf(candidate).children))
    .join('');
}

/** An entry that cannot be read back: stopTracking used to write endTime before startTime. */
function unreadableEntry(id: string) {
  return makeTrackingEntry({
    id,
    startTime: '2026-03-02T12:00:00.000Z',
    endTime: '2026-03-02T11:00:00.000Z',
  });
}

async function hydrateWithUnreadableEntries(ids: readonly string[]): Promise<QuarantineReport> {
  await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
    state: makeAppState({ trackingEntries: ids.map(unreadableEntry) }),
    version: CURRENT_SCHEMA_VERSION,
  }));
  await initializeAppStore({ force: true });
  return getQuarantinedTrackingEntries();
}

beforeEach(async () => {
  useAppStore.setState(createInitialState());
  await AsyncStorage.clear();
  vi.clearAllMocks();
});

describe('when the quarantine notice is shown', () => {
  it('reports a second, different quarantine event after the first was dismissed', async () => {
    const firstReport = await hydrateWithUnreadableEntries(['entry-corrupt-a']);
    expect(firstReport.map((entry) => entry.id)).toEqual(['entry-corrupt-a']);
    expect(isQuarantineNoticeVisible(firstReport, null)).toBe(true);

    // The user dismisses that notice. Nothing unmounts — this is the same mounted session.
    const dismissed: QuarantineReport = firstReport;
    expect(isQuarantineNoticeVisible(firstReport, dismissed)).toBe(false);

    // A later forced rehydrate sets a *different* record aside. The side-car write happens either
    // way; the question this covers is whether the user is told about it.
    const secondReport = await hydrateWithUnreadableEntries(['entry-corrupt-b']);
    expect(secondReport.map((entry) => entry.id)).toEqual(['entry-corrupt-b']);
    expect(isQuarantineNoticeVisible(secondReport, dismissed)).toBe(true);
  });

  it('stays dismissed for the event it was dismissed for, across re-renders', async () => {
    const report = await hydrateWithUnreadableEntries(['entry-corrupt-a']);

    // Re-reading mid-session must hand back the same report, or dismissal could never stick.
    expect(getQuarantinedTrackingEntries()).toBe(report);
    expect(isQuarantineNoticeVisible(getQuarantinedTrackingEntries(), report)).toBe(false);
  });

  it('stays hidden when a hydration sets nothing aside', async () => {
    const dismissed = await hydrateWithUnreadableEntries(['entry-corrupt-a']);

    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: makeAppState({ trackingEntries: [makeTrackingEntry({ id: 'entry-good' })] }),
      version: CURRENT_SCHEMA_VERSION,
    }));
    await initializeAppStore({ force: true });

    const cleanReport = getQuarantinedTrackingEntries();
    expect(cleanReport).toEqual([]);
    expect(isQuarantineNoticeVisible(cleanReport, dismissed)).toBe(false);
    expect(isQuarantineNoticeVisible(cleanReport, null)).toBe(false);
  });
});

describe('the quarantine notice itself', () => {
  it('announces one set-aside entry politely and offers a working dismiss button', () => {
    const onDismiss = vi.fn();
    const tree = QuarantineNotice({ count: 1, colors: noticeColors, onDismiss });

    const banner = elementsOfType(tree, 'View')[0];
    expect(propsOf(banner).accessibilityLiveRegion).toBe('polite');
    expect(textOf(banner)).toContain(
      'We couldn’t read 1 tracking entry, so it was set aside. Everything else loaded.'
    );

    const [button, ...extraButtons] = elementsOfType(tree, 'Pressable');
    expect(extraButtons).toEqual([]);
    expect(propsOf(button).accessibilityRole).toBe('button');
    expect(textOf(button)).toBe('Dismiss');

    (propsOf(button).onPress as () => void)();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('counts the records it set aside rather than saying "entries" vaguely', () => {
    const tree = QuarantineNotice({ count: 4, colors: noticeColors, onDismiss: vi.fn() });

    expect(textOf(elementsOfType(tree, 'View')[0])).toContain(
      'We couldn’t read 4 tracking entries, so they were set aside. Everything else loaded.'
    );
  });

  it('lets the message take the width the dismiss button does not need', () => {
    const tree = QuarantineNotice({ count: 1, colors: noticeColors, onDismiss: vi.fn() });

    const banner = elementsOfType(tree, 'View')[0];
    expect(propsOf(banner).style).toEqual([
      expect.objectContaining({ flexDirection: 'row', alignItems: 'center' }),
      { backgroundColor: noticeColors.surface },
    ]);

    const message = elementsOfType(tree, 'Text')[0];
    expect(propsOf(message).style).toEqual([
      expect.objectContaining({ flex: 1 }),
      { color: noticeColors.text },
    ]);

    // A 44pt target is the smallest thing a thumb can reliably hit.
    expect(propsOf(elementsOfType(tree, 'Pressable')[0]).style).toMatchObject({ minHeight: 44 });
  });
});
