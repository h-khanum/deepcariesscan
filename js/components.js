/* ==========================================================================
   DeepCariesScan — Reusable Component Behaviors (JS)
   Vanilla JS, no build step, no framework — matches Design Bible §15 Tech
   Stack Constraints. Drop in /static/ and load after components.css.

   Exposes: window.DCS = { toast, upload, loading }
   (Dark mode lives in js/theme.js; the sidebar toggle was removed along
   with the sidebar itself, replaced by the fixed pill nav.)
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     TOAST NOTIFICATIONS
     Usage: DCS.toast.show({ type: "success", title: "Upload complete", message: "x-ray-04.png ready for analysis", duration: 4000 })
     type: "success" | "warning" | "error" | "info"
     ------------------------------------------------------------------------ */
  const ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.03L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };

  function ensureToastContainer() {
    let container = document.querySelector(".dcs-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "dcs-toast-container";
      container.setAttribute("role", "region");
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    return container;
  }

  function showToast({ type = "info", title = "", message = "", duration = 4000 } = {}) {
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = `dcs-toast dcs-toast--${type}`;
    toast.setAttribute("role", type === "error" ? "alert" : "status");

    toast.innerHTML = `
      ${ICONS[type] || ICONS.info}
      <div class="dcs-toast__body">
        ${title ? `<div class="dcs-toast__title">${escapeHtml(title)}</div>` : ""}
        ${message ? `<div class="dcs-toast__message">${escapeHtml(message)}</div>` : ""}
      </div>
      <button class="dcs-toast__close" aria-label="Dismiss notification">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      ${duration ? `<div class="dcs-toast__progress" style="animation-duration:${duration}ms"></div>` : ""}
    `;

    container.appendChild(toast);

    const close = () => {
      toast.classList.add("dcs-toast--leaving");
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    toast.querySelector(".dcs-toast__close").addEventListener("click", close);
    if (duration) setTimeout(close, duration);

    return { close };
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------------
     UPLOAD DROPZONE
     Usage: DCS.upload.init(document.querySelector(".dcs-upload"), {
       onFile: (file) => { ... }
     })
     Handles drag states, click-to-browse, and renders a file preview.
     Actual upload/inference request is left to the caller (onFile).
     ------------------------------------------------------------------------ */
  function initUpload(dropzoneEl, { onFile, accept = "image/*" } = {}) {
    if (!dropzoneEl) return;

    let fileInput = dropzoneEl.querySelector("input[type=file]");
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = accept;
      fileInput.style.display = "none";
      dropzoneEl.appendChild(fileInput);
    }

    const openPicker = (e) => {
      if (e.target.closest(".dcs-upload__remove")) return;
      fileInput.click();
    };

    dropzoneEl.addEventListener("click", openPicker);
    dropzoneEl.setAttribute("tabindex", "0");
    dropzoneEl.setAttribute("role", "button");
    dropzoneEl.setAttribute("aria-label", "Upload X-ray image");
    dropzoneEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.add("dcs-dragover");
      })
    );

    ["dragleave", "drop"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove("dcs-dragover");
      })
    );

    dropzoneEl.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });

    function handleFile(file) {
      if (!file.type.startsWith("image/")) {
        dropzoneEl.classList.add("dcs-error");
        showToast({ type: "error", title: "Unsupported file", message: "Please upload a JPEG or PNG X-ray image." });
        return;
      }
      dropzoneEl.classList.remove("dcs-error");
      renderPreview(file);
      if (typeof onFile === "function") onFile(file);
    }

    function renderPreview(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        dropzoneEl.classList.add("dcs-has-file");
        let preview = dropzoneEl.querySelector(".dcs-upload__preview");
        if (!preview) {
          preview = document.createElement("div");
          preview.className = "dcs-upload__preview";
          dropzoneEl.insertBefore(preview, fileInput);
        }
        const sizeKb = (file.size / 1024).toFixed(0);
        preview.innerHTML = `
          <img src="${e.target.result}" alt="X-ray preview" />
          <div>
            <div class="dcs-upload__filename">${escapeHtml(file.name)}</div>
            <div class="dcs-upload__filesize">${sizeKb} KB</div>
          </div>
        `;
        // Hide the empty-state prompt if present
        const prompt = dropzoneEl.querySelector(".dcs-upload__prompt");
        if (prompt) prompt.style.display = "none";
      };
      reader.readAsDataURL(file);
    }
  }

  /* ------------------------------------------------------------------------
     LOADING CONTROL
     Usage: const stop = DCS.loading.showPanel(targetEl, "Analyzing X-ray…")
            stop() // removes the loading panel
     ------------------------------------------------------------------------ */
  function showLoadingPanel(targetEl, label = "Loading…") {
    if (!targetEl) return () => {};
    const panel = document.createElement("div");
    panel.className = "dcs-loading-panel";
    panel.innerHTML = `
      <div class="dcs-spinner" role="status" aria-label="${escapeHtml(label)}"></div>
      <div class="dcs-loading-panel__label">${escapeHtml(label)}</div>
    `;
    targetEl.appendChild(panel);
    return () => panel.remove();
  }

  window.DCS = {
    toast: { show: showToast },
    upload: { init: initUpload },
    loading: { showPanel: showLoadingPanel }
  };
})();
