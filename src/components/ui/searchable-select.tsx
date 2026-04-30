"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@/lib/utils";

type SearchableSelectProps = {
  name: string;
  options: readonly string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  allowCustomValue?: boolean;
  disabled?: boolean;
  ariaInvalid?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function SearchableSelect({
  name,
  options,
  defaultValue = "",
  value: controlledValue,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  emptyLabel = "No options available",
  allowCustomValue = true,
  disabled = false,
  ariaInvalid,
  className,
  triggerClassName,
}: SearchableSelectProps) {
  const isControlled = controlledValue !== undefined;
  const [internalValue, setInternalValue] = useState<string>(defaultValue);
  const value = isControlled ? (controlledValue as string) : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const setValue = useCallback(
    (next: string) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    if (!trimmedQuery) {
      return options;
    }
    const needle = trimmedQuery.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, trimmedQuery]);

  const showCustomRow =
    allowCustomValue &&
    trimmedQuery.length > 0 &&
    !options.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());

  const totalRows = filtered.length + (showCustomRow ? 1 : 0);
  // Clamp the highlighted row so it stays in range whenever the filtered list
  // shrinks (e.g. as the user types). Resetting in event handlers below keeps
  // user-driven changes snappy without an effect.
  const effectiveHighlight = totalRows === 0 ? 0 : Math.min(highlight, totalRows - 1);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      const node = containerRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => {
        searchRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return;
  }, [open]);

  const commitIndex = useCallback(
    (index: number) => {
      if (index < 0) {
        return;
      }
      if (index < filtered.length) {
        setValue(filtered[index]);
        setOpen(false);
        setQuery("");
        return;
      }
      if (showCustomRow && index === filtered.length) {
        setValue(trimmedQuery);
        setOpen(false);
        setQuery("");
      }
    },
    [filtered, setValue, showCustomRow, trimmedQuery],
  );

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (totalRows === 0 ? 0 : (current + 1) % totalRows));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => (totalRows === 0 ? 0 : (current - 1 + totalRows) % totalRows));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commitIndex(effectiveHighlight);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        data-invalid={ariaInvalid ? "true" : undefined}
        onClick={() => {
          if (!disabled) {
            setHighlight(0);
            setOpen((current) => !current);
          }
        }}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-line/80 bg-panel-strong/75 px-4 py-3 text-left text-sm text-foreground outline-none transition focus:border-accent/50 focus:bg-panel focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", value ? "text-foreground" : "text-muted")}>
          {value || placeholder}
        </span>
        <span aria-hidden="true" className="text-muted">
          ▾
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-lg border border-line/80 bg-panel">
          <div className="border-b border-line/70 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="min-h-10 w-full rounded-xl border border-line/80 bg-panel-strong/80 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            className="max-h-64 overflow-y-auto py-1"
          >
            {filtered.length === 0 && !showCustomRow ? (
              <li className="px-3 py-2 text-sm text-muted">{emptyLabel}</li>
            ) : null}
            {filtered.map((option, index) => {
              const isHighlighted = index === effectiveHighlight;
              const isSelected = option === value;
              return (
                <li key={option} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => commitIndex(index)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition",
                      isHighlighted ? "bg-accent/10 text-foreground" : "text-foreground hover:bg-accent/5",
                      isSelected ? "font-medium" : null,
                    )}
                  >
                    <span className="truncate">{option}</span>
                    {isSelected ? (
                      <span aria-hidden="true" className="text-accent">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
            {showCustomRow ? (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(filtered.length)}
                  onClick={() => commitIndex(filtered.length)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition",
                    effectiveHighlight === filtered.length
                      ? "bg-accent/10 text-foreground"
                      : "text-foreground hover:bg-accent/5",
                  )}
                >
                  <span className="text-muted">Use</span>
                  <span className="truncate font-medium">&ldquo;{trimmedQuery}&rdquo;</span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default SearchableSelect;
