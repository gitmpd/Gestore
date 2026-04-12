import { type FocusEvent, type InputHTMLAttributes, forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> {
  label?: string;
  error?: string;
  value: number | '' | null | undefined;
  onValueChange: (value: number) => void;
  onEmptyValueChange?: () => void;
}

const toInputValue = (value: NumberInputProps['value']) => {
  if (value === '' || value === null || value === undefined) return '';
  return String(value);
};

const parseInputValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBound = (value: string | number | undefined) => {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, label, error, id, value, onValueChange, onEmptyValueChange, onBlur, onFocus, ...props }, ref) => {
    const [draftValue, setDraftValue] = useState(toInputValue(value));
    const [isFocused, setIsFocused] = useState(false);
    const minBound = parseBound(props.min);
    const maxBound = parseBound(props.max);

    useEffect(() => {
      if (!isFocused) {
        setDraftValue(toInputValue(value));
      }
    }, [value, isFocused]);

    const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(event);
    };

    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      setDraftValue(toInputValue(value));
      onBlur?.(event);
    };

    const input = (
      <input
        {...props}
        ref={ref}
        id={id}
        type="number"
        value={isFocused ? draftValue : toInputValue(value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraftValue(nextValue);

          if (nextValue === '') {
            onEmptyValueChange?.();
            return;
          }

          const parsed = parseInputValue(nextValue);
          if (parsed !== null) {
            let bounded = parsed;
            if (minBound !== null) {
              bounded = Math.max(minBound, bounded);
            }
            if (maxBound !== null) {
              bounded = Math.min(maxBound, bounded);
            }
            if (bounded !== parsed) {
              setDraftValue(String(bounded));
            }
            onValueChange(bounded);
          }
        }}
        className={cn(
          'rounded-lg border border-border bg-surface pl-3 pr-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
          error && 'border-danger focus:ring-danger/30',
          className
        )}
      />
    );

    if (!label && !error) {
      return input;
    }

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-text">
            {label}
          </label>
        )}
        {input}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);

NumberInput.displayName = 'NumberInput';
