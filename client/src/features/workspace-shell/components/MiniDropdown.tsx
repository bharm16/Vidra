import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

interface MiniDropdownProps<T extends string | number> {
  value: T;
  options: T[];
  onChange: (value: T) => void;
  formatLabel?: (value: T) => string;
}

export function MiniDropdown<T extends string | number>({
  value,
  options,
  onChange,
  formatLabel,
}: MiniDropdownProps<T>): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = formatLabel ? formatLabel(value) : String(value);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }, []);

  const handleSelect = useCallback(
    (opt: T) => {
      onChange(opt);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "inline-flex h-[28px] items-center gap-[5px] whitespace-nowrap rounded-md px-2 text-xs transition-colors",
          open
            ? "text-foreground"
            : "text-tool-text-muted hover:text-foreground",
        )}
      >
        {label}
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="-ml-0.5 opacity-50"
        >
          <path d="M2 3L4 5L6 3" />
        </svg>
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-dropdown mb-1.5 min-w-[80px] overflow-hidden rounded-[10px] bg-tool-rail-border shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          {options.map((opt) => {
            const optLabel = formatLabel ? formatLabel(opt) : String(opt);
            const isActive = opt === value;
            return (
              <button
                key={String(opt)}
                type="button"
                onClick={() => handleSelect(opt)}
                className={cn(
                  "flex w-full items-center px-3 py-[7px] text-[11px] transition-colors",
                  isActive
                    ? "bg-[rgba(255,255,255,0.06)] font-semibold text-foreground"
                    : "bg-transparent font-normal text-tool-text-dim hover:bg-[rgba(255,255,255,0.04)] hover:text-foreground",
                )}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
