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
  RecoveredActivityNotice,
  RepairNotice,
  recoveredActivityNoticeMessage,
  isHydrationNoticeVisible,
  isQuarantineNoticeVisible,
  type QuarantineReport,
} from '../../src/components/common/QuarantineNotice';
import {
  getQuarantinedTrackingEntries,
  getRecoveredActivityTypes,
  getRepairedTrackingEntries,
  initializeAppStore,
  useAppStore,
} from '../../src/store/useAppStore';
import {
  APP_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  STRICT_SCHEMA_VERSION,
  createInitialState,
} from '../../src/store/persistence';
import { makeAppState, makeGoal, makeTrackingEntry } from '../helpers/builders';

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

  it('does not announce a repair as something it could not read', () => {
    // The two notices describe opposite facts. A repaired entry loaded fine and is in the user's
    // history with a changed end time; saying it was "set aside" would be false twice over.
    const tree = RepairNotice({ count: 1, colors: noticeColors, onDismiss: vi.fn() });
    const text = textOf(elementsOfType(tree, 'View')[0]);

    expect(text).toContain('still running');
    expect(text).toContain('Check that entry’s end time.');
    expect(text).not.toContain('couldn’t read');
    expect(text).not.toContain('set aside');

    // Same banner affordances as the quarantine notice: polite live region, one dismiss button.
    expect(propsOf(elementsOfType(tree, 'View')[0]).accessibilityLiveRegion).toBe('polite');
    expect(elementsOfType(tree, 'Pressable')).toHaveLength(1);
  });

  it('counts the timers it ended', () => {
    const tree = RepairNotice({ count: 3, colors: noticeColors, onDismiss: vi.fn() });

    expect(textOf(elementsOfType(tree, 'View')[0])).toContain(
      '3 timers from an older version were still running'
    );
  });

  it('keeps the two notices independently dismissable', async () => {
    // Silencing "we set records aside" must not also silence "we changed an end time in your
    // history" — different events, different consequences. Needs one hydration that does both.
    const openSelected = makeTrackingEntry({ id: 'open-selected', endTime: undefined });
    const openStranded = makeTrackingEntry({
      id: 'open-stranded',
      startTime: '2026-03-02T11:00:00.000Z',
      updatedAt: '2026-03-02T12:30:00.000Z',
      endTime: undefined,
    });
    // A malformation that throws even on the lenient legacy path. `endTime < startTime` — the one
    // the other tests here use — is *repaired* at a pre-v4 version rather than quarantined, so it
    // would leave the quarantine report empty and make this pass vacuously.
    const unreadable = { ...makeTrackingEntry({ id: 'entry-bad' }), source: 'nope' };
    const state = makeAppState({ trackingEntries: [openSelected, openStranded] });

    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: {
        ...state,
        trackingEntries: [...state.trackingEntries, unreadable],
        currentTrackingEntryId: 'open-selected',
      },
      version: STRICT_SCHEMA_VERSION - 1,
    }));
    await initializeAppStore({ force: true });

    const quarantineReport = getQuarantinedTrackingEntries();
    const repairReport = getRepairedTrackingEntries();
    expect(quarantineReport.map((entry) => entry.id)).toEqual(['entry-bad']);
    expect(repairReport.map((entry) => entry.id)).toEqual(['open-stranded']);

    // Dismissing the quarantine notice leaves the repair notice on screen.
    expect(isQuarantineNoticeVisible(quarantineReport, quarantineReport)).toBe(false);
    expect(isHydrationNoticeVisible(repairReport, quarantineReport as never)).toBe(true);
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

describe('the recovered activity notice (#34)', () => {
  it('names the placeholder and where to fix it', () => {
    expect(recoveredActivityNoticeMessage(['Recovered activity'])).toBe(
      '1 activity type was missing. Its goals and routine blocks were kept under ‘Recovered activity’. Rename it, or move them, in Settings → Activity Types.'
    );
    expect(recoveredActivityNoticeMessage(['Recovered activity', 'Recovered activity 2'])).toBe(
      '2 activity types were missing. Their goals and routine blocks were kept under ‘Recovered activity’ and ‘Recovered activity 2’. Rename them, or move what they hold, in Settings → Activity Types.'
    );
  });

  it('renders from the store report, in theme colours, and can be dismissed', async () => {
    await AsyncStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      state: makeAppState({ goals: [makeGoal({ activityTypeId: 'activity-vanished' })] }),
      version: CURRENT_SCHEMA_VERSION,
    }));
    await initializeAppStore({ force: true });
    const report = getRecoveredActivityTypes();
    expect(report.map((recovered) => recovered.id)).toEqual(['activity-vanished']);
    expect(isHydrationNoticeVisible(report, null)).toBe(true);
    // Its own channel: the other two notices stay hidden.
    expect(isHydrationNoticeVisible(getQuarantinedTrackingEntries(), null)).toBe(false);
    expect(isHydrationNoticeVisible(getRepairedTrackingEntries(), null)).toBe(false);

    const onDismiss = vi.fn();
    const tree = RecoveredActivityNotice({ report, colors: noticeColors, onDismiss });
    expect(propsOf(tree).accessibilityLiveRegion).toBe('polite');
    const texts = elementsOfType(tree, 'Text');
    expect(textOf(texts[0])).toContain('‘Recovered activity’');
    expect(propsOf(texts[0]).style).toEqual(
      expect.arrayContaining([{ color: noticeColors.text }])
    );
    const [button] = elementsOfType(tree, 'Pressable');
    expect(propsOf(button).accessibilityRole).toBe('button');
    (propsOf(button).onPress as () => void)();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(isHydrationNoticeVisible(report, report)).toBe(false);
  });
});
