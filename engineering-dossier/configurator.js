import { createSetupCommand } from "./configurator-core.js";

const root = document.querySelector("[data-configurator]");

if (root) {
    const form = root.querySelector("[data-configurator-form]");
    const driveList = root.querySelector("[data-drive-list]");
    const downloadInput = root.querySelector("#quick-download-path");
    const downloadError = root.querySelector("[data-download-error]");
    const status = root.querySelector("[data-configurator-status]");
    const result = root.querySelector("[data-command-result]");
    const resultTitle = root.querySelector("#quick-command-title");
    const commandOutput = root.querySelector("[data-command-output]");
    const mappingSummary = root.querySelector("[data-mapping-summary]");
    const copyButton = root.querySelector("[data-copy-command]");
    const copyStatus = document.querySelector("#copy-status");
    let sequence = root.querySelectorAll("[data-drive-row]").length;
    let generatedCommand = "";

    function platform() {
        return form.querySelector('input[name="platform"]:checked')?.value ?? "";
    }

    function placeholder(type) {
        if (platform() === "windows") {
            return type === "tv" ? "D:/Media/TV" : "D:/Media/Movies";
        }

        if (platform() === "macos") {
            return type === "tv" ? "/Volumes/Media/TV" : "/Volumes/Media/Movies";
        }

        return type === "tv" ? "/srv/media/tv" : "/srv/media/movies";
    }

    function downloadPlaceholder() {
        if (platform() === "windows") {
            return "F:/Nooklet/Downloads";
        }

        if (platform() === "macos") {
            return "/Volumes/FastDisk/Nooklet";
        }

        return "/mnt/downloads/nooklet";
    }

    function prepareRow(row, index) {
        const input = row.querySelector("[data-drive-path]");
        const select = row.querySelector("[data-drive-type]");
        const remove = row.querySelector("[data-remove-drive]");
        const error = row.querySelector("[data-drive-error]");

        if (!input || !select || !remove || !error) {
            return;
        }

        const number = index + 1;

        if (!input.id) {
            input.id = `drive-path-${number}`;
        }

        error.id = `${input.id}-error`;
        input.setAttribute("aria-describedby", error.id);
        input.setAttribute("aria-label", `Host folder ${number}`);
        input.placeholder = placeholder(select.value);
        select.setAttribute("aria-label", `Library type for folder ${number}`);
        remove.setAttribute("aria-label", `Remove folder ${number}`);
    }

    function refreshRows() {
        root.querySelectorAll("[data-drive-row]").forEach(prepareRow);
        downloadInput.placeholder = downloadPlaceholder();
    }

    function makeRow() {
        sequence += 1;
        const row = document.createElement("div");
        const typeLabel = document.createElement("label");
        const typeText = document.createElement("span");
        const select = document.createElement("select");
        const movieOption = document.createElement("option");
        const tvOption = document.createElement("option");
        const pathLabel = document.createElement("label");
        const pathText = document.createElement("span");
        const input = document.createElement("input");
        const remove = document.createElement("button");
        const error = document.createElement("p");

        row.className = "quick-drive-row";
        row.dataset.driveRow = "";
        typeText.textContent = "Library";
        select.dataset.driveType = "";
        movieOption.value = "movies";
        movieOption.textContent = "Movies";
        tvOption.value = "tv";
        tvOption.textContent = "TV";
        select.append(movieOption, tvOption);
        typeLabel.append(typeText, select);
        pathText.textContent = "Host folder";
        input.id = `drive-path-${sequence}`;
        input.type = "text";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.dataset.drivePath = "";
        pathLabel.append(pathText, input);
        remove.type = "button";
        remove.dataset.removeDrive = "";
        remove.textContent = "Remove";
        error.dataset.driveError = "";
        error.hidden = true;
        row.append(typeLabel, pathLabel, remove, error);

        return row;
    }

    function collectInput() {
        return {
            platform: platform(),
            downloadPath: downloadInput.value,
            libraries: Array.from(root.querySelectorAll("[data-drive-row]")).map((row) => {
                const input = row.querySelector("[data-drive-path]");

                return {
                    type: row.querySelector("[data-drive-type]")?.value,
                    path: input?.value ?? "",
                    field: input?.id,
                };
            }),
        };
    }

    function clearErrors() {
        root.querySelectorAll('[aria-invalid="true"]').forEach((field) => {
            field.removeAttribute("aria-invalid");
        });
        root.querySelectorAll("[data-drive-error]").forEach((message) => {
            message.hidden = true;
            message.textContent = "";
        });
        downloadError.hidden = true;
        downloadError.textContent = "";
    }

    function showErrors(errors) {
        clearErrors();

        for (const item of errors) {
            const field = document.getElementById(item.field);

            if (field) {
                field.setAttribute("aria-invalid", "true");
            }

            if (item.field === "quick-download-path") {
                downloadError.textContent = item.message;
                downloadError.hidden = false;
            } else if (field) {
                const message = field
                    .closest("[data-drive-row]")
                    ?.querySelector("[data-drive-error]");

                if (message) {
                    message.textContent = item.message;
                    message.hidden = false;
                }
            }
        }

        status.textContent =
            errors.length === 1
                ? errors[0].message
                : `${errors.length} folder details need attention.`;
        const firstField = document.getElementById(errors[0]?.field);

        firstField?.focus();
    }

    function renderMappings(mappings) {
        mappingSummary.replaceChildren(
            ...mappings.map(({ label, path, target }) => {
                const item = document.createElement("li");
                const labelNode = document.createElement("span");
                const pathNode = document.createElement("strong");
                const targetNode = document.createElement("code");

                labelNode.textContent = label;
                pathNode.textContent = path;
                targetNode.textContent = `→ ${target}`;
                item.append(labelNode, pathNode, targetNode);

                return item;
            }),
        );
    }

    function clearResult(message) {
        generatedCommand = "";
        commandOutput.textContent = "";
        mappingSummary.replaceChildren();
        result.hidden = true;

        if (message) {
            status.textContent = message;
        }
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);

                return;
            } catch {
                // Continue to the selection-based fallback.
            }
        }

        const fallback = document.createElement("textarea");

        fallback.value = text;
        fallback.readOnly = true;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        const copied = document.execCommand("copy");

        fallback.remove();

        if (!copied) {
            throw new Error("Copy unavailable.");
        }
    }

    const detectedPlatform = (
        navigator.userAgentData?.platform ??
        navigator.platform ??
        ""
    ).toLocaleLowerCase();
    const detectedValue = detectedPlatform.includes("mac")
        ? "macos"
        : detectedPlatform.includes("linux")
          ? "linux"
          : detectedPlatform.includes("win")
            ? "windows"
            : "";
    const detectedRadio = form.querySelector(`input[name="platform"][value="${detectedValue}"]`);

    if (detectedRadio) {
        detectedRadio.checked = true;
    }

    refreshRows();

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        try {
            const setup = createSetupCommand(collectInput());

            if (!setup.value) {
                clearResult();
                showErrors(setup.errors);

                return;
            }

            clearErrors();
            generatedCommand = setup.command;
            commandOutput.textContent = setup.command;
            renderMappings(setup.mappings);
            result.hidden = false;
            status.textContent =
                "Complete setup command generated locally. Keep this exact command until Nooklet starts.";
            resultTitle.focus({ preventScroll: true });
            result.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            clearResult();
            status.textContent =
                error instanceof Error ? error.message : "Could not generate the setup command.";
        }
    });

    form.addEventListener("input", () => {
        clearErrors();

        if (generatedCommand) {
            clearResult("Folders changed. Generate a fresh setup command.");
        }
    });

    form.addEventListener("change", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }

        if (event.target.matches('[name="platform"], [data-drive-type]')) {
            refreshRows();

            if (generatedCommand) {
                clearResult("Folders changed. Generate a fresh setup command.");
            }
        }
    });

    root.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
            return;
        }

        const add = event.target.closest("[data-add-drive]");

        if (add) {
            if (generatedCommand) {
                clearResult("Folders changed. Generate a fresh setup command.");
            }

            const row = makeRow();

            driveList.appendChild(row);
            refreshRows();
            row.querySelector("[data-drive-path]")?.focus();

            return;
        }

        const remove = event.target.closest("[data-remove-drive]");

        if (remove) {
            if (generatedCommand) {
                clearResult("Folders changed. Generate a fresh setup command.");
            }

            const row = remove.closest("[data-drive-row]");
            const fallback = row?.previousElementSibling ?? row?.nextElementSibling;

            row?.remove();
            refreshRows();
            fallback?.querySelector("[data-drive-path]")?.focus();
        }
    });

    copyButton.addEventListener("click", async () => {
        if (!generatedCommand) {
            return;
        }

        const label = copyButton.textContent;

        try {
            await copyText(generatedCommand);
            copyButton.textContent = "Copied";
            status.textContent =
                "Setup command copied. If Docker restarts, disconnects, or reports EOF, wait for its engine and paste this same command again.";

            if (copyStatus) {
                copyStatus.textContent = "Complete Docker setup command copied.";
            }
        } catch {
            copyButton.textContent = "Select command";
            status.textContent = "Clipboard access was unavailable. Select the command text.";
        }

        window.setTimeout(() => {
            copyButton.textContent = label;
        }, 1800);
    });

    window.addEventListener("pagehide", () => clearResult());
}
