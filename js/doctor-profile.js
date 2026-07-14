/* ==========================================================================
   DeepCariesScan — Doctor Profile Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   Replace RECENT_ACTIVITY and the stat data-count values with a real
   fetch, e.g. GET /api/doctors/me — keep the same shape and the render
   functions below work unchanged.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     ANIMATED STAT COUNTERS (same pattern as Dashboard)
     ------------------------------------------------------------------------ */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduceMotion) { el.textContent = target; return; }
    const duration = 900;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  document.querySelectorAll("[data-count]").forEach(animateCount);

  /* ------------------------------------------------------------------------
     RECENT ACTIVITY
     ------------------------------------------------------------------------ */
  const SEVERITY_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };
  const STATUS_BADGE = {
    complete: '<span class="dcs-badge dcs-badge--success">Complete</span>',
    review: '<span class="dcs-badge dcs-badge--warning">Needs review</span>',
  };

  const RECENT_ACTIVITY = [
    { name: "Ahmad Raza",    id: "PT-004821", date: "11 Jul 2026", severity: "d2", status: "review" },
    { name: "Sana Bibi",      id: "PT-004798", date: "10 Jul 2026", severity: "e",  status: "complete" },
    { name: "Bilal Hussain",  id: "PT-004777", date: "10 Jul 2026", severity: "p",  status: "complete" },
    { name: "Fatima Noor",    id: "PT-004761", date: "09 Jul 2026", severity: "d1", status: "complete" },
  ];

  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  function renderActivity() {
    const tbody = document.getElementById("activityBody");
    tbody.innerHTML = RECENT_ACTIVITY.map((a) => `
      <tr>
        <td>
          <div class="dcs-table__patient">
            <div class="dcs-patient-card__avatar" style="width:32px;height:32px;font-size:11px;">${initials(a.name)}</div>
            <div>
              <div class="dcs-table__patient-name">${a.name}</div>
              <div class="dcs-table__patient-id">${a.id}</div>
            </div>
          </div>
        </td>
        <td>${a.date}</td>
        <td><span class="dcs-badge dcs-badge--${a.severity}">${SEVERITY_LABEL[a.severity]}</span></td>
        <td>${STATUS_BADGE[a.status]}</td>
        <td><a href="ai-analysis.html?patient=${encodeURIComponent(a.id)}" class="dcs-btn dcs-btn--ghost dcs-btn--small dcs-focus-ring">View</a></td>
      </tr>
    `).join("");
  }
  renderActivity();

  /* ------------------------------------------------------------------------
     ACTIONS
     ------------------------------------------------------------------------ */
  document.getElementById("editProfileBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "info", title: "Edit profile", message: "Full profile editing (photo, credentials, department) will connect to the backend here." });
  });

  document.getElementById("saveBioBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "success", title: "Bio saved", message: "Your About section has been updated." });
  });
})();
