/* ==========================================================================
   DeepCariesScan — Patient Details Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   This page reads ?id= from the query string and currently just displays
   MOCK_PATIENT regardless of which id was passed. Replace with:

     const id = new URLSearchParams(window.location.search).get("id");
     const res = await fetch(`/api/patients/${id}`);
     const patient = await res.json();

   Keep the same shape as MOCK_PATIENT (demographics + scans[]) and every
   render function below works unchanged.
   ========================================================================== */

(function () {
  "use strict";

  const MOCK_PATIENT = {
    id: "PT-004821",
    name: "Ahmad Raza",
    scans: [
      { date: "2026-04-22", type: "Bitewing", severity: "e",  confidence: 90, status: "complete" },
      { date: "2026-06-02", type: "Panoramic (OPG)", severity: "d1", confidence: 71, status: "complete" },
      { date: "2026-07-11", type: "Panoramic (OPG)", severity: "d2", confidence: 78, status: "review" },
    ],
  };

  const SEVERITY_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };
  const SEVERITY_ORDER = ["e", "d1", "d2", "d3", "p"];
  const STATUS_BADGE = {
    complete: '<span class="dcs-badge dcs-badge--success">Complete</span>',
    review: '<span class="dcs-badge dcs-badge--warning">Needs review</span>',
  };

  function formatDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  /* ------------------------------------------------------------------------
     STATS
     ------------------------------------------------------------------------ */
  function renderStats(patient) {
    const scans = patient.scans;
    const highestRank = scans.reduce((max, s) => Math.max(max, SEVERITY_ORDER.indexOf(s.severity)), 0);
    const latest = scans[scans.length - 1];

    document.getElementById("statTotalScans").textContent = scans.length;
    document.getElementById("statHighestSeverity").textContent = SEVERITY_LABEL[SEVERITY_ORDER[highestRank]];
    document.getElementById("statLastVisit").textContent = formatDate(latest.date);
    document.getElementById("statCurrentStatus").innerHTML = STATUS_BADGE[latest.status];

    document.getElementById("profileAvatar").textContent = initials(patient.name);
    document.getElementById("profileName").textContent = patient.name;
  }

  /* ------------------------------------------------------------------------
     SEVERITY TREND CHART
     ------------------------------------------------------------------------ */
  function renderTrend(scans) {
    const container = document.getElementById("trendChart");
    container.innerHTML = scans.map((s) => {
      const rank = SEVERITY_ORDER.indexOf(s.severity);
      const heightPct = ((rank + 1) / SEVERITY_ORDER.length) * 100;
      return `
        <div class="dcs-trend__col">
          <span class="dcs-trend__severity-label" style="color:var(--severity-${s.severity})">${SEVERITY_LABEL[s.severity]}</span>
          <div class="dcs-trend__bar-track">
            <div class="dcs-trend__bar" data-height="${heightPct}" style="height:0%;background:var(--severity-${s.severity})"></div>
          </div>
          <span class="dcs-trend__date">${formatDate(s.date)}</span>
        </div>
      `;
    }).join("");

    requestAnimationFrame(() => {
      container.querySelectorAll(".dcs-trend__bar").forEach((bar) => {
        bar.style.height = bar.dataset.height + "%";
      });
    });
  }

  /* ------------------------------------------------------------------------
     SCAN HISTORY TABLE
     ------------------------------------------------------------------------ */
  function renderScanHistory(scans) {
    const tbody = document.getElementById("scanHistoryBody");
    // Most recent first
    const ordered = scans.slice().reverse();
    tbody.innerHTML = ordered.map((s) => `
      <tr>
        <td>${formatDate(s.date)}</td>
        <td>${s.type}</td>
        <td><span class="dcs-badge dcs-badge--${s.severity}">${SEVERITY_LABEL[s.severity]}</span></td>
        <td>
          <div class="dcs-table__confidence">
            <div class="dcs-confidence-bar"><div class="dcs-confidence-bar__fill" style="width:${s.confidence}%;background:var(--severity-${s.severity})"></div></div>
            <span>${s.confidence}%</span>
          </div>
        </td>
        <td>${STATUS_BADGE[s.status]}</td>
        <td><a href="ai-analysis.html?patient=${encodeURIComponent(MOCK_PATIENT.id)}&date=${s.date}" class="dcs-btn dcs-btn--ghost dcs-btn--small dcs-focus-ring">View</a></td>
      </tr>
    `).join("");
  }

  /* ------------------------------------------------------------------------
     ACTIONS
     ------------------------------------------------------------------------ */
  document.getElementById("saveNotesBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "success", title: "Notes saved", message: "Patient medical notes have been updated." });
  });

  document.getElementById("editInfoBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "info", title: "Edit patient info", message: "This will open an editable form once wired to the backend." });
  });

  /* ------------------------------------------------------------------------
     INIT — resolve patient from query string (mocked to one patient for now)
     ------------------------------------------------------------------------ */
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("id");
  const patient = MOCK_PATIENT; // always the same mock patient regardless of id, until backend is wired
  if (requestedId && requestedId !== patient.id) {
    // eslint-disable-next-line no-console
    console.info(`Requested patient ${requestedId} — showing mock data for ${patient.id} until /api/patients/:id is wired up.`);
  }

  renderStats(patient);
  renderTrend(patient.scans);
  renderScanHistory(patient.scans);
})();
