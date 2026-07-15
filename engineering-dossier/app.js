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
    navToggle.querySelector(".sr-only").textContent = "Open section navigation";
    if (restoreFocus) navToggle.focus();
  }

  navToggle?.addEventListener("click", () => {
    const opening = navToggle.getAttribute("aria-expanded") !== "true";
    navToggle.setAttribute("aria-expanded", String(opening));
    navToggle.querySelector(".sr-only").textContent = opening
      ? "Close section navigation"
      : "Open section navigation";
    siteNav?.classList.toggle("is-open", opening);
  });

  siteNav?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) closeNavigation();
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
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    revealItems.forEach((item) => revealObserver.observe(item));
  }

  const sectionLinks = Array.from(siteNav?.querySelectorAll('a[href^="#"]') ?? []);
  const observedSections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter((section) => section instanceof HTMLElement);

  if ("IntersectionObserver" in window && observedSections.length > 0) {
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
})();
