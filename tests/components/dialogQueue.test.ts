import { describe, expect, it, vi } from 'vitest';
import {
  cancelResult,
  createDialogApi,
  createDialogQueue,
  dialogActions,
  type ChooseRequest,
  type ConfirmRequest,
  type NotifyRequest,
} from '../../src/components/common/dialogQueue';

const confirmReq: ConfirmRequest = {
  kind: 'confirm',
  title: 'Delete?',
  confirmLabel: 'Delete',
  destructive: true,
};
const notifyReq: NotifyRequest = { kind: 'notify', title: 'Saved' };
const chooseReq: ChooseRequest = {
  kind: 'choose',
  title: 'Theme',
  options: [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light', selected: true },
    { label: 'Dark', value: 'dark' },
  ],
};

describe('dialogActions', () => {
  it('gives a confirm a cancel button and a (destructive) confirm button', () => {
    expect(dialogActions(confirmReq)).toEqual([
      { label: 'Cancel', role: 'cancel', result: false },
      { label: 'Delete', role: 'destructive', result: true },
    ]);
    expect(dialogActions({ kind: 'confirm', title: 'Go?' })[1]).toEqual({
      label: 'OK',
      role: 'default',
      result: true,
    });
  });

  it('gives a notify a single OK button', () => {
    expect(dialogActions(notifyReq)).toEqual([{ label: 'OK', role: 'default', result: undefined }]);
  });

  it('gives a choose one button per option, marking the selected one, then Cancel', () => {
    const actions = dialogActions(chooseReq);
    expect(actions.map((a) => a.result)).toEqual(['system', 'light', 'dark', null]);
    expect(actions.map((a) => a.role)).toEqual(['option', 'option', 'option', 'cancel']);
    expect(actions.filter((a) => a.selected).map((a) => a.label)).toEqual(['Light']);
  });
});

describe('cancelResult', () => {
  it('is false for confirm, null for choose, undefined for notify', () => {
    expect(cancelResult(confirmReq)).toBe(false);
    expect(cancelResult(chooseReq)).toBeNull();
    expect(cancelResult(notifyReq)).toBeUndefined();
  });
});

describe('createDialogQueue', () => {
  it('shows nothing until something is queued', () => {
    expect(createDialogQueue().current()).toBeNull();
  });

  it('shows requests one at a time, in order, resolving each with its own answer', async () => {
    const queue = createDialogQueue();
    const first = queue.enqueue(confirmReq);
    const second = queue.enqueue(chooseReq);
    const third = queue.enqueue(notifyReq);

    const a = queue.current();
    expect(a?.request).toBe(confirmReq);
    queue.settle(a!.id, true);

    const b = queue.current();
    expect(b?.request).toBe(chooseReq);
    queue.settle(b!.id, 'dark');

    const c = queue.current();
    expect(c?.request).toBe(notifyReq);
    queue.settle(c!.id, undefined);

    expect(queue.current()).toBeNull();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe('dark');
    await expect(third).resolves.toBeUndefined();
  });

  it('resolves a dismissed (Escape / backdrop) confirm with false and choose with null', async () => {
    const queue = createDialogQueue();
    const confirmed = queue.enqueue(confirmReq);
    const chosen = queue.enqueue(chooseReq);
    const notified = queue.enqueue(notifyReq);

    queue.dismiss(queue.current()!.id);
    queue.dismiss(queue.current()!.id);
    queue.dismiss(queue.current()!.id);

    await expect(confirmed).resolves.toBe(false);
    await expect(chosen).resolves.toBeNull();
    await expect(notified).resolves.toBeUndefined();
    expect(queue.current()).toBeNull();
  });

  it('resolves the Cancel button the same way as a dismissal', async () => {
    const queue = createDialogQueue();
    const confirmed = queue.enqueue(confirmReq);
    const cancel = dialogActions(confirmReq).find((a) => a.role === 'cancel')!;
    queue.settle(queue.current()!.id, cancel.result);
    await expect(confirmed).resolves.toBe(false);
  });

  it('ignores a stale settle or dismiss, so a double press cannot answer the next dialog', async () => {
    const queue = createDialogQueue();
    const first = queue.enqueue(confirmReq);
    const second = queue.enqueue(confirmReq);
    const firstId = queue.current()!.id;

    queue.settle(firstId, true);
    queue.settle(firstId, true); // second click on the same button
    queue.dismiss(firstId); // Escape keyup arriving late

    const onScreen = queue.current();
    expect(onScreen).not.toBeNull();
    expect(onScreen!.id).not.toBe(firstId);
    await expect(first).resolves.toBe(true);

    const settledSecond = vi.fn();
    void second.then(settledSecond);
    await Promise.resolve();
    expect(settledSecond).not.toHaveBeenCalled();

    queue.dismiss(onScreen!.id);
    await expect(second).resolves.toBe(false);
  });

  it('notifies subscribers when the dialog on screen changes, and keeps current() stable otherwise', () => {
    const queue = createDialogQueue();
    const listener = vi.fn();
    const unsubscribe = queue.subscribe(listener);

    void queue.enqueue(notifyReq);
    expect(listener).toHaveBeenCalledTimes(1);
    const shown = queue.current();

    void queue.enqueue(confirmReq); // queued behind — the screen does not change
    expect(listener).toHaveBeenCalledTimes(1);
    expect(queue.current()).toBe(shown);

    queue.settle(shown!.id, undefined);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(queue.current()?.request).toBe(confirmReq);

    unsubscribe();
    queue.dismiss(queue.current()!.id);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("lets a dialog be queued from inside the previous one's answer", async () => {
    const queue = createDialogQueue();
    const followUp = queue
      .enqueue(confirmReq)
      .then((ok) => (ok ? queue.enqueue(notifyReq) : 'skipped'));

    queue.settle(queue.current()!.id, true);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.current()?.request).toBe(notifyReq);
    queue.dismiss(queue.current()!.id);
    await expect(followUp).resolves.toBeUndefined();
  });
});

describe('createDialogApi', () => {
  it('confirm resolves true only for the confirm button, false for Cancel and Escape', async () => {
    const queue = createDialogQueue();
    const dialog = createDialogApi(queue);

    const yes = dialog.confirm({ title: 'Delete?', destructive: true });
    expect(queue.current()?.request).toEqual({ kind: 'confirm', title: 'Delete?', destructive: true });
    queue.settle(queue.current()!.id, true);
    await expect(yes).resolves.toBe(true);

    const cancelled = dialog.confirm({ title: 'Delete?' });
    queue.settle(queue.current()!.id, false);
    await expect(cancelled).resolves.toBe(false);

    const escaped = dialog.confirm({ title: 'Delete?' });
    queue.dismiss(queue.current()!.id);
    await expect(escaped).resolves.toBe(false);
  });

  it('choose resolves the chosen value, and null for Cancel, Escape or an unknown value', async () => {
    const queue = createDialogQueue();
    const dialog = createDialogApi(queue);
    const options = [
      { label: 'Light', value: 'light' as const },
      { label: 'Dark', value: 'dark' as const },
    ];

    const picked = dialog.choose({ title: 'Theme', options });
    queue.settle(queue.current()!.id, 'dark');
    await expect(picked).resolves.toBe('dark');

    const cancelled = dialog.choose({ title: 'Theme', options });
    queue.settle(queue.current()!.id, null);
    await expect(cancelled).resolves.toBeNull();

    const escaped = dialog.choose({ title: 'Theme', options });
    queue.dismiss(queue.current()!.id);
    await expect(escaped).resolves.toBeNull();

    const bogus = dialog.choose({ title: 'Theme', options });
    queue.settle(queue.current()!.id, 'sepia');
    await expect(bogus).resolves.toBeNull();
  });

  it('notify resolves once acknowledged or dismissed', async () => {
    const queue = createDialogQueue();
    const dialog = createDialogApi(queue);
    const shown = dialog.notify({ title: 'Privacy', message: 'Your data stays on your device.' });
    expect(queue.current()?.request).toEqual({
      kind: 'notify',
      title: 'Privacy',
      message: 'Your data stays on your device.',
    });
    queue.dismiss(queue.current()!.id);
    await expect(shown).resolves.toBeUndefined();
    expect(queue.current()).toBeNull();
  });
});
