/* ==========================================================================
   DeepCariesScan — 404 / Error Page Behavior
   Vanilla JS, no framework (Design Bible §15).

   This single file covers every error state DeepCariesScan can show
   (404, 403, 500, offline) so Flask can route any error handler here,
   e.g.: return render_template("404.html", code=404), or redirect to
   "/404.html?code=500" for a server error page.

   The "Preview" row at the bottom is a demo/QA convenience for reviewing
   every state without deploying multiple pages — remove it in production
   if you don't want reviewers switching states manually.
   ========================================================================== */

(function () {
  "use strict";

  const STATES = {
    404: {
      title: "Page not found",
      desc: "The page you're looking for doesn't exist, may have moved, or the link might be outdated.",
      color: "var(--clinical-teal)",
      glow: "var(--icy-mint)",
      brows: { left: "M18 22l10 4", right: "M36 26l10-4" },
      mouth: "M25 41q7 4 14 0",
      showSearch: true,
      primary: { label: "Back to Dashboard", href: "dashboard.html" },
    },
    403: {
      title: "You don't have access to this page",
      desc: "Your account doesn't have permission to view this. If you think this is a mistake, contact your clinic administrator.",
      color: "var(--severity-d2)",
      glow: "var(--severity-d2)",
      brows: { left: "M18 25h10", right: "M36 25h10" },
      mouth: "M25 42h14",
      showSearch: false,
      primary: { label: "Back to Dashboard", href: "dashboard.html" },
    },
    500: {
      title: "Something went wrong on our end",
      desc: "An unexpected error occurred while processing your request. Please try again in a moment — no patient data was lost.",
      color: "var(--severity-p)",
      glow: "var(--severity-p)",
      brows: { left: "M18 27l10-5", right: "M36 22l10 5" },
      mouth: "M25 43q7 -4 14 0",
      showSearch: false,
      primary: { label: "Back to Dashboard", href: "dashboard.html" },
    },
    offline: {
      title: "You're offline",
      desc: "DeepCariesScan can't reach the server right now. Check your connection and try again.",
      color: "var(--icy-blue)",
      glow: "var(--icy-blue)",
      brows: { left: "M18 24h10", right: "M36 24h10" },
      mouth: "M25 41h14",
      showSearch: false,
      primary: { label: "Try again", href: "" }, // handled specially — reloads the page
    },
  };

  const errorCode = document.getElementById("errorCode");
  const errorTitle = document.getElementById("errorTitle");
  const errorDesc = document.getElementById("errorDesc");
  const errorSearch = document.getElementById("errorSearch");
  const primaryActionBtn = document.getElementById("primaryActionBtn");
  const mascotFace = document.getElementById("mascotFace");
  const mascotGlow = document.getElementById("mascotGlow");
  const mascotMouth = document.getElementById("mascotMouth");
  const browLeft = document.getElementById("browLeft");
  const browRight = document.getElementById("browRight");
  const switchButtons = document.querySelectorAll(".dcs-error-demo-switch button");

  function render(code) {
    const state = STATES[code] || STATES[404];

    errorCode.textContent = code === "offline" ? "⚡" : code;
    errorCode.style.color = state.color;
    errorTitle.textContent = state.title;
    errorDesc.textContent = state.desc;
    errorSearch.hidden = !state.showSearch;

    mascotFace.setAttribute("fill", state.color);
    mascotGlow.setAttribute("stroke", state.glow);
    mascotMouth.setAttribute("d", state.mouth);
    browLeft.setAttribute("d", state.brows.left);
    browRight.setAttribute("d", state.brows.right);

    if (code === "offline") {
      primaryActionBtn.textContent = "";
      primaryActionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Try again`;
      primaryActionBtn.removeAttribute("href");
      primaryActionBtn.onclick = () => window.location.reload();
    } else {
      primaryActionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> ${state.primary.label}`;
      primaryActionBtn.setAttribute("href", state.primary.href);
      primaryActionBtn.onclick = null;
    }

    document.title = `${state.title} · DeepCariesScan`;

    switchButtons.forEach((btn) => btn.classList.toggle("dcs-active", btn.dataset.code === String(code)));
  }

  switchButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.code;
      render(code);
      const url = new URL(window.location.href);
      url.searchParams.set("code", code);
      window.history.replaceState({}, "", url);
    });
  });

  document.getElementById("goBackBtn").addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "dashboard.html";
  });

  document.getElementById("errorSearchInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.value.trim()) {
      window.location.href = `patient-history.html?search=${encodeURIComponent(e.target.value.trim())}`;
    }
  });

  /* ------------------------------------------------------------------------
     INIT — read ?code= from the URL, default to 404
     ------------------------------------------------------------------------ */
  const params = new URLSearchParams(window.location.search);
  const initialCode = params.get("code") || "404";
  render(STATES[initialCode] ? initialCode : "404");
})();
