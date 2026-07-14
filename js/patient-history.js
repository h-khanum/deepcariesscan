/* ==========================================================================
   DeepCariesScan — Patient History Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   PATIENTS below is mock data shaped like what the real endpoint should
   return. Replace with something like:

     const res = await fetch(`/api/patients?search=${q}&severity=${sev}&status=${status}&sort=${sort}&page=${page}`);
     const { results, total } = await res.json();

   For a first pass you can also just fetch the full list once and keep
   all filtering/sorting/pagination client-side exactly as below — only
   swap the PATIENTS constant for the fetched array.
   ========================================================================== */

(function () {
  "use strict";

  const PATIENTS = [
    { id: "PT-004821", name: "Ahmad Raza",     age: 34, totalScans: 3, lastScan: "2026-07-11", severity: "d2", confidence: 78, status: "review" },
    { id: "PT-004798", name: "Sana Bibi",       age: 27, totalScans: 1, lastScan: "2026-07-10", severity: "e",  confidence: 91, status: "complete" },
    { id: "PT-004777", name: "Bilal Hussain",   age: 41, totalScans: 5, lastScan: "2026-07-10", severity: "p",  confidence: 88, status: "complete" },
    { id: "PT-004761", name: "Fatima Noor",     age: 19, totalScans: 2, lastScan: "2026-07-09", severity: "d1", confidence: 65, status: "complete" },
    { id: "PT-004750", name: "Usman Ali",       age: 52, totalScans: 4, lastScan: "2026-07-09", severity: "d3", confidence: 82, status: "review" },
    { id: "PT-004732", name: "Mehreen Sheikh",  age: 8,  totalScans: 1, lastScan: "2026-07-08", severity: "e",  confidence: 95, status: "complete" },
    { id: "PT-004715", name: "Kamran Yousaf",   age: 46, totalScans: 2, lastScan: "2026-07-06", severity: "d2", confidence: 73, status: "review" },
    { id: "PT-004702", name: "Ayesha Malik",    age: 31, totalScans: 3, lastScan: "2026-07-05", severity: "d1", confidence: 69, status: "complete" },
    { id: "PT-004688", name: "Hassan Javed",    age: 24, totalScans: 1, lastScan: "2026-07-03", severity: "e",  confidence: 89, status: "complete" },
    { id: "PT-004671", name: "Zainab Farooq",   age: 60, totalScans: 6, lastScan: "2026-07-02", severity: "p",  confidence: 94, status: "review" },
    { id: "PT-004659", name: "Imran Qureshi",   age: 37, totalScans: 2, lastScan: "2026-06-30", severity: "d3", confidence: 80, status: "complete" },
    { id: "PT-004640", name: "Nadia Aslam",     age: 29, totalScans: 1, lastScan: "2026-06-28", severity: "d1", confidence: 71, status: "complete" },
    { id: "PT-004622", name: "Waqas Ahmed",     age: 15, totalScans: 1, lastScan: "2026-06-25", severity: "e",  confidence: 92, status: "complete" },
    { id: "PT-004601", name: "Rabia Saeed",     age: 44, totalScans: 3, lastScan: "2026-06-22", severity: "d2", confidence: 76, status: "review" },
  ];

  const SEVERITY_LABEL = { e: "Enamel", d1: "Dentin 1", d2: "Dentin 2", d3: "Dentin 3", p: "Pulp" };
  const SEVERITY_ORDER = ["e", "d1", "d2", "d3", "p"];
  const STATUS_BADGE = {
    complete: '<span class="dcs-badge dcs-badge--success">Complete</span>',
    review: '<span class="dcs-badge dcs-badge--warning">Needs review</span>',
  };
  const PAGE_SIZE = 6;

  function initials(name) {
    return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  }
  function formatDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  /* ------------------------------------------------------------------------
     STATE
     ------------------------------------------------------------------------ */
  let state = { search: "", severity: "all", status: "all", sort: "recent", page: 1 };

  // Pre-fill from query string, e.g. dashboard's "Review pending scans" quick
  // action (?filter=review) or the 404 page's patient search (?search=...)
  const params = new URLSearchParams(window.location.search);
  if (params.get("filter") === "review") state.status = "review";
  if (params.get("search")) state.search = params.get("search");

  /* ------------------------------------------------------------------------
     ELEMENTS
     ------------------------------------------------------------------------ */
  const searchInput = document.getElementById("searchInput");
  const severityFilter = document.getElementById("severityFilter");
  const statusFilter = document.getElementById("statusFilter");
  const sortSelect = document.getElementById("sortSelect");
  const resetFiltersBtn = document.getElementById("resetFiltersBtn");
  const emptyResetBtn = document.getElementById("emptyResetBtn");
  const emptyState = document.getElementById("emptyState");
  const tableWrap = document.getElementById("tableWrap");
  const tbody = document.getElementById("patientsTableBody");
  const resultsMeta = document.getElementById("resultsMeta");
  const pagination = document.getElementById("pagination");
  const paginationInfo = document.getElementById("paginationInfo");
  const paginationPages = document.getElementById("paginationPages");

  statusFilter.value = state.status;
  searchInput.value = state.search;

  /* ------------------------------------------------------------------------
     FILTER + SORT
     ------------------------------------------------------------------------ */
  function getFiltered() {
    let list = PATIENTS.filter((p) => {
      const q = state.search.trim().toLowerCase();
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      const matchesSeverity = state.severity === "all" || p.severity === state.severity;
      const matchesStatus = state.status === "all" || p.status === state.status;
      return matchesSearch && matchesSeverity && matchesStatus;
    });

    if (state.sort === "recent") {
      list = list.slice().sort((a, b) => new Date(b.lastScan) - new Date(a.lastScan));
    } else if (state.sort === "severity") {
      list = list.slice().sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity));
    } else if (state.sort === "name") {
      list = list.slice().sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }

  /* ------------------------------------------------------------------------
     RENDER
     ------------------------------------------------------------------------ */
  function render() {
    const filtered = getFiltered();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    resultsMeta.innerHTML = `Showing <strong>${pageItems.length}</strong> of <strong>${filtered.length}</strong> patients`;

    if (filtered.length === 0) {
      emptyState.hidden = false;
      tableWrap.style.display = "none";
      pagination.style.display = "none";
      return;
    }

    emptyState.hidden = true;
    tableWrap.style.display = "";
    pagination.style.display = "";

    tbody.innerHTML = pageItems.map((p) => `
      <tr>
        <td>
          <div class="dcs-table__patient">
            <div class="dcs-patient-card__avatar" style="width:32px;height:32px;font-size:11px;">${initials(p.name)}</div>
            <div>
              <div class="dcs-table__patient-name">${p.name}</div>
              <div class="dcs-table__patient-id">${p.id} · Age ${p.age}</div>
            </div>
          </div>
        </td>
        <td>${p.totalScans}</td>
        <td>${formatDate(p.lastScan)}</td>
        <td><span class="dcs-badge dcs-badge--${p.severity}">${SEVERITY_LABEL[p.severity]}</span></td>
        <td>
          <div class="dcs-table__confidence">
            <div class="dcs-confidence-bar"><div class="dcs-confidence-bar__fill" style="width:${p.confidence}%;background:var(--severity-${p.severity})"></div></div>
            <span>${p.confidence}%</span>
          </div>
        </td>
        <td>${STATUS_BADGE[p.status]}</td>
        <td>
          <a href="patient-details.html?id=${encodeURIComponent(p.id)}" class="dcs-btn dcs-btn--ghost dcs-btn--small dcs-focus-ring">View</a>
        </td>
      </tr>
    `).join("");

    renderPagination(totalPages, filtered.length, start, pageItems.length);
  }

  function renderPagination(totalPages, totalItems, start, shownCount) {
    paginationInfo.textContent = `Page ${state.page} of ${totalPages}`;

    let buttons = "";
    buttons += `<button type="button" class="dcs-pagination__page-btn" id="prevPageBtn" ${state.page === 1 ? "disabled" : ""} aria-label="Previous page">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      buttons += `<button type="button" class="dcs-pagination__page-btn ${i === state.page ? "dcs-active" : ""}" data-page="${i}">${i}</button>`;
    }
    buttons += `<button type="button" class="dcs-pagination__page-btn" id="nextPageBtn" ${state.page === totalPages ? "disabled" : ""} aria-label="Next page">›</button>`;
    paginationPages.innerHTML = buttons;

    paginationPages.querySelectorAll("[data-page]").forEach((btn) => {
      btn.addEventListener("click", () => { state.page = parseInt(btn.dataset.page, 10); render(); window.scrollTo({ top: tableWrap.offsetTop - 100, behavior: "smooth" }); });
    });
    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");
    if (prevBtn) prevBtn.addEventListener("click", () => { state.page--; render(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { state.page++; render(); });
  }

  /* ------------------------------------------------------------------------
     EVENTS
     ------------------------------------------------------------------------ */
  let searchDebounce;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.search = e.target.value;
      state.page = 1;
      render();
    }, 200);
  });

  severityFilter.addEventListener("change", (e) => { state.severity = e.target.value; state.page = 1; render(); });
  statusFilter.addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; render(); });
  sortSelect.addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; render(); });

  function resetFilters() {
    state = { search: "", severity: "all", status: "all", sort: "recent", page: 1 };
    searchInput.value = "";
    severityFilter.value = "all";
    statusFilter.value = "all";
    sortSelect.value = "recent";
    render();
  }
  resetFiltersBtn.addEventListener("click", resetFilters);
  emptyResetBtn.addEventListener("click", resetFilters);

  render();
})();
