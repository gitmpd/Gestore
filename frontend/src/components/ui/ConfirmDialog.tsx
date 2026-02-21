import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useConfirmStore } from '@/stores/confirmStore';
import { Button } from './Button';

export function ConfirmDialog() {
  const { open, title, message, confirmLabel, cancelLabel, variant, accept, cancel } =
    useConfirmStore();
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmBtnRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') cancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, cancel]);

  if (!open) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600 bg-red-100',
      button: 'danger' as const,
    },
    warning: {
      icon: 'text-amber-600 bg-amber-100',
      button: 'secondary' as const,
    },
    default: {
      icon: 'text-blue-600 bg-blue-100',
      button: 'primary' as const,
    },
  };

  const style = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={cancel} />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface rounded-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 rounded-full p-2 ${style.icon}`}>
            <AlertTriangle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text">{title}</h3>
            <p className="mt-2 text-sm text-text-muted whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={cancel}>
            {cancelLabel}
          </Button>
          <Button ref={confirmBtnRef} variant={style.button} onClick={accept}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
