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
    ariaLabel: string;
    ariaDescribedBy?: string;
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
    ariaLabel,
    ariaDescribedBy,
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
    const [internalValue, setInternalValue] = useState(defaultValue);
    const value = isControlled ? (controlledValue as string) : internalValue;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlight, setHighlight] = useState(0);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
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
    const effectiveHighlight = totalRows === 0 ? 0 : Math.min(highlight, totalRows - 1);
    const highlightedOptionId =
        totalRows > 0 ? `${listboxId}-option-${effectiveHighlight}` : undefined;

    useEffect(() => {
        if (!open) {
            return;
        }

        function handlePointerDown(event: PointerEvent) {
            const node = containerRef.current;

            if (node && event.target instanceof Node && !node.contains(event.target)) {
                setOpen(false);
                setQuery("");
            }
        }

        document.addEventListener("pointerdown", handlePointerDown);

        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [open]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const id = window.setTimeout(() => searchRef.current?.focus(), 0);

        return () => window.clearTimeout(id);
    }, [open]);

    const focusTrigger = useCallback(() => {
        window.setTimeout(() => triggerRef.current?.focus(), 0);
    }, []);

    const commitIndex = useCallback(
        (index: number) => {
            if (index < 0) {
                return;
            }

            if (index < filtered.length) {
                setValue(filtered[index]);
            } else if (showCustomRow && index === filtered.length) {
                setValue(trimmedQuery);
            } else {
                return;
            }

            setOpen(false);
            setQuery("");
            focusTrigger();
        },
        [filtered, focusTrigger, setValue, showCustomRow, trimmedQuery],
    );

    function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlight((current) => (totalRows === 0 ? 0 : (current + 1) % totalRows));
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) =>
                totalRows === 0 ? 0 : (current - 1 + totalRows) % totalRows,
            );
        } else if (event.key === "Enter") {
            event.preventDefault();
            commitIndex(effectiveHighlight);
        } else if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setQuery("");
            focusTrigger();
        } else if (event.key === "Tab") {
            setOpen(false);
            setQuery("");
        }
    }

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <input type="hidden" name={name} value={value} />
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                data-invalid={ariaInvalid ? "true" : undefined}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listboxId : undefined}
                onClick={() => {
                    if (!disabled) {
                        setHighlight(0);
                        setOpen((current) => !current);
                    }
                }}
                onKeyDown={(event) => {
                    if (!disabled && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                        event.preventDefault();
                        setHighlight(event.key === "ArrowUp" ? Math.max(options.length - 1, 0) : 0);
                        setOpen(true);
                    }
                }}
                className={cn(
                    "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-cream/10 bg-cream/[0.04] px-3.5 py-2 text-left text-sm text-foreground outline-none transition focus:border-accent/45 disabled:cursor-not-allowed disabled:opacity-60",
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
                <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-cream/10 bg-panel shadow-[0_24px_48px_-32px_rgba(0,0,0,0.9)]">
                    <div className="border-b border-cream/[0.07] p-2">
                        <input
                            ref={searchRef}
                            type="text"
                            role="combobox"
                            aria-label={`Search ${ariaLabel}`}
                            aria-autocomplete="list"
                            aria-expanded="true"
                            aria-controls={listboxId}
                            aria-activedescendant={highlightedOptionId}
                            aria-invalid={ariaInvalid || undefined}
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setHighlight(0);
                            }}
                            onKeyDown={handleSearchKeyDown}
                            placeholder={searchPlaceholder}
                            autoComplete="off"
                            spellCheck={false}
                            className="min-h-11 w-full rounded-md border border-cream/10 bg-cream/[0.04] px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent/45"
                        />
                    </div>
                    <ul
                        id={listboxId}
                        role="listbox"
                        aria-label={`${ariaLabel} options`}
                        className="max-h-64 overflow-y-auto py-1"
                    >
                        {filtered.length === 0 && !showCustomRow ? (
                            <li className="px-3 py-2 text-sm text-muted">{emptyLabel}</li>
                        ) : null}
                        {filtered.map((option, index) => {
                            const isHighlighted = index === effectiveHighlight;
                            const isSelected = option === value;

                            return (
                                <li
                                    key={option}
                                    id={`${listboxId}-option-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseEnter={() => setHighlight(index)}
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        commitIndex(index);
                                    }}
                                    className={cn(
                                        "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition",
                                        isHighlighted
                                            ? "bg-accent/10 text-foreground"
                                            : "text-foreground hover:bg-cream/[0.05]",
                                        isSelected ? "font-medium" : null,
                                    )}
                                >
                                    <span className="truncate">{option}</span>
                                    {isSelected ? (
                                        <span aria-hidden="true" className="text-accent">
                                            ✓
                                        </span>
                                    ) : null}
                                </li>
                            );
                        })}
                        {showCustomRow ? (
                            <li
                                id={`${listboxId}-option-${filtered.length}`}
                                role="option"
                                aria-selected={false}
                                onMouseEnter={() => setHighlight(filtered.length)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    commitIndex(filtered.length);
                                }}
                                className={cn(
                                    "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition",
                                    effectiveHighlight === filtered.length
                                        ? "bg-accent/10 text-foreground"
                                        : "text-foreground hover:bg-cream/[0.05]",
                                )}
                            >
                                <span className="text-muted">Use</span>
                                <span className="truncate font-medium">
                                    &ldquo;{trimmedQuery}&rdquo;
                                </span>
                            </li>
                        ) : null}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

export default SearchableSelect;
