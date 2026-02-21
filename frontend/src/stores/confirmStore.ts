import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'danger' | 'warning' | 'default';
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmActions {
  confirm: (opts: {
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'default';
  }) => Promise<boolean>;
  accept: () => void;
  cancel: () => void;
}

export const useConfirmStore = create<ConfirmState & ConfirmActions>()((set, get) => ({
  open: false,
  title: 'Confirmation',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  variant: 'danger',
  resolve: null,

  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title ?? 'Confirmation',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirmer',
        cancelLabel: opts.cancelLabel ?? 'Annuler',
        variant: opts.variant ?? 'danger',
        resolve,
      });
    }),

  accept: () => {
    const { resolve } = get();
    resolve?.(true);
    set({ open: false, resolve: null });
  },

  cancel: () => {
    const { resolve } = get();
    resolve?.(false);
    set({ open: false, resolve: null });
  },
}));

export const confirmAction = (opts: {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
}) => useConfirmStore.getState().confirm(opts);
