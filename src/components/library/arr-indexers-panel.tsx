"use client";

import { useState, useTransition } from "react";

import { ArrIndexerEditorModal } from "@/components/library/arr-indexer-editor-modal";
import { ArrIndexerSchemaPickerModal } from "@/components/library/arr-indexer-schema-picker-modal";
import {
  initialArrIndexerActionState,
  type ArrIndexerActionState,
} from "@/app/(workspace)/arr-indexer-action-state";
import {
  submitDeleteArrIndexerAction,
  submitSaveArrIndexerAction,
  submitTestArrIndexerAction,
} from "@/app/(workspace)/arr-indexer-actions";
import {
  type ArrIndexerSchema,
  type ArrIndexerSummary,
} from "@/modules/service-connections/types/arr-indexers";
import { type LibraryManagerServiceType } from "@/modules/service-connections/types/library-manager";

type ArrIndexersPanelProps = {
  serviceType: LibraryManagerServiceType;
  serviceLabel: string;
  routePath: "/sonarr" | "/radarr";
  indexers: ReadonlyArray<ArrIndexerSummary>;
  schemas: ReadonlyArray<ArrIndexerSchema>;
  loadError?: string;
  schemaError?: string;
};

export function ArrIndexersPanel({
  serviceType,
  serviceLabel,
  routePath,
  indexers,
  schemas,
  loadError,
  schemaError,
}: ArrIndexersPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorIndexer, setEditorIndexer] = useState<ArrIndexerSummary | null>(null);
  const [editorSchema, setEditorSchema] = useState<ArrIndexerSchema | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  /**
   * Increment whenever the editor target changes; used as a `key` so the modal
   * remounts cleanly with fresh state instead of relying on a setState-heavy
   * effect.
   */
  const [editorInstance, setEditorInstance] = useState(0);

  const [saveState, setSaveState] = useState<ArrIndexerActionState>(initialArrIndexerActionState);
  const [testState, setTestState] = useState<ArrIndexerActionState>(initialArrIndexerActionState);
  const [deleteState, setDeleteState] = useState<ArrIndexerActionState>(
    initialArrIndexerActionState,
  );
  const [savePending, startSave] = useTransition();
  const [testPending, startTest] = useTransition();
  const [deletePending, startDelete] = useTransition();

  function findSchemaForIndexer(indexer: ArrIndexerSummary): ArrIndexerSchema | null {
    return (
      schemas.find(
        (schema) =>
          schema.implementation === indexer.implementation &&
          schema.configContract === indexer.configContract,
      ) ?? null
    );
  }

  function openEditor(target: ArrIndexerSummary | null, schema: ArrIndexerSchema | null) {
    setEditorIndexer(target);
    setEditorSchema(schema);
    setSaveState(initialArrIndexerActionState);
    setTestState(initialArrIndexerActionState);
    setEditorInstance((value) => value + 1);
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorIndexer(null);
    setEditorSchema(null);
  }

  function handleEdit(indexer: ArrIndexerSummary) {
    openEditor(indexer, findSchemaForIndexer(indexer));
  }

  function handleAddPick(schema: ArrIndexerSchema) {
    setPickerOpen(false);
    openEditor(null, schema);
  }

  function handleDelete(indexer: ArrIndexerSummary) {
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`Remove indexer "${indexer.name}" from ${serviceLabel}?`);
      if (!confirmed) return;
    }
    const data = new FormData();
    data.set("serviceType", serviceType);
    data.set("id", String(indexer.id));
    data.set("returnTo", routePath);
    startDelete(async () => {
      const result = await submitDeleteArrIndexerAction(deleteState, data);
      setDeleteState(result);
    });
  }

  function handleSaveSubmit(formData: FormData) {
    startSave(async () => {
      const result = await submitSaveArrIndexerAction(saveState, formData);
      setSaveState(result);
      if (result.status === "success") {
        closeEditor();
      }
    });
  }

  function handleTestSubmit(formData: FormData) {
    startTest(async () => {
      const result = await submitTestArrIndexerAction(testState, formData);
      setTestState(result);
    });
  }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{serviceLabel} indexers</h2>
          <p className="text-sm text-muted">
            View, configure, and test the indexers attached to your {serviceLabel} instance.
          </p>
        </div>
        <button
          type="button"
          disabled={schemas.length === 0}
          onClick={() => setPickerOpen(true)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
        >
          Add indexer
        </button>
      </header>

      {loadError ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {loadError}
        </p>
      ) : null}
      {schemaError ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {schemaError}
        </p>
      ) : null}
      {deleteState.status === "error" && deleteState.message ? (
        <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {deleteState.message}
        </p>
      ) : null}
      {deleteState.status === "success" && deleteState.message ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {deleteState.message}
        </p>
      ) : null}

      {indexers.length === 0 ? (
        <p className="rounded-md border border-line/60 bg-panel-strong/40 px-3 py-4 text-sm text-muted">
          No indexers configured yet. Click <strong>Add indexer</strong> to attach one.
        </p>
      ) : (
        <ul className="space-y-2">
          {indexers.map((indexer) => (
            <li
              key={indexer.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line/60 bg-panel-strong/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{indexer.name}</p>
                <p className="text-xs text-muted">
                  {indexer.implementationName} · {indexer.protocol}
                  {indexer.priority ? ` · priority ${indexer.priority}` : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(indexer)}
                  className="rounded-full border border-line/70 bg-panel-strong px-3 py-1 text-xs font-medium text-foreground hover:bg-panel"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletePending}
                  onClick={() => handleDelete(indexer)}
                  className="rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ArrIndexerSchemaPickerModal
        open={pickerOpen}
        serviceLabel={serviceLabel}
        schemas={schemas}
        onClose={() => setPickerOpen(false)}
        onPick={handleAddPick}
      />

      <ArrIndexerEditorModal
        key={editorInstance}
        open={editorOpen}
        serviceType={serviceType}
        serviceLabel={serviceLabel}
        indexer={editorIndexer}
        schema={editorSchema}
        pending={savePending || testPending}
        testStatus={testState.status}
        testMessage={testState.message}
        testFailures={testState.testFailures}
        saveStatus={saveState.status === "test-failed" ? "idle" : saveState.status}
        saveMessage={saveState.message}
        onClose={closeEditor}
        onSave={handleSaveSubmit}
        onTest={handleTestSubmit}
      />
    </section>
  );
}
