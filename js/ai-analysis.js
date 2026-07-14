/* ==========================================================================
   DeepCariesScan — AI Analysis / Report View Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   This page reads a scan record that is currently hardcoded as MOCK_SCAN
   below. In the real app, resolve the scan from the query string, e.g.:

     const params = new URLSearchParams(window.location.search);
     const scanId = params.get("patient"); // or a dedicated ?scan= id
     const res = await fetch(`/api/scans/${scanId}`);
     const scan = await res.json();

   Keep the same shape as MOCK_SCAN (patient info + lesions[] with box
   percentages) and every render function below works unchanged. If the
   Flask/OpenCV backend already burns boxes into the image server-side,
   skip renderBoundingBoxes() and just point #xrayImg at that image URL.
   ========================================================================== */

(function () {
  "use strict";

  const MOCK_SCAN = {
    patient: { name: "Ahmad Raza", id: "PT-004821", age: 34 },
    status: "review", // "complete" | "review"
    lesions: [
      { tooth: "#14", surface: "Occlusal surface", severity: "e",  confidence: 62, box: { x: 8,  y: 8,  w: 15, h: 20 } },
      { tooth: "#19", surface: "Mesial surface",    severity: "d2", confidence: 78, box: { x: 40, y: 28, w: 14, h: 20 } },
      { tooth: "#30", surface: "Distal surface",    severity: "p",  confidence: 91, box: { x: 66, y: 48, w: 17, h: 24 } },
      { tooth: "#3",  surface: "Buccal surface",    severity: "d1", confidence: 55, box: { x: 22, y: 52, w: 15, h: 18 } },
    ],
  };

  const SEVERITY_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };
  const SEVERITY_ORDER = ["e", "d1", "d2", "d3", "p"];
  const SEVERITY_NOTE = {
    e:  "Monitor at next routine checkup.",
    d1: "Consider preventive care at next visit.",
    d2: "Clinical correlation recommended.",
    d3: "Prompt clinical evaluation advised.",
    p:  "Urgent clinical evaluation advised.",
  };

  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  function highestSeverityRank(lesions) {
    return lesions.reduce((max, l) => Math.max(max, SEVERITY_ORDER.indexOf(l.severity)), 0);
  }

  /* ------------------------------------------------------------------------
     PATIENT BANNER
     ------------------------------------------------------------------------ */
  function renderBanner(scan) {
    document.getElementById("reportAvatar").textContent = initials(scan.patient.name);
    document.getElementById("reportPatientName").textContent = scan.patient.name;
  }

  /* ------------------------------------------------------------------------
     STATS + MASCOT
     ------------------------------------------------------------------------ */
  function renderStats(scan) {
    const lesions = scan.lesions;
    const avgConfidence = Math.round(lesions.reduce((s, l) => s + l.confidence, 0) / lesions.length);
    const highest = SEVERITY_LABEL[SEVERITY_ORDER[highestSeverityRank(lesions)]];

    document.getElementById("statCount").textContent = lesions.length;
    document.getElementById("statHighest").textContent = highest;
    document.getElementById("statConfidence").textContent = avgConfidence + "%";

    const statusEl = document.getElementById("statStatus");
    if (scan.status === "review") {
      statusEl.innerHTML = '<span class="dcs-badge dcs-badge--warning">Needs review</span>';
    } else {
      statusEl.innerHTML = '<span class="dcs-badge dcs-badge--success">Complete</span>';
    }
  }

  function setMascotState(lesions) {
    const rank = highestSeverityRank(lesions);
    let state = "calm";
    if (rank >= 3) state = "worried";
    else if (rank >= 1) state = "attentive";

    const mascotCard = document.getElementById("mascotCard");
    const mascotStateLabel = document.getElementById("mascotStateLabel");
    mascotCard.dataset.state = state;

    const face = document.querySelector(".dcs-mascot__face");
    const glow = document.querySelector(".dcs-mascot__glow");
    const browLeft = document.getElementById("browLeft");
    const browRight = document.getElementById("browRight");

    if (state === "calm") {
      face.setAttribute("fill", "var(--clinical-teal)");
      glow.setAttribute("stroke", "var(--icy-mint)");
      browLeft.setAttribute("d", "M19 24h10");
      browRight.setAttribute("d", "M35 24h10");
      mascotStateLabel.textContent = "Calm — mild findings only";
    } else if (state === "attentive") {
      face.setAttribute("fill", "var(--severity-d2)");
      glow.setAttribute("stroke", "var(--severity-d2)");
      browLeft.setAttribute("d", "M19 22l10 3");
      browRight.setAttribute("d", "M35 25l10-3");
      mascotStateLabel.textContent = "Attentive — moderate findings";
    } else {
      face.setAttribute("fill", "var(--severity-p)");
      glow.setAttribute("stroke", "var(--severity-p)");
      browLeft.setAttribute("d", "M19 21l10 5");
      browRight.setAttribute("d", "M35 26l10-5");
      mascotStateLabel.textContent = "Concerned — advanced findings";
    }
  }

  /* ------------------------------------------------------------------------
     BOUNDING BOX OVERLAY
     ------------------------------------------------------------------------ */
  function renderBoundingBoxes(lesions) {
    const inner = document.getElementById("viewerInner");
    inner.querySelectorAll(".dcs-bbox").forEach((el) => el.remove());
    lesions.forEach((l) => {
      const box = document.createElement("div");
      box.className = "dcs-bbox";
      box.style.left = l.box.x + "%";
      box.style.top = l.box.y + "%";
      box.style.width = l.box.w + "%";
      box.style.height = l.box.h + "%";
      box.style.borderColor = `var(--severity-${l.severity})`;
      box.innerHTML = `<span class="dcs-bbox__label" style="background:var(--severity-${l.severity})">${SEVERITY_LABEL[l.severity]} · ${l.confidence}%</span>`;
      inner.appendChild(box);
    });
  }

  /* ------------------------------------------------------------------------
     FINDINGS LIST
     ------------------------------------------------------------------------ */
  function renderFindings(lesions) {
    const list = document.getElementById("findingsList");
    list.innerHTML = lesions.map((l, i) => `
      <div class="dcs-finding-card">
        <div class="dcs-finding-card__top">
          <span class="dcs-finding-card__title">Lesion ${i + 1} — Tooth ${l.tooth}</span>
          <span class="dcs-badge dcs-badge--${l.severity}">${SEVERITY_LABEL[l.severity]}</span>
        </div>
        <span class="dcs-finding-card__location">${l.surface}</span>
        <div class="dcs-finding-card__confidence">
          <div class="dcs-confidence-bar" style="width:60px;"><div class="dcs-confidence-bar__fill" style="width:${l.confidence}%;background:var(--severity-${l.severity})"></div></div>
          <span style="font-size:var(--text-micro);color:var(--text-secondary);font-weight:600;">${l.confidence}% confidence</span>
        </div>
        <div class="dcs-finding-card__note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          ${SEVERITY_NOTE[l.severity]}
        </div>
      </div>
    `).join("");
  }

  /* ------------------------------------------------------------------------
     SEVERITY LEGEND (full 5-step scale, always label + color together)
     ------------------------------------------------------------------------ */
  function renderLegend() {
    const legend = document.getElementById("legend");
    legend.innerHTML = SEVERITY_ORDER.map((key) => `
      <span class="dcs-legend__item">
        <span class="dcs-legend__dot" style="background:var(--severity-${key})"></span>
        ${SEVERITY_LABEL[key]}
      </span>
    `).join("");
  }

  /* ------------------------------------------------------------------------
     ZOOM CONTROLS
     ------------------------------------------------------------------------ */
  let zoom = 100;
  const ZOOM_MIN = 50, ZOOM_MAX = 250, ZOOM_STEP = 25;
  const viewerInner = document.getElementById("viewerInner");
  const zoomValue = document.getElementById("zoomValue");

  function applyZoom() {
    viewerInner.style.transform = `scale(${zoom / 100})`;
    zoomValue.textContent = zoom + "%";
  }

  document.getElementById("zoomInBtn").addEventListener("click", () => {
    zoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP);
    applyZoom();
  });
  document.getElementById("zoomOutBtn").addEventListener("click", () => {
    zoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP);
    applyZoom();
  });
  document.getElementById("zoomResetBtn").addEventListener("click", () => {
    zoom = 100;
    applyZoom();
  });

  /* ------------------------------------------------------------------------
     OVERLAY TOGGLE
     ------------------------------------------------------------------------ */
  document.getElementById("overlayToggle").addEventListener("change", (e) => {
    document.querySelectorAll(".dcs-bbox").forEach((box) => {
      box.classList.toggle("dcs-bbox--hidden", !e.target.checked);
    });
  });

  /* ------------------------------------------------------------------------
     REPORT ACTIONS
     ------------------------------------------------------------------------ */
  document.getElementById("printBtn").addEventListener("click", () => window.print());

  document.getElementById("exportBtn").addEventListener("click", () => {
    DCS.toast.show({
      type: "info",
      title: "Export started",
      message: "Your PDF report is being generated and will download shortly.",
    });
  });

  document.getElementById("saveNotesBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "success", title: "Notes saved", message: "Clinician notes have been added to this scan's record." });
  });

  let flagged = MOCK_SCAN.status === "review";
  const flagBtn = document.getElementById("flagReviewBtn");
  function renderFlagButton() {
    flagBtn.innerHTML = flagged
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.03L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg> Unflag review'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.03L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg> Flag for review';
  }
  flagBtn.addEventListener("click", () => {
    flagged = !flagged;
    renderFlagButton();
    DCS.toast.show({
      type: flagged ? "warning" : "success",
      title: flagged ? "Flagged for review" : "Review flag cleared",
      message: flagged ? "This scan will appear in the pending-review queue." : "This scan is marked as complete.",
    });
  });
  renderFlagButton();

  /* ------------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------------ */
  renderBanner(MOCK_SCAN);
  renderStats(MOCK_SCAN);
  setMascotState(MOCK_SCAN.lesions);
  renderLegend();
  renderFindings(MOCK_SCAN.lesions);

  const xrayImg = document.getElementById("xrayImg");
  if (xrayImg.complete) {
    renderBoundingBoxes(MOCK_SCAN.lesions);
  } else {
    xrayImg.addEventListener("load", () => renderBoundingBoxes(MOCK_SCAN.lesions));
  }
})();
