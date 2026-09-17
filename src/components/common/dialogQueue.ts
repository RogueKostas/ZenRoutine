/**
 * The pure half of the app's dialog (see Dialog.tsx). No React Native imports, so it can be
 * unit-tested in node.
 *
 * Requests are shown one at a time, first in first out. Each one is settled exactly once: by a
 * button (its action's result) or by dismissal — Escape, the backdrop, Android back — which
 * settles it with its cancel result. Settling is keyed by the entry id, so a double click or an
 * Escape keyup that arrives after a button press cannot settle the dialog queued behind it.
 */

export interface ConfirmRequest {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface NotifyRequest {
  kind: 'notify';
  title: string;
  message?: string;
  dismissLabel?: string;
}

export interface ChoiceOption<T extends string = string> {
  label: string;
  value: T;
  selected?: boolean;
}

export interface ChooseRequest<T extends string = string> {
  kind: 'choose';
  title: string;
  message?: string;
  options: ChoiceOption<T>[];
  cancelLabel?: string;
}

export type DialogRequest = ConfirmRequest | NotifyRequest | ChooseRequest;

/** confirm → boolean, choose → the chosen value or null, notify → undefined. */
export type DialogResult = boolean | string | null | undefined;

export type DialogActionRole = 'cancel' | 'default' | 'destructive' | 'option';

export interface DialogAction {
  label: string;
  role: DialogActionRole;
  result: DialogResult;
  selected?: boolean;
}

/** What a dismissal (Escape, backdrop, back button) resolves a request with. */
export function cancelResult(request: DialogRequest): DialogResult {
  switch (request.kind) {
    case 'confirm':
      return false;
    case 'choose':
      return null;
    case 'notify':
      return undefined;
  }
}

/** The buttons a request renders, in display order. */
export function dialogActions(request: DialogRequest): DialogAction[] {
  switch (request.kind) {
    case 'confirm':
      return [
        { label: request.cancelLabel ?? 'Cancel', role: 'cancel', result: false },
        {
          label: request.confirmLabel ?? 'OK',
          role: request.destructive ? 'destructive' : 'default',
          result: true,
        },
      ];
    case 'notify':
      return [{ label: request.dismissLabel ?? 'OK', role: 'default', result: undefined }];
    case 'choose':
      return [
        ...request.options.map((option): DialogAction => ({
          label: option.label,
          role: 'option',
          result: option.value,
          selected: option.selected,
        })),
        { label: request.cancelLabel ?? 'Cancel', role: 'cancel', result: null },
      ];
  }
}

export interface DialogEntry {
  id: number;
  request: DialogRequest;
}

interface PendingEntry extends DialogEntry {
  resolve: (result: DialogResult) => void;
}

export interface DialogQueue {
  /** Queue a request; the promise settles when that request is answered or dismissed. */
  enqueue(request: DialogRequest): Promise<DialogResult>;
  /** The request on screen, or null. Reference-stable between changes (for useSyncExternalStore). */
  current(): DialogEntry | null;
  /** Answer entry `id` with `result`. Ignored unless `id` is the entry on screen. */
  settle(id: number, result: DialogResult): void;
  /** Dismiss entry `id` with its cancel result. Ignored unless `id` is the entry on screen. */
  dismiss(id: number): void;
  subscribe(listener: () => void): () => void;
}

/** The call-site API: reads like the Alert.alert it replaces, but awaits the answer. */
export interface DialogApi {
  /** Resolves true only when the confirm button is pressed. */
  confirm(options: Omit<ConfirmRequest, 'kind'>): Promise<boolean>;
  /** Resolves once the message is acknowledged or dismissed. */
  notify(options: Omit<NotifyRequest, 'kind'>): Promise<void>;
  /** Resolves with the chosen option's value, or null when cancelled. */
  choose<T extends string>(options: Omit<ChooseRequest<T>, 'kind'>): Promise<T | null>;
}

export function createDialogApi(queue: DialogQueue): DialogApi {
  return {
    async confirm(options) {
      return (await queue.enqueue({ kind: 'confirm', ...options })) === true;
    },
    async notify(options) {
      await queue.enqueue({ kind: 'notify', ...options });
    },
    async choose(options) {
      const result = await queue.enqueue({ kind: 'choose', ...options });
      return options.options.find((option) => option.value === result)?.value ?? null;
    },
  };
}

export function createDialogQueue(): DialogQueue {
  const pending: PendingEntry[] = [];
  const listeners = new Set<() => void>();
  let nextId = 1;
  let head: DialogEntry | null = null;

  const publish = () => {
    const first = pending[0];
    head = first ? { id: first.id, request: first.request } : null;
    listeners.forEach((listener) => listener());
  };

  const settle = (id: number, result: DialogResult) => {
    const first = pending[0];
    if (!first || first.id !== id) return;
    pending.shift();
    publish();
    first.resolve(result);
  };

  return {
    enqueue(request) {
      return new Promise<DialogResult>((resolve) => {
        pending.push({ id: nextId++, request, resolve });
        if (pending.length === 1) publish();
      });
    },
    current: () => head,
    settle,
    dismiss(id) {
      const first = pending[0];
      if (!first || first.id !== id) return;
      settle(id, cancelResult(first.request));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
