/* ==========================================================================
   DeepCariesScan — Theme Toggle (dark mode)
   Vanilla JS, no framework (Design Bible §15).

   The actual theme is already applied before this file loads, by a small
   inline flash-safe script in each page's <head> (reads localStorage,
   falls back to the OS preference, sets data-theme on <html> before
   paint). This file only needs to:
     1. keep the toggle button(s) in sync with the current theme,
     2. flip the theme + persist it when a toggle is clicked,
     3. keep multiple open tabs in sync,
     4. follow the OS theme if the person hasn't explicitly chosen one.

   Every page includes a button with class "dcs-theme-toggle" (topbar,
   login page, 404 page) — this file wires up all of them at once.
   ========================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "dcs-theme";

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function syncToggleButtons(theme) {
    document.querySelectorAll(".dcs-theme-toggle").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(theme === "dark"));
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    syncToggleButtons(theme);
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (err) {
      // localStorage unavailable (private browsing, etc.) — theme just
      // won't persist across reloads, but still works for this session.
    }
    applyTheme(next);
  }

  // The inline head script already set data-theme before this ran —
  // just make sure every toggle button reflects that.
  syncToggleButtons(currentTheme());

  document.querySelectorAll(".dcs-theme-toggle").forEach((btn) => {
    btn.addEventListener("click", toggleTheme);
  });

  // Keep every open tab/page in sync if the theme changes elsewhere
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && (e.newValue === "dark" || e.newValue === "light")) {
      applyTheme(e.newValue);
    }
  });

  // Follow the OS theme live, but only for as long as the person hasn't
  // made an explicit choice on this device.
  let hasExplicitChoice = false;
  try {
    hasExplicitChoice = !!localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    hasExplicitChoice = false;
  }

  if (!hasExplicitChoice && window.matchMedia) {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = (e) => {
      let stillNoChoice = false;
      try {
        stillNoChoice = !localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        stillNoChoice = true;
      }
      if (stillNoChoice) applyTheme(e.matches ? "dark" : "light");
    };
    if (mql.addEventListener) mql.addEventListener("change", onSystemChange);
    else if (mql.addListener) mql.addListener(onSystemChange); // older Safari
  }
})();
