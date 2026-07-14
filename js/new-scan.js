/* ==========================================================================
   DeepCariesScan — New Scan Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   `runAnalysis()` currently simulates a ~2.2s inference delay and returns
   hardcoded lesions. Replace its body with something like:

     const form = new FormData();
     form.append("image", uploadedFile);
     form.append("patient_id", selectedPatient?.id || null);
     const res = await fetch("/api/analyze", { method: "POST", body: form });
     const { lesions, processed_image_url } = await res.json();

   `lesions` should keep the shape used below: [{ tooth, surface, severity,
   confidence, box: {x,y,w,h} }] with box values as PERCENTAGES of image
   width/height (0-100) so the overlay positions correctly regardless of
   the rendered image size. `processed_image_url` can replace the client-
   drawn boxes entirely if the Flask/OpenCV backend already burns them in —
   in that case just render that image and skip the .dcs-bbox overlay.
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
     ANALYSIS (mock — see integration note at top of file)
     ------------------------------------------------------------------------ */
  const MOCK_LESIONS = [
    { tooth: "#14", surface: "Occlusal surface", severity: "e",  confidence: 62, box: { x: 12, y: 10, w: 16, h: 20 } },
    { tooth: "#19", surface: "Mesial surface",    severity: "d2", confidence: 78, box: { x: 42, y: 30, w: 14, h: 18 } },
    { tooth: "#30", surface: "Distal surface",    severity: "p",  confidence: 91, box: { x: 65, y: 50, w: 18, h: 22 } },
    { tooth: "#3",  surface: "Buccal surface",    severity: "d1", confidence: 55, box: { x: 25, y: 55, w: 15, h: 17 } },
  ];

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
    const worst = SEVERITY_LABEL[severityOrder[highestSeverityRank(lesions)]];
    resultsSummary.innerHTML = `<strong>${lesions.length} lesion${lesions.length === 1 ? "" : "s"} detected</strong> · highest severity: <strong>${worst}</strong>`;

    resultsList.innerHTML = lesions.map((l, i) => `
      <div class="dcs-result-card" data-severity="${l.severity}">
        <div class="dcs-result-card__top">
          <span class="dcs-result-card__title">Lesion ${i + 1} — Tooth ${l.tooth}</span>
          <span class="dcs-badge dcs-badge--${l.severity}">${SEVERITY_LABEL[l.severity]}</span>
        </div>
        <span class="dcs-result-card__location">${l.surface}</span>
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

  function runAnalysis() {
    if (!uploadedFile || !patientIsValid()) return;

    setAnalyzing(true);
    xrayUpload.style.display = "none";
    scanResult.hidden = true;

    const stopPanel = DCS.loading.showPanel(scanLoading, "Analyzing X-ray…");
    scanLoading.hidden = false;

    // Simulated inference delay — see integration note at top of file
    setTimeout(() => {
      stopPanel();
      scanLoading.hidden = true;
      scanResult.hidden = false;
      setAnalyzing(false);

      renderBoundingBoxes(MOCK_LESIONS);
      renderResultsList(MOCK_LESIONS);
      hasResults = true;

      DCS.toast.show({
        type: "success",
        title: "Analysis complete",
        message: `${MOCK_LESIONS.length} lesions detected across the uploaded X-ray.`,
      });
    }, 2200);
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