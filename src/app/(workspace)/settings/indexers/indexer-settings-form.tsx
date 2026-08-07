"use client";

import { ChevronDown, PlugZap, Save, Trash2, Wifi } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
    addIndexerAction,
    removeIndexerAction,
    testIndexerAction,
    updateIndexerAction,
} from "@/app/(workspace)/settings/indexers/actions";
import {
    initialIndexerActionState,
    type IndexerActionState,
} from "@/app/(workspace)/settings/indexers/action-state";
import { Button } from "@/components/ui/button";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";
import { type IndexerSettingsView } from "@/modules/indexers/queries/list-indexer-settings";

import { getIndexerProviderPreset, indexerProviderPresets } from "./indexer-presets";

function StatusBanner({ state }: { state: IndexerActionState }) {
    if (state.status === "idle" || !state.message) {
        return null;
    }

    return (
        <InlineAlert
            variant={state.status === "success" ? "info" : "error"}
            className="py-2 text-foreground"
        >
            {state.message}
        </InlineAlert>
    );
}

function hasCategory(
    indexer: IndexerSettingsView | undefined,
    mediaType: "movie" | "tv",
    categoryId: string,
) {
    return (
        indexer?.categories.some(
            (category) => category.mediaType === mediaType && category.categoryId === categoryId,
        ) ?? false
    );
}

function customCategoryValues(indexer: IndexerSettingsView | undefined, mediaType: "movie" | "tv") {
    const standardId = mediaType === "movie" ? "2000" : "5000";

    return (
        indexer?.categories
            .filter(
                (category) =>
                    category.mediaType === mediaType && category.categoryId !== standardId,
            )
            .map((category) => category.categoryId)
            .join(", ") ?? ""
    );
}

function SaveButtons({ isEditing, disabled = false }: { isEditing: boolean; disabled?: boolean }) {
    const { pending, data } = useFormStatus();
    const intent = pending ? String(data?.get("intent") ?? "") : null;

    return (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
                type="submit"
                name="intent"
                value="test-save"
                className="w-full sm:w-auto"
                disabled={pending || disabled}
            >
                {isEditing ? (
                    <Save aria-hidden="true" size={17} />
                ) : (
                    <PlugZap aria-hidden="true" size={17} />
                )}
                {intent === "test-save" ? "Testing..." : isEditing ? "Test & save" : "Test & add"}
            </Button>
            <Button
                type="submit"
                name="intent"
                value="save"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={pending || disabled}
            >
                {intent === "save" ? "Saving..." : "Save without testing"}
            </Button>
        </div>
    );
}

function TestButton({ disabled = false }: { disabled?: boolean }) {
    const { pending } = useFormStatus();

    return (
        <Button
            type="submit"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={pending || disabled}
        >
            <Wifi aria-hidden="true" size={17} />
            {pending ? "Testing..." : "Test connection"}
        </Button>
    );
}

export function IndexerSettingsForm({ indexer }: { indexer?: IndexerSettingsView }) {
    const isEditing = Boolean(indexer);
    const inferredPreset =
        indexerProviderPresets.find(
            (preset) => preset.baseUrl && preset.baseUrl === indexer?.baseUrl,
        )?.id ?? "generic";
    const [providerPreset, setProviderPreset] = useState(inferredPreset);
    const [name, setName] = useState(indexer?.name ?? "");
    const [baseUrl, setBaseUrl] = useState(indexer?.baseUrl ?? "");
    const [apiPath, setApiPath] = useState(indexer?.apiPath ?? "/api");
    const [protocol, setProtocol] = useState<"newznab" | "torznab">(indexer?.protocol ?? "newznab");
    const [editOpen, setEditOpen] = useState(!indexer);
    const [removeOpen, setRemoveOpen] = useState(false);
    const removeSubmitRef = useRef<HTMLButtonElement | null>(null);
    const legacyTorznab = protocol === "torznab";
    const [state, formAction] = useActionState(
        isEditing ? updateIndexerAction : addIndexerAction,
        initialIndexerActionState,
    );
    const [testState, testAction] = useActionState(testIndexerAction, initialIndexerActionState);
    const [removeState, removeAction, removePending] = useActionState(
        removeIndexerAction,
        initialIndexerActionState,
    );

    function applyPreset(presetId: string) {
        const preset = getIndexerProviderPreset(presetId);

        setProviderPreset(preset.id);

        if (preset.id !== "generic") {
            setName(preset.name);
            setBaseUrl(preset.baseUrl);
            setApiPath(preset.apiPath);
        }
    }

    return (
        <div className="space-y-4">
            {indexer ? (
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-foreground">{indexer.name}</h3>
                                <span className="rounded-full border border-cream/[0.08] bg-cream/[0.04] px-3 py-1 text-xs font-semibold capitalize text-muted">
                                    {indexer.status}
                                </span>
                                {!indexer.isEnabled ? (
                                    <span className="rounded-full border border-cream/[0.08] bg-cream/[0.04] px-3 py-1 text-xs font-semibold text-muted">
                                        Disabled
                                    </span>
                                ) : null}
                            </div>
                            <p className="mt-1 truncate text-sm text-muted" title={indexer.baseUrl}>
                                {indexer.baseUrl}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted">
                                Search order {indexer.priority} ·{" "}
                                {indexer.categories.length > 0
                                    ? Array.from(
                                          new Set(
                                              indexer.categories.map((category) =>
                                                  category.mediaType === "tv" ? "TV" : "Movies",
                                              ),
                                          ),
                                      ).join(" and ")
                                    : "No media categories"}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setEditOpen((open) => !open)}
                            >
                                {editOpen ? "Close editor" : "Edit"}
                            </Button>
                            <form action={testAction}>
                                <input type="hidden" name="id" value={indexer.id} />
                                <TestButton disabled={legacyTorznab} />
                            </form>
                            <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() => setRemoveOpen(true)}
                            >
                                <Trash2 aria-hidden="true" size={16} />
                                Remove
                            </Button>
                        </div>
                    </div>
                    <StatusBanner state={testState} />
                    <StatusBanner state={removeState} />
                    {indexer.statusMessage ? (
                        <p className="text-sm leading-6 text-muted">{indexer.statusMessage}</p>
                    ) : null}
                </div>
            ) : null}

            {legacyTorznab ? (
                <InlineAlert variant="warning">
                    Torznab is not supported by this Usenet-only downloader. Switch this indexer to
                    Newznab before saving or testing it.
                </InlineAlert>
            ) : null}

            {editOpen ? (
                <form
                    action={formAction}
                    className="max-w-3xl space-y-5 border-t border-cream/[0.07] pt-4"
                >
                    {indexer ? <input type="hidden" name="id" value={indexer.id} /> : null}
                    <StatusBanner state={state} />

                    <label className="block space-y-1.5 text-sm">
                        <span className="font-medium text-foreground">Provider</span>
                        <select
                            value={providerPreset}
                            onChange={(event) => applyPreset(event.target.value)}
                            className="min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3.5 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
                        >
                            {indexerProviderPresets.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                    {preset.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[13px] leading-5 text-muted">
                            {getIndexerProviderPreset(providerPreset).description} Review the URL
                            against the provider account page before saving.
                        </p>
                    </label>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-foreground">Display name</span>
                            <Input
                                name="name"
                                placeholder="My indexer"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                required
                            />
                        </label>
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-foreground">Protocol</span>
                            <select
                                name="protocol"
                                value={protocol}
                                onChange={(event) =>
                                    setProtocol(event.target.value as "newznab" | "torznab")
                                }
                                className="min-h-11 w-full rounded-lg border border-cream/[0.10] bg-cream/[0.04] px-3.5 py-2 text-sm text-foreground outline-none transition focus:border-focus focus:ring-2 focus:ring-focus/25"
                            >
                                <option value="newznab">Newznab (Usenet)</option>
                                {indexer?.protocol === "torznab" ? (
                                    <option value="torznab" disabled>
                                        Torznab (unsupported)
                                    </option>
                                ) : null}
                            </select>
                        </label>
                    </div>

                    <label className="block space-y-1.5 text-sm">
                        <span className="font-medium text-foreground">Indexer URL</span>
                        <Input
                            name="baseUrl"
                            type="url"
                            placeholder="https://indexer.example.com"
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            required
                        />
                        <p className="text-[13px] leading-5 text-muted">
                            Use the HTTPS Newznab host from your provider. Nooklet adds the API path
                            below.
                        </p>
                    </label>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-foreground">API key</span>
                            <Input
                                name="apiKey"
                                type="password"
                                autoComplete="new-password"
                                placeholder={
                                    indexer
                                        ? "Leave blank to keep saved key"
                                        : "Paste provider API key"
                                }
                                required={!indexer}
                            />
                        </label>
                        <label className="space-y-1.5 text-sm">
                            <span className="font-medium text-foreground">Search order</span>
                            <Input
                                name="priority"
                                type="number"
                                min={0}
                                max={100}
                                defaultValue={indexer?.priority ?? 0}
                            />
                            <p className="text-[12px] leading-5 text-muted">
                                Lower numbers run first.
                            </p>
                        </label>
                    </div>

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-foreground">
                            Search this indexer for
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-cream/[0.10] bg-cream/[0.03] px-3.5 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    name="movieCategory"
                                    value="2000"
                                    defaultChecked={
                                        hasCategory(indexer, "movie", "2000") || !indexer
                                    }
                                    className="h-4 w-4 accent-accent"
                                />
                                <span>Movies</span>
                            </label>
                            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-cream/[0.10] bg-cream/[0.03] px-3.5 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    name="tvCategory"
                                    value="5000"
                                    defaultChecked={hasCategory(indexer, "tv", "5000") || !indexer}
                                    className="h-4 w-4 accent-accent"
                                />
                                <span>TV series</span>
                            </label>
                        </div>
                        <p className="text-[13px] leading-5 text-muted">
                            These standard Newznab categories work for most providers.
                        </p>
                    </fieldset>

                    <details className="rounded-lg border border-cream/[0.08] bg-cream/[0.02]">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-medium text-foreground">
                            Advanced provider settings
                            <ChevronDown aria-hidden="true" size={17} className="text-muted" />
                        </summary>
                        <div className="grid gap-4 border-t border-cream/[0.07] p-3.5 md:grid-cols-2">
                            <label className="space-y-1.5 text-sm">
                                <span className="font-medium text-foreground">
                                    Additional movie category IDs
                                </span>
                                <Input
                                    name="movieCustomCategories"
                                    placeholder="2040"
                                    defaultValue={customCategoryValues(indexer, "movie")}
                                />
                            </label>
                            <label className="space-y-1.5 text-sm">
                                <span className="font-medium text-foreground">
                                    Additional TV category IDs
                                </span>
                                <Input
                                    name="tvCustomCategories"
                                    placeholder="5040"
                                    defaultValue={customCategoryValues(indexer, "tv")}
                                />
                            </label>
                            <label className="space-y-1.5 text-sm md:col-span-2">
                                <span className="font-medium text-foreground">API path</span>
                                <Input
                                    name="apiPath"
                                    value={apiPath}
                                    onChange={(event) => setApiPath(event.target.value)}
                                    required
                                />
                                <p className="text-[13px] leading-5 text-muted">
                                    Usually <code>/api</code>. Change it only when your provider
                                    documents another Newznab path.
                                </p>
                            </label>
                        </div>
                    </details>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                            <input
                                type="checkbox"
                                name="isEnabled"
                                defaultChecked={indexer?.isEnabled ?? true}
                                className="h-4 w-4 accent-accent"
                            />
                            <span>Use this indexer in searches</span>
                        </label>
                        <SaveButtons isEditing={isEditing} disabled={legacyTorznab} />
                    </div>
                    <p className="text-[13px] leading-5 text-muted">
                        Test & save checks these draft values first. If the test fails, the
                        currently saved indexer remains unchanged.
                    </p>
                </form>
            ) : null}

            {indexer ? (
                <>
                    <form action={removeAction} className="hidden" aria-hidden="true">
                        <input type="hidden" name="id" value={indexer.id} />
                        <button ref={removeSubmitRef} type="submit" tabIndex={-1} />
                    </form>
                    <AlertDialog
                        open={removeOpen}
                        title={"Remove " + indexer.name + "?"}
                        description={
                            <p>
                                Nooklet will remove its saved API key and categories. Existing
                                activity history remains, but future searches will no longer use
                                this indexer.
                            </p>
                        }
                        confirmLabel="Remove indexer"
                        pending={removePending}
                        onClose={() => setRemoveOpen(false)}
                        onConfirm={() => {
                            setRemoveOpen(false);
                            removeSubmitRef.current?.click();
                        }}
                    />
                </>
            ) : null}
        </div>
    );
}
