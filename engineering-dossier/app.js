(() => {
  "use strict";

  const root = document.documentElement;
  const themeButton = document.querySelector("#theme-toggle");
  const themeLabel = document.querySelector("#theme-label");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const themeModes = ["system", "dark", "light"];

  function readThemePreference() {
    try {
      const saved = localStorage.getItem("nooklet-dossier-theme");
      return themeModes.includes(saved) ? saved : "system";
    } catch {
      return "system";
    }
  }

  function resolvedTheme(mode) {
    if (mode !== "system") return mode;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function applyTheme(mode, persist = true) {
    if (mode === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = mode;
    }

    if (themeLabel) themeLabel.textContent = mode[0].toUpperCase() + mode.slice(1);
    if (themeButton) {
      const nextMode = themeModes[(themeModes.indexOf(mode) + 1) % themeModes.length];
      themeButton.dataset.mode = mode;
      themeButton.setAttribute(
        "aria-label",
        `Color theme: ${mode}. Change to ${nextMode}.`,
      );
      themeButton.title = `Theme: ${mode}`;
    }
    if (themeColor) {
      themeColor.setAttribute("content", resolvedTheme(mode) === "light" ? "#f6f1e9" : "#0f0e0d");
    }

    if (persist) {
      try {
        localStorage.setItem("nooklet-dossier-theme", mode);
      } catch {
        // Theme still applies for the current page when storage is unavailable.
      }
    }
  }

  let activeTheme = readThemePreference();
  applyTheme(activeTheme, false);

  themeButton?.addEventListener("click", () => {
    activeTheme = themeModes[(themeModes.indexOf(activeTheme) + 1) % themeModes.length];
    applyTheme(activeTheme);
  });

  const systemTheme = window.matchMedia("(prefers-color-scheme: light)");
  systemTheme.addEventListener?.("change", () => {
    if (activeTheme === "system") applyTheme("system", false);
  });

  const navToggle = document.querySelector("#nav-toggle");
  const siteNav = document.querySelector("#site-nav");

  function closeNavigation({ restoreFocus = false } = {}) {
    if (!navToggle || !siteNav) return;
    siteNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.querySelector(".sr-only").textContent = "Open site navigation";
    if (restoreFocus) navToggle.focus();
  }

  navToggle?.addEventListener("click", () => {
    const opening = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(opening));
    navToggle.querySelector(".sr-only").textContent = opening
      ? "Close site navigation"
      : "Open site navigation";
    siteNav?.classList.toggle("is-open", opening);
  });

  siteNav?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) closeNavigation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navToggle?.getAttribute("aria-expanded") === "true") {
      closeNavigation({ restoreFocus: true });
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeNavigation();
  }, { passive: true });

  const progressBar = document.querySelector("#reading-progress-bar");
  const header = document.querySelector("[data-header]");
  let scrollFrame = 0;

  function updateScrollState() {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
    if (progressBar) progressBar.style.width = `${progress * 100}%`;
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
    scrollFrame = 0;
  }

  function scheduleScrollUpdate() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateScrollState);
  }

  window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
  window.addEventListener("resize", scheduleScrollUpdate, { passive: true });
  updateScrollState();

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    try {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
      root.classList.add("reveal-ready");
      revealItems.forEach((item) => revealObserver.observe(item));
    } catch {
      revealItems.forEach((item) => item.classList.add("is-visible"));
    }
  }

  function observeSectionNavigation(navigation) {
    if (!(navigation instanceof Element)) return;
    const sectionLinks = Array.from(navigation.querySelectorAll('a[href^="#"]'));
    const observedSections = sectionLinks
      .map((link) => document.querySelector(link.getAttribute("href")))
      .filter((section) => section instanceof HTMLElement);

    if (!("IntersectionObserver" in window) || observedSections.length === 0) return;

    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      sectionLinks.forEach((link) => {
        if (link.getAttribute("href") === `#${visible.target.id}`) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }, { rootMargin: "-25% 0px -58%", threshold: [0.05, 0.2, 0.5] });
    observedSections.forEach((section) => sectionObserver.observe(section));
  }

  observeSectionNavigation(siteNav);
  document.querySelectorAll("[data-section-nav]").forEach(observeSectionNavigation);

  const guideSearch = document.querySelector("[data-guide-search]");

  if (guideSearch) {
    const searchInput = guideSearch.querySelector('input[type="search"]');
    const clearButton = guideSearch.querySelector("[data-guide-search-clear]");
    const status = guideSearch.querySelector("#guide-search-status");
    const items = Array.from(document.querySelectorAll("[data-guide-item]"));
    const groups = Array.from(document.querySelectorAll("[data-guide-group]"));
    const noResults = document.querySelector("[data-guide-no-results]");

    function searchableText(item) {
      return `${item.textContent} ${item.getAttribute("data-search") ?? ""}`
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase();
    }

    const indexedItems = items.map((item) => ({ item, text: searchableText(item) }));

    function updateGuideResults() {
      const query = searchInput?.value
        .trim()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase() ?? "";
      const terms = query.split(/\s+/).filter(Boolean);
      let visibleCount = 0;

      indexedItems.forEach(({ item, text }) => {
        const matches = terms.every((term) => text.includes(term));
        item.hidden = !matches;
        if (matches) visibleCount += 1;
      });

      groups.forEach((group) => {
        group.hidden = !group.querySelector("[data-guide-item]:not([hidden])");
      });

      if (noResults) noResults.hidden = visibleCount !== 0;
      if (status) {
        if (!query) {
          status.textContent = `Showing all ${items.length} guide topics.`;
        } else if (visibleCount === 1) {
          status.textContent = `One guide topic matches “${searchInput.value.trim()}”.`;
        } else {
          status.textContent = `${visibleCount} guide topics match “${searchInput.value.trim()}”.`;
        }
      }
    }

    searchInput?.addEventListener("input", updateGuideResults);
    clearButton?.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      updateGuideResults();
      searchInput.focus();
    });

    guideSearch.addEventListener("submit", (event) => event.preventDefault());
    guideSearch.classList.add("is-ready");
    updateGuideResults();
  }

  const capacityModel = document.querySelector("#capacity-model");

  if (capacityModel) {
    const freeInput = capacityModel.querySelector("#capacity-free");
    const activeInput = capacityModel.querySelector("#capacity-active");
    const freeOutput = capacityModel.querySelector("#capacity-free-output");
    const activeOutput = capacityModel.querySelector("#capacity-active-output");
    const resultValue = capacityModel.querySelector("#capacity-result-value");
    const resultStatus = capacityModel.querySelector("#capacity-result-status");
    const resultPanel = capacityModel.querySelector(".capacity-result");
    const budget = capacityModel.querySelector("#capacity-budget");
    const floorSegment = capacityModel.querySelector("#capacity-floor-segment");
    const activeSegment = capacityModel.querySelector("#capacity-active-segment");
    const archiveSegment = capacityModel.querySelector("#capacity-archive-segment");
    const unpackSegment = capacityModel.querySelector("#capacity-unpack-segment");
    const activeReserveValue = capacityModel.querySelector("#capacity-active-reserve-value");
    const archiveValue = capacityModel.querySelector("#capacity-archive-value");
    const unpackValue = capacityModel.querySelector("#capacity-unpack-value");
    const safetyReserveGiB = 0.5;

    function formatGiB(value) {
      if (value === 0) return "0 GiB";
      return `${value.toFixed(1).replace(/\.0$/, "")} GiB`;
    }

    function setSegmentSize(segment, value, total) {
      if (!segment) return;
      const percent = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
      segment.style.flexBasis = `${percent}%`;
    }

    function updateCapacityModel() {
      if (!(freeInput instanceof HTMLInputElement) || !(activeInput instanceof HTMLInputElement)) return;

      const freeGiB = Number.parseFloat(freeInput.value);
      const activeReservationGiB = Number.parseFloat(activeInput.value);
      const processingReservationGiB = safetyReserveGiB + activeReservationGiB;
      const availableGiB = Math.max(0, freeGiB - processingReservationGiB);
      const maximumNewGiB = availableGiB / 2;
      const blockedByGiB = Math.max(0, processingReservationGiB - freeGiB);
      const visibleFloorGiB = Math.min(freeGiB, safetyReserveGiB);
      const visibleActiveGiB = Math.min(Math.max(0, freeGiB - visibleFloorGiB), activeReservationGiB);

      if (freeOutput) freeOutput.textContent = formatGiB(freeGiB);
      if (activeOutput) activeOutput.textContent = formatGiB(activeReservationGiB);
      if (resultValue) resultValue.textContent = formatGiB(maximumNewGiB);
      if (activeReserveValue) activeReserveValue.textContent = formatGiB(activeReservationGiB);
      if (archiveValue) archiveValue.textContent = formatGiB(maximumNewGiB);
      if (unpackValue) unpackValue.textContent = formatGiB(maximumNewGiB);

      freeInput.setAttribute("aria-valuetext", formatGiB(freeGiB));
      activeInput.setAttribute("aria-valuetext", formatGiB(activeReservationGiB));

      setSegmentSize(floorSegment, visibleFloorGiB, freeGiB);
      setSegmentSize(activeSegment, visibleActiveGiB, freeGiB);
      setSegmentSize(archiveSegment, maximumNewGiB, freeGiB);
      setSegmentSize(unpackSegment, maximumNewGiB, freeGiB);

      const blocked = blockedByGiB > 0;
      resultPanel?.classList.toggle("is-blocked", blocked);
      if (resultStatus) {
        resultStatus.textContent = blocked
          ? `Active work and the safety floor exceed free capacity by ${formatGiB(blockedByGiB)}. A new request would be blocked.`
          : "Request can be admitted at or below this declared size.";
      }

      budget?.setAttribute(
        "aria-label",
        blocked
          ? `Capacity blocked: ${formatGiB(freeGiB)} free, ${formatGiB(processingReservationGiB)} reserved for active work and the safety floor.`
          : `Capacity budget: ${formatGiB(safetyReserveGiB)} safety floor, ${formatGiB(activeReservationGiB)} active-work reservation, ${formatGiB(maximumNewGiB)} new archive, and ${formatGiB(maximumNewGiB)} unpack headroom.`,
      );
    }

    freeInput?.addEventListener("input", updateCapacityModel);
    activeInput?.addEventListener("input", updateCapacityModel);
    updateCapacityModel();
  }

  const copyStatus = document.querySelector("#copy-status");

  function copyWithSelection(text) {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    return copied;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await Promise.race([
          navigator.clipboard.writeText(text),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error("Clipboard timed out.")), 600)),
        ]);
        return;
      } catch {
        // Fall through to the selection-based copy path.
      }
    }

    if (!copyWithSelection(text)) throw new Error("Copy command was unavailable.");
  }

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.dataset.copyReady = "true";
    button.addEventListener("click", async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      if (!target) return;
      const originalLabel = button.textContent;
      try {
        await copyText(target.textContent.trim());
        button.textContent = "Copied";
        if (copyStatus) copyStatus.textContent = "Command copied to the clipboard.";
      } catch {
        button.textContent = "Select text";
        if (copyStatus) copyStatus.textContent = "Copy was unavailable. Select the command text instead.";
      }
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1800);
    });
  });

  const printableDetails = Array.from(document.querySelectorAll("details"));
  const printDetailState = new Map();

  window.addEventListener("beforeprint", () => {
    printableDetails.forEach((details) => {
      printDetailState.set(details, details.open);
      details.open = true;
    });
  });

  window.addEventListener("afterprint", () => {
    printableDetails.forEach((details) => {
      details.open = printDetailState.get(details) ?? false;
    });
    printDetailState.clear();
  });
})();
