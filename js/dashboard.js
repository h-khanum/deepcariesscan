/* ==========================================================================
   DeepCariesScan — Dashboard Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   Every data block below (stat cards, severity counts, recent scans) is
   mock data shaped exactly like what the real endpoints should return.
   Replace the three constants (STAT DATA is inline in dashboard.html,
   SEVERITY_DATA, RECENT_SCANS below) with a fetch, e.g.:

     const res = await fetch("/api/dashboard/summary");
     const { severity, recentScans } = await res.json();

   Keep the same shape (severity: [{key,label,count}], recentScans: [{...}])
   and the render functions below will work unchanged.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     Time-aware greeting
     ------------------------------------------------------------------------ */
  const greetingEl = document.getElementById("greeting");
  if (greetingEl) {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    greetingEl.textContent = `Good ${timeOfDay}, Dr. Tariq`;
  }

  /* ------------------------------------------------------------------------
     Animated stat counters — subtle, respects prefers-reduced-motion
     ------------------------------------------------------------------------ */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduceMotion) {
      el.textContent = target;
      return;
    }
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
     Severity distribution
     ------------------------------------------------------------------------ */
  const SEVERITY_DATA = [
    { key: "e",  label: "Enamel",    count: 148, token: "--severity-e" },
    { key: "d1", label: "Dentin 1",  count: 96,  token: "--severity-d1" },
    { key: "d2", label: "Dentin 2",  count: 62,  token: "--severity-d2" },
    { key: "d3", label: "Dentin 3",  count: 28,  token: "--severity-d3" },
    { key: "p",  label: "Pulp",      count: 8,   token: "--severity-p" },
  ];

  function renderSeverityRows() {
    const container = document.getElementById("severityRows");
    if (!container) return;
    const max = Math.max(...SEVERITY_DATA.map((d) => d.count));

    container.innerHTML = SEVERITY_DATA.map((d) => `
      <div class="dcs-severity-row">
        <span class="dcs-severity-row__label">
          <span class="dcs-severity-row__dot" style="background:var(${d.token})"></span>
          ${d.label}
        </span>
        <span class="dcs-severity-row__bar">
          <span class="dcs-severity-row__bar-fill" data-width="${(d.count / max) * 100}" style="background:var(${d.token})"></span>
        </span>
        <span class="dcs-severity-row__count">${d.count}</span>
      </div>
    `).join("");

    // animate widths on next frame so the CSS transition is visible
    requestAnimationFrame(() => {
      container.querySelectorAll(".dcs-severity-row__bar-fill").forEach((el) => {
        el.style.width = reduceMotion ? el.dataset.width + "%" : "0%";
      });
      requestAnimationFrame(() => {
        container.querySelectorAll(".dcs-severity-row__bar-fill").forEach((el) => {
          el.style.width = el.dataset.width + "%";
        });
      });
    });
  }

  renderSeverityRows();

  /* ------------------------------------------------------------------------
     Recent scans table
     ------------------------------------------------------------------------ */
  const SEVERITY_BADGE_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };

  const STATUS_BADGE = {
    complete: '<span class="dcs-badge dcs-badge--success">Complete</span>',
    processing: '<span class="dcs-badge dcs-badge--processing">Processing</span>',
    review: '<span class="dcs-badge dcs-badge--warning">Needs review</span>',
    failed: '<span class="dcs-badge dcs-badge--error">Failed</span>',
  };

  const RECENT_SCANS = [
    { id: "PT-004821", name: "Ahmad Raza",     date: "11 Jul 2026", severity: "d2", confidence: 78, status: "review" },
    { id: "PT-004798", name: "Sana Bibi",       date: "10 Jul 2026", severity: "e",  confidence: 91, status: "complete" },
    { id: "PT-004777", name: "Bilal Hussain",   date: "10 Jul 2026", severity: "p",  confidence: 88, status: "complete" },
    { id: "PT-004761", name: "Fatima Noor",     date: "09 Jul 2026", severity: "d1", confidence: 65, status: "complete" },
    { id: "PT-004750", name: "Usman Ali",       date: "09 Jul 2026", severity: "d3", confidence: 82, status: "review" },
    { id: "PT-004732", name: "Mehreen Sheikh",  date: "08 Jul 2026", severity: "e",  confidence: 95, status: "complete" },
  ];

  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  function renderRecentScans() {
    const body = document.getElementById("recentScansBody");
    if (!body) return;

    body.innerHTML = RECENT_SCANS.map((s) => `
      <tr>
        <td>
          <div class="dcs-table__patient">
            <div class="dcs-patient-card__avatar" style="width:32px;height:32px;font-size:11px;">${initials(s.name)}</div>
            <div>
              <div class="dcs-table__patient-name">${s.name}</div>
              <div class="dcs-table__patient-id">${s.id}</div>
            </div>
          </div>
        </td>
        <td>${s.date}</td>
        <td><span class="dcs-badge dcs-badge--${s.severity}">${SEVERITY_BADGE_LABEL[s.severity]}</span></td>
        <td>
          <div class="dcs-table__confidence">
            <div class="dcs-confidence-bar"><div class="dcs-confidence-bar__fill" style="width:${s.confidence}%;background:var(--severity-${s.severity})"></div></div>
            <span>${s.confidence}%</span>
          </div>
        </td>
        <td>${STATUS_BADGE[s.status]}</td>
        <td>
          <a href="ai-analysis.html?patient=${encodeURIComponent(s.id)}" class="dcs-btn dcs-btn--ghost dcs-btn--small dcs-focus-ring">View</a>
        </td>
      </tr>
    `).join("");
  }

  renderRecentScans();

  /* ------------------------------------------------------------------------
     Quick action: review queue (placeholder until filtered history view exists)
     ------------------------------------------------------------------------ */
  const reviewQueueAction = document.getElementById("reviewQueueAction");
  if (reviewQueueAction) {
    reviewQueueAction.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "patient-history.html?filter=review";
    });
  }
})();
