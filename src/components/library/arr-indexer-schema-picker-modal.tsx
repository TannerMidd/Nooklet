"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { type ArrIndexerSchema } from "@/modules/service-connections/types/arr-indexers";

type ArrIndexerSchemaPickerModalProps = {
  open: boolean;
  serviceLabel: string;
  schemas: ReadonlyArray<ArrIndexerSchema>;
  onClose: () => void;
  onPick: (schema: ArrIndexerSchema) => void;
};

export function ArrIndexerSchemaPickerModal({
  open,
  serviceLabel,
  schemas,
  onClose,
  onPick,
}: ArrIndexerSchemaPickerModalProps) {
  const dialogTitleId = useId();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[80vh] w-full max-w-xl flex-col rounded-xl border border-line/80 bg-panel">
        <header className="flex items-start justify-between gap-4 border-b border-line/60 p-6">
          <div>
            <p className="font-heading text-sm italic text-accent">{serviceLabel} indexers</p>
            <h2 id={dialogTitleId} className="mt-2 font-heading text-2xl leading-tight text-foreground">
              Add a new indexer
            </h2>
            <p className="mt-1 text-sm text-muted">
              Pick the implementation that matches your provider.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-panel-strong px-3 py-1 text-xs font-semibold text-muted hover:bg-panel"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
          {schemas.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">
              No indexer implementations are available from {serviceLabel}.
            </p>
          ) : (
            schemas.map((schema) => (
              <button
                key={`${schema.implementation}-${schema.configContract}`}
                type="button"
                onClick={() => onPick(schema)}
                className="flex flex-col items-start gap-1 rounded-md border border-line/60 bg-panel-strong/50 px-3 py-2 text-left text-sm hover:border-accent/40 hover:bg-panel"
              >
                <span className="font-medium text-foreground">{schema.implementationName}</span>
                <span className="text-xs uppercase tracking-wide text-muted">
                  {schema.protocol === "unknown" ? schema.implementation : schema.protocol}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
