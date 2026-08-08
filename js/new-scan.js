/* ==========================================================================
   DeepCariesScan — New Scan Behavior
   Vanilla JS, no framework (Design Bible §15).

   LIVE INTEGRATION: runAnalysis() calls the real Flask backend at
   POST /api/analyze. See backend/inference.py for the lesion shape:
   [{ surface, severity, confidence, box: {x,y,w,h} }] — note there is no
   "tooth" field from the model, so the results list shows the surface
   label instead of a tooth number.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     MOCK PATIENT DIRECTORY (replace with a real /api/patients?q= search)
     ------------------------------------------------------------------------ */
  const PATIENTS = [
    { id: "PT-004821", name: "Ahmad Raza",    age: 34, lastVisit: "28 Jun 2026" },
    { id: "PT-004798", name: "Sana Bibi",      age: 27, lastVisit: "02 Jul 2026" },
    { id: "PT-004777", name: "Bilal Hussain",  age: 41, lastVisit: "15 May 2026" },
    { id: "PT-004761", name: "Fatima Noor",    age: 19, lastVisit: "30 Jun 2026" },
    { id: "PT-004750", name: "Usman Ali",      age: 52, lastVisit: "22 Jun 2026" },
    { id: "PT-004732", name: "Mehreen Sheikh", age: 8,  lastVisit: "18 Jun 2026" },
  ];

  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }

  /* ------------------------------------------------------------------------
     STATE
     ------------------------------------------------------------------------ */
  let selectedPatient = null;
  let newPatientMode = false;
  let uploadedFile = null;
  let uploadedImageDataUrl = null;
  let hasResults = false;

  /* ------------------------------------------------------------------------
     ELEMENTS
     ------------------------------------------------------------------------ */
  const tabExisting = document.getElementById("tabExisting");
  const tabNew = document.getElementById("tabNew");
  const existingPanel = document.getElementById("existingPatientPanel");
  const newPatientForm = document.getElementById("newPatientForm");
  const patientSearch = document.getElementById("patientSearch");
  const patientSearchResults = document.getElementById("patientSearchResults");
  const patientSearchWrap = document.getElementById("patientSearchWrap");
  const selectedPatientCard = document.getElementById("selectedPatientCard");
  const clearPatientBtn = document.getElementById("clearPatientBtn");
  const newPatientName = document.getElementById("newPatientName");

  const xrayUpload = document.getElementById("xrayUpload");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const analyzeSpinner = document.getElementById("analyzeSpinner");
  const analyzeLabel = document.getElementById("analyzeLabel");
  const scanLoading = document.getElementById("scanLoading");
  const scanResult = document.getElementById("scanResult");
  const scanResultImage = document.getElementById("scanResultImage");
  const replaceImageBtn = document.getElementById("replaceImageBtn");
  const reanalyzeBtn = document.getElementById("reanalyzeBtn");

  const resultsSummary = document.getElementById("resultsSummary");
  const resultsEmpty = document.getElementById("resultsEmpty");
  const resultsList = document.getElementById("resultsList");
  const notesActions = document.getElementById("notesActions");
  const discardBtn = document.getElementById("discardBtn");
  const saveRecordBtn = document.getElementById("saveRecordBtn");
  const clinicianNotes = document.getElementById("clinicianNotes");

  /* ------------------------------------------------------------------------
     PATIENT TABS
     ------------------------------------------------------------------------ */
  function setTab(mode) {
    newPatientMode = mode === "new";
    tabExisting.classList.toggle("dcs-btn--primary", !newPatientMode);
    tabExisting.classList.toggle("dcs-btn--ghost", newPatientMode);
    tabExisting.setAttribute("aria-selected", String(!newPatientMode));
    tabNew.classList.toggle("dcs-btn--primary", newPatientMode);
    tabNew.classList.toggle("dcs-btn--ghost", !newPatientMode);
    tabNew.setAttribute("aria-selected", String(newPatientMode));
    existingPanel.hidden = newPatientMode;
    newPatientForm.hidden = !newPatientMode;
    updateAnalyzeAvailability();
  }
  tabExisting.addEventListener("click", () => setTab("existing"));
  tabNew.addEventListener("click", () => setTab("new"));

  /* ------------------------------------------------------------------------
     PATIENT SEARCH
     ------------------------------------------------------------------------ */
  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) { patientSearchResults.innerHTML = ""; return; }
    const matches = PATIENTS.filter((p) =>
      p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    ).slice(0, 6);

    patientSearchResults.innerHTML = matches.map((p) => `
      <button type="button" class="dcs-patient-search-item" data-id="${p.id}">
        <div class="dcs-patient-card__avatar">${initials(p.name)}</div>
        <div>
          <div class="dcs-patient-search-item__name">${p.name}</div>
          <div class="dcs-patient-search-item__meta">${p.id} · Age ${p.age}</div>
        </div>
      </button>
    `).join("");

    patientSearchResults.querySelectorAll(".dcs-patient-search-item").forEach((btn) => {
      btn.addEventListener("click", () => selectPatient(btn.dataset.id));
    });
  }

  patientSearch.addEventListener("input", (e) => renderSearchResults(e.target.value));

  function selectPatient(id) {
    const patient = PATIENTS.find((p) => p.id === id);
    if (!patient) return;
    selectedPatient = patient;

    document.getElementById("selectedPatientAvatar").textContent = initials(patient.name);
    document.getElementById("selectedPatientName").textContent = patient.name;
    document.getElementById("selectedPatientId").textContent = patient.id;
    document.getElementById("selectedPatientAge").textContent = patient.age;
    document.getElementById("selectedPatientLastVisit").textContent = patient.lastVisit;

    patientSearchWrap.hidden = true;
    selectedPatientCard.hidden = false;
    updateAnalyzeAvailability();
  }

  clearPatientBtn.addEventListener("click", () => {
    selectedPatient = null;
    patientSearch.value = "";
    patientSearchResults.innerHTML = "";
    patientSearchWrap.hidden = false;
    selectedPatientCard.hidden = true;
    updateAnalyzeAvailability();
  });

  newPatientName.addEventListener("input", updateAnalyzeAvailability);

  /* ------------------------------------------------------------------------
     TOOTH CHART — Universal Numbering (1-32), multi-select toggle
     ------------------------------------------------------------------------ */
  const selectedTeeth = new Set();
  const selectedTeethInput = document.getElementById("selectedTeeth");
  const toothSelectionHelper = document.getElementById("toothSelectionHelper");

  function renderToothSelectionHelper() {
    if (selectedTeeth.size === 0) {
      toothSelectionHelper.textContent = "No teeth selected";
    } else {
      const list = Array.from(selectedTeeth).sort((a, b) => a - b).join(", ");
      const word = selectedTeeth.size === 1 ? "tooth" : "teeth";
      toothSelectionHelper.textContent = `${selectedTeeth.size} ${word} selected: ${list}`;
    }
    selectedTeethInput.value = Array.from(selectedTeeth).sort((a, b) => a - b).join(",");
  }

  function toggleTooth(toothEl) {
    const num = parseInt(toothEl.dataset.tooth, 10);
    const isActive = toothEl.classList.toggle("dcs-active");
    if (isActive) selectedTeeth.add(num); else selectedTeeth.delete(num);
    toothEl.setAttribute("aria-pressed", String(isActive));
    renderToothSelectionHelper();
  }

  document.querySelectorAll(".dcs-tooth").forEach((toothEl) => {
    toothEl.setAttribute("aria-pressed", "false");
    toothEl.addEventListener("click", () => toggleTooth(toothEl));
    toothEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleTooth(toothEl);
      }
    });
  });

  /* ------------------------------------------------------------------------
     UPLOAD
     ------------------------------------------------------------------------ */
  DCS.upload.init(xrayUpload, {
    onFile: (file) => {
      uploadedFile = file;
      const reader = new FileReader();
      reader.onload = (e) => { uploadedImageDataUrl = e.target.result; };
      reader.readAsDataURL(file);
      updateAnalyzeAvailability();
    },
  });

  function patientIsValid() {
    if (newPatientMode) return newPatientName.value.trim().length > 0;
    return !!selectedPatient;
  }

  function updateAnalyzeAvailability() {
    analyzeBtn.disabled = !(patientIsValid() && uploadedFile);
  }

  /* ------------------------------------------------------------------------
     ANALYSIS — real call to POST /api/analyze
     ------------------------------------------------------------------------ */
  const SEVERITY_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };

  function highestSeverityRank(lesions) {
    const order = ["e", "d1", "d2", "d3", "p"];
    return lesions.reduce((max, l) => Math.max(max, order.indexOf(l.severity)), 0);
  }

  function renderBoundingBoxes(lesions) {
    const boxesHtml = lesions.map((l) => `
      <div class="dcs-bbox" style="
        left:${l.box.x}%; top:${l.box.y}%; width:${l.box.w}%; height:${l.box.h}%;
        border-color:var(--severity-${l.severity});
      ">
        <span class="dcs-bbox__label" style="background:var(--severity-${l.severity})">${SEVERITY_LABEL[l.severity]} · ${l.confidence}%</span>
      </div>
    `).join("");

    scanResultImage.innerHTML = `<img src="${uploadedImageDataUrl}" alt="Processed X-ray with detected lesions" />${boxesHtml}`;
  }

  function renderResultsList(lesions) {
    resultsEmpty.hidden = true;
    resultsSummary.hidden = false;
    const severityOrder = ["e", "d1", "d2", "d3", "p"];
    const worst = lesions.length
      ? SEVERITY_LABEL[severityOrder[highestSeverityRank(lesions)]]
      : "None";
    resultsSummary.innerHTML = `<strong>${lesions.length} lesion${lesions.length === 1 ? "" : "s"} detected</strong> · highest severity: <strong>${worst}</strong>`;

    // Real model output has no tooth number (that field never existed in
    // inference.py's response) — the card title uses the finding label
    // (e.g. "Dentin Caries (D2)") instead of a tooth number.
    resultsList.innerHTML = lesions.map((l, i) => `
      <div class="dcs-result-card" data-severity="${l.severity}">
        <div class="dcs-result-card__top">
          <span class="dcs-result-card__title">Lesion ${i + 1} — ${l.surface}</span>
          <span class="dcs-badge dcs-badge--${l.severity}">${SEVERITY_LABEL[l.severity]}</span>
        </div>
        <div class="dcs-result-card__confidence">
          <div class="dcs-confidence-bar"><div class="dcs-confidence-bar__fill" style="width:${l.confidence}%;background:var(--severity-${l.severity})"></div></div>
          <span class="dcs-result-card__confidence-value">${l.confidence}%</span>
        </div>
      </div>
    `).join("");

    notesActions.hidden = false;
  }

  function setAnalyzing(isAnalyzing) {
    analyzeBtn.classList.toggle("dcs-loading", isAnalyzing);
    analyzeBtn.disabled = isAnalyzing || !(patientIsValid() && uploadedFile);
    analyzeLabel.textContent = isAnalyzing ? "Analyzing…" : "Analyze X-ray";
  }

  async function runAnalysis() {
    if (!uploadedFile || !patientIsValid()) return;

    setAnalyzing(true);
    xrayUpload.style.display = "none";
    scanResult.hidden = true;

    const stopPanel = DCS.loading.showPanel(scanLoading, "Analyzing X-ray…");
    scanLoading.hidden = false;

    try {
      const form = new FormData();
      form.append("image", uploadedFile);

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !data.ok) {
        const message = (data && data.message) || `Analysis failed (${res.status})`;
        throw new Error(message);
      }

      const lesions = data.lesions || [];

      stopPanel();
      scanLoading.hidden = true;
      scanResult.hidden = false;
      setAnalyzing(false);

      renderBoundingBoxes(lesions);
      renderResultsList(lesions);
      hasResults = true;

      DCS.toast.show({
        type: "success",
        title: "Analysis complete",
        message: `${lesions.length} lesion${lesions.length === 1 ? "" : "s"} detected across the uploaded X-ray.`,
      });
    } catch (err) {
      stopPanel();
      scanLoading.hidden = true;
      xrayUpload.style.display = "";
      setAnalyzing(false);

      DCS.toast.show({
        type: "error",
        title: "Analysis failed",
        message: err.message || "Could not reach the analysis service. Please try again.",
      });
    }
  }

  analyzeBtn.addEventListener("click", runAnalysis);
  reanalyzeBtn.addEventListener("click", runAnalysis);

  replaceImageBtn.addEventListener("click", () => {
    uploadedFile = null;
    uploadedImageDataUrl = null;
    hasResults = false;
    xrayUpload.style.display = "";
    xrayUpload.classList.remove("dcs-has-file");
    const preview = xrayUpload.querySelector(".dcs-upload__preview");
    if (preview) preview.remove();
    const prompt = xrayUpload.querySelector(".dcs-upload__prompt");
    if (prompt) prompt.style.display = "";
    scanResult.hidden = true;
    resultsEmpty.hidden = false;
    resultsSummary.hidden = true;
    resultsList.innerHTML = "";
    notesActions.hidden = true;
    updateAnalyzeAvailability();
  });

  /* ------------------------------------------------------------------------
     SAVE / DISCARD
     ------------------------------------------------------------------------ */
  saveRecordBtn.addEventListener("click", () => {
    DCS.toast.show({
      type: "success",
      title: "Saved to patient record",
      message: "This scan and your notes have been added to the patient's history.",
    });
    setTimeout(() => { window.location.href = "patient-history.html"; }, 900);
  });

  discardBtn.addEventListener("click", () => {
    clinicianNotes.value = "";
    DCS.toast.show({ type: "info", title: "Scan discarded", message: "No changes were saved." });
  });
})();