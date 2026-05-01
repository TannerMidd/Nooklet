"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { type LibraryManagerServiceType } from "@/modules/service-connections/types/library-manager";
import {
  type ArrIndexerField,
  type ArrIndexerSchema,
  type ArrIndexerSummary,
  type ArrIndexerTestFailure,
} from "@/modules/service-connections/types/arr-indexers";

type ArrIndexerEditorModalProps = {
  open: boolean;
  serviceType: LibraryManagerServiceType;
  serviceLabel: string;
  /** Indexer being edited; null when adding a new one. */
  indexer: ArrIndexerSummary | null;
  /** Schema for the indexer's implementation; required for both add and edit so we know field shapes. */
  schema: ArrIndexerSchema | null;
  pending: boolean;
  testStatus: "idle" | "success" | "error" | "test-failed";
  testMessage?: string;
  testFailures?: ReadonlyArray<ArrIndexerTestFailure>;
  saveStatus: "idle" | "success" | "error";
  saveMessage?: string;
  onClose: () => void;
  /** Called with the assembled FormData ready for submitSaveArrIndexerAction. */
  onSave: (formData: FormData) => void;
  /** Called with the assembled FormData ready for submitTestArrIndexerAction. */
  onTest: (formData: FormData) => void;
};

type FieldValue = string | number | boolean | null | Array<string | number>;

function fieldValueToInputString(value: FieldValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function parseArrayInput(raw: string): Array<string | number> {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const asNumber = Number(part);
      return Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(part) ? asNumber : part;
    });
}

function mergeFields(
  schemaFields: ReadonlyArray<ArrIndexerField>,
  existingFields: ReadonlyArray<ArrIndexerField>,
): ArrIndexerField[] {
  const existingByName = new Map(existingFields.map((field) => [field.name, field]));
  return schemaFields.map((schemaField) => {
    const existing = existingByName.get(schemaField.name);
    if (existing) {
      return { ...schemaField, value: existing.value };
    }
    return { ...schemaField };
  });
}

function isSupportedFieldType(type: string): boolean {
  return [
    "textbox",
    "password",
    "url",
    "number",
    "checkbox",
    "select",
  ].includes(type.toLowerCase());
}

function buildInitialFields(
  indexer: ArrIndexerSummary | null,
  schema: ArrIndexerSchema | null,
): ArrIndexerField[] {
  if (indexer) {
    return schema
      ? mergeFields(schema.fields, indexer.fields)
      : indexer.fields.map((field) => ({ ...field }));
  }
  if (schema) {
    return schema.fields.map((field) => ({ ...field }));
  }
  return [];
}

export function ArrIndexerEditorModal({
  open,
  serviceType,
  serviceLabel,
  indexer,
  schema,
  pending,
  testStatus,
  testMessage,
  testFailures,
  saveStatus,
  saveMessage,
  onClose,
  onSave,
  onTest,
}: ArrIndexerEditorModalProps) {
  const dialogTitleId = useId();
  const isEdit = indexer !== null;

  const [name, setName] = useState(() => indexer?.name ?? "");
  const [priority, setPriority] = useState(() => indexer?.priority ?? 25);
  const [enableRss, setEnableRss] = useState(() => indexer?.enableRss ?? true);
  const [enableAutomaticSearch, setEnableAutomaticSearch] = useState(
    () => indexer?.enableAutomaticSearch ?? true,
  );
  const [enableInteractiveSearch, setEnableInteractiveSearch] = useState(
    () => indexer?.enableInteractiveSearch ?? true,
  );
  const [tagsRaw, setTagsRaw] = useState(() => indexer?.tags.join(",") ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fields, setFields] = useState<ArrIndexerField[]>(() => buildInitialFields(indexer, schema));

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const visibleFields = useMemo(
    () => fields.filter((field) => !field.hidden && (showAdvanced || !field.advanced)),
    [fields, showAdvanced],
  );

  const failureByField = useMemo(() => {
    const map = new Map<string, string>();
    (testFailures ?? []).forEach((failure) => {
      if (failure.propertyName) map.set(failure.propertyName, failure.errorMessage);
    });
    return map;
  }, [testFailures]);

  if (!open || typeof document === "undefined") return null;

  const effectiveSchema = schema ?? null;
  const implementation = effectiveSchema?.implementation ?? indexer?.implementation ?? "";
  const implementationName =
    effectiveSchema?.implementationName ?? indexer?.implementationName ?? "";
  const configContract = effectiveSchema?.configContract ?? indexer?.configContract ?? "";
  const protocol =
    (effectiveSchema?.protocol ?? indexer?.protocol ?? "torrent") === "unknown"
      ? "torrent"
      : (effectiveSchema?.protocol ?? indexer?.protocol ?? "torrent");

  function updateField(name: string, value: FieldValue) {
    setFields((current) =>
      current.map((field) => (field.name === name ? { ...field, value } : field)),
    );
  }

  function buildFormData(): FormData | null {
    if (!implementation || !implementationName || !configContract) return null;
    const data = new FormData();
    data.set("serviceType", serviceType);
    if (indexer) data.set("id", String(indexer.id));
    data.set("name", name.trim());
    data.set("implementation", implementation);
    data.set("implementationName", implementationName);
    data.set("configContract", configContract);
    data.set("protocol", protocol);
    data.set("priority", String(priority));
    data.set("enableRss", enableRss ? "true" : "false");
    data.set("enableAutomaticSearch", enableAutomaticSearch ? "true" : "false");
    data.set("enableInteractiveSearch", enableInteractiveSearch ? "true" : "false");
    data.set("tags", JSON.stringify(parseArrayInput(tagsRaw).map((value) => Number(value)).filter((n) => Number.isFinite(n))));
    data.set(
      "fields",
      JSON.stringify(fields.map((field) => ({ name: field.name, value: field.value ?? null }))),
    );
    return data;
  }

  function handleSubmit(action: "save" | "test") {
    const data = buildFormData();
    if (!data) return;
    if (action === "save") {
      data.set("returnTo", `/${serviceType}`);
      onSave(data);
    } else {
      onTest(data);
    }
  }

  const headerEyebrow = `${serviceLabel} indexer`;
  const headerTitle = isEdit ? `Edit ${indexer?.name ?? "indexer"}` : `Add ${implementationName || "indexer"}`;

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
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-line/80 bg-panel">
        <header className="flex items-start justify-between gap-4 border-b border-line/60 p-6">
          <div>
            <p className="font-heading text-sm italic text-accent">{headerEyebrow}</p>
            <h2 id={dialogTitleId} className="mt-2 font-heading text-2xl leading-tight text-foreground">
              {headerTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {implementationName} · {protocol}
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

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          {saveStatus === "error" && saveMessage ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {saveMessage}
            </p>
          ) : null}
          {saveStatus === "success" && saveMessage ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {saveMessage}
            </p>
          ) : null}

          {testStatus === "success" && testMessage ? (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {testMessage}
            </p>
          ) : null}
          {testStatus === "error" && testMessage ? (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {testMessage}
            </p>
          ) : null}
          {testStatus === "test-failed" ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              <p className="font-medium">{testMessage ?? "Indexer test failed."}</p>
              <ul className="mt-1 list-disc pl-5">
                {(testFailures ?? []).map((failure, index) => (
                  <li key={`${failure.propertyName ?? "_"}-${index}`}>
                    {failure.propertyName ? <strong>{failure.propertyName}: </strong> : null}
                    {failure.errorMessage}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
              required
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Priority</span>
              <input
                type="number"
                min={1}
                max={50}
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Tags (comma-separated ids)</span>
              <input
                type="text"
                value={tagsRaw}
                onChange={(event) => setTagsRaw(event.target.value)}
                className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
                placeholder="e.g. 1,3"
              />
            </label>
          </div>

          <fieldset className="grid grid-cols-1 gap-2 rounded-md border border-line/60 bg-panel-strong/40 p-3 text-sm sm:grid-cols-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">
              Enable
            </legend>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableRss}
                onChange={(event) => setEnableRss(event.target.checked)}
              />
              RSS
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableAutomaticSearch}
                onChange={(event) => setEnableAutomaticSearch(event.target.checked)}
              />
              Automatic search
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableInteractiveSearch}
                onChange={(event) => setEnableInteractiveSearch(event.target.checked)}
              />
              Interactive search
            </label>
          </fieldset>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Indexer settings</h3>
            <label className="inline-flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showAdvanced}
                onChange={(event) => setShowAdvanced(event.target.checked)}
              />
              Show advanced
            </label>
          </div>

          {visibleFields.length === 0 ? (
            <p className="text-sm text-muted">This indexer exposes no editable settings.</p>
          ) : (
            <div className="space-y-3">
              {visibleFields.map((field) => {
                const failureMessage = failureByField.get(field.name);
                const baseLabel = field.label ?? field.name;
                const labelEl = (
                  <span className="font-medium text-foreground">
                    {baseLabel}
                    {field.advanced ? <span className="ml-2 text-xs text-muted">(advanced)</span> : null}
                  </span>
                );
                const helpEl = field.helpText ? (
                  <span className="text-xs text-muted">{field.helpText}</span>
                ) : null;
                const failureEl = failureMessage ? (
                  <span className="text-xs text-rose-300">{failureMessage}</span>
                ) : null;

                const fieldType = field.type.toLowerCase();
                const value = field.value as FieldValue;

                if (!isSupportedFieldType(fieldType)) {
                  return (
                    <div key={field.name} className="space-y-1 text-sm">
                      {labelEl}
                      <p className="rounded-md border border-line/50 bg-panel-strong/40 px-3 py-2 text-xs text-muted">
                        {fieldValueToInputString(value) || "—"}
                      </p>
                      <p className="text-xs text-muted">
                        Field type <code>{field.type}</code> is managed upstream. Edit it directly in {serviceLabel} for now.
                      </p>
                      {helpEl}
                      {failureEl}
                    </div>
                  );
                }

                if (fieldType === "checkbox") {
                  return (
                    <label key={field.name} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(event) => updateField(field.name, event.target.checked)}
                        className="mt-1"
                      />
                      <span className="flex flex-col gap-1">
                        {labelEl}
                        {helpEl}
                        {failureEl}
                      </span>
                    </label>
                  );
                }

                if (fieldType === "select" && field.selectOptions && field.selectOptions.length > 0) {
                  return (
                    <label key={field.name} className="flex flex-col gap-1 text-sm">
                      {labelEl}
                      <select
                        value={fieldValueToInputString(value)}
                        onChange={(event) => {
                          const raw = event.target.value;
                          const asNumber = Number(raw);
                          updateField(
                            field.name,
                            Number.isFinite(asNumber) && /^-?\d+$/.test(raw) ? asNumber : raw,
                          );
                        }}
                        className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
                      >
                        {field.selectOptions.map((option) => (
                          <option key={String(option.value)} value={String(option.value)}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {helpEl}
                      {failureEl}
                    </label>
                  );
                }

                if (fieldType === "number") {
                  return (
                    <label key={field.name} className="flex flex-col gap-1 text-sm">
                      {labelEl}
                      <input
                        type="number"
                        value={typeof value === "number" ? value : value === null || value === undefined ? "" : Number(value as string)}
                        onChange={(event) => updateField(field.name, Number(event.target.value))}
                        className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
                      />
                      {helpEl}
                      {failureEl}
                    </label>
                  );
                }

                return (
                  <label key={field.name} className="flex flex-col gap-1 text-sm">
                    {labelEl}
                    <input
                      type={fieldType === "password" ? "password" : "text"}
                      value={fieldValueToInputString(value)}
                      onChange={(event) => updateField(field.name, event.target.value)}
                      className="rounded-md border border-line/70 bg-panel-strong px-3 py-2 text-sm text-foreground"
                    />
                    {helpEl}
                    {failureEl}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line/60 p-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => handleSubmit("test")}
            className="rounded-full border border-line/70 bg-panel-strong px-4 py-2 text-sm font-medium text-foreground hover:bg-panel disabled:opacity-50"
          >
            {pending ? "Working…" : "Test"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => handleSubmit("save")}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add indexer"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
