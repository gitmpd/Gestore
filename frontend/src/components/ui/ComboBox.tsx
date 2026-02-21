import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboBoxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface ComboBoxProps {
  options: ComboBoxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function ComboBox({ options, value, onChange, placeholder = 'Rechercher...', className, required }: ComboBoxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(query.toLowerCase()))
      )
    : options;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const highlighted = listRef.current.children[highlightedIndex] as HTMLElement;
      highlighted?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, open]);

  const select = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery('');
  };

  const clear = () => {
    onChange('');
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[highlightedIndex]) {
          select(filtered[highlightedIndex].value);
        }
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Hidden input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          className="absolute opacity-0 h-0 w-0"
          value={value}
          onChange={() => {}}
          required
        />
      )}

      <div
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm transition-colors',
          open && 'ring-2 ring-primary/30 border-primary'
        )}
      >
        <Search size={14} className="text-text-muted shrink-0" />
        {selectedOption && !open ? (
          <button
            type="button"
            className="flex-1 text-left text-text truncate"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
          >
            {selectedOption.label}
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-text placeholder:text-text-muted min-w-0"
            placeholder={selectedOption ? selectedOption.label : placeholder}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
          />
        )}
        {value ? (
          <button type="button" onClick={clear} className="text-text-muted hover:text-danger shrink-0">
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={14} className={cn('text-text-muted shrink-0 transition-transform', open && 'rotate-180')} />
        )}
      </div>

      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-text-muted">Aucun résultat</p>
          ) : (
            filtered.map((option, idx) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm text-left text-text transition-colors',
                  idx === highlightedIndex && 'bg-primary/10',
                  option.value === value && 'font-medium text-primary',
                  idx !== highlightedIndex && 'hover:bg-slate-50 dark:hover:bg-slate-700'
                )}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onClick={() => select(option.value)}
              >
                <span className="truncate">{option.label}</span>
                {option.sublabel && (
                  <span className="text-xs text-text-muted ml-2 shrink-0">{option.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
