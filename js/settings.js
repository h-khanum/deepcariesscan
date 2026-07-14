/* ==========================================================================
   DeepCariesScan — Settings Behavior
   Vanilla JS, no framework (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   Every "Save" button below shows a toast but doesn't persist anything yet.
   Wire each section to its own endpoint, e.g.:
     PATCH /api/account, PATCH /api/clinic, PATCH /api/preferences,
     POST /api/account/password, DELETE /api/account
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     SCROLLSPY — highlight the active section in the settings sub-nav
     ------------------------------------------------------------------------ */
  const navLinks = Array.from(document.querySelectorAll(".dcs-settings-nav__link"));
  const sections = navLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  function setActiveLink(id) {
    navLinks.forEach((link) => {
      link.classList.toggle("dcs-active", link.getAttribute("href") === `#${id}`);
    });
  }

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveLink(entry.target.id);
        });
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
  }

  /* ------------------------------------------------------------------------
     PASSWORD SHOW/HIDE TOGGLES
     ------------------------------------------------------------------------ */
  document.querySelectorAll(".dcs-password-wrap__toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.dataset.toggleFor);
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  });

  /* ------------------------------------------------------------------------
     CONFIDENCE THRESHOLD SLIDER
     ------------------------------------------------------------------------ */
  const confidenceSlider = document.getElementById("confidenceThreshold");
  const confidenceValue = document.getElementById("confidenceValue");
  if (confidenceSlider) {
    confidenceSlider.addEventListener("input", (e) => {
      confidenceValue.textContent = e.target.value + "%";
    });
  }

  /* ------------------------------------------------------------------------
     GENERIC "SAVE" BUTTONS
     ------------------------------------------------------------------------ */
  document.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      DCS.toast.show({ type: "success", title: "Saved", message: `${btn.dataset.save} updated successfully.` });
    });
  });

  /* ------------------------------------------------------------------------
     PASSWORD UPDATE
     ------------------------------------------------------------------------ */
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const currentPassword = document.getElementById("currentPassword");
  const passwordMatchError = document.getElementById("passwordMatchError");

  changePasswordBtn.addEventListener("click", () => {
    passwordMatchError.hidden = true;

    if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
      DCS.toast.show({ type: "warning", title: "Missing information", message: "Please fill in all three password fields." });
      return;
    }
    if (newPassword.value !== confirmPassword.value) {
      passwordMatchError.hidden = false;
      return;
    }
    if (newPassword.value.length < 8) {
      DCS.toast.show({ type: "warning", title: "Password too short", message: "Use at least 8 characters." });
      return;
    }

    DCS.toast.show({ type: "success", title: "Password updated", message: "Your password has been changed." });
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  });

  /* ------------------------------------------------------------------------
     CLINIC LOGO REPLACE (placeholder — wire to real upload later)
     ------------------------------------------------------------------------ */
  document.getElementById("replaceLogoBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "info", title: "Replace logo", message: "This will open a file picker once wired to the backend." });
  });

  /* ------------------------------------------------------------------------
     EXPORT DATA
     ------------------------------------------------------------------------ */
  document.getElementById("exportDataBtn").addEventListener("click", () => {
    DCS.toast.show({ type: "info", title: "Export started", message: "Your data export is being prepared and will download shortly." });
  });

  /* ------------------------------------------------------------------------
     DELETE ACCOUNT (destructive — requires confirmation)
     ------------------------------------------------------------------------ */
  document.getElementById("deleteAccountBtn").addEventListener("click", () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone. Patient records will remain with the clinic."
    );
    if (confirmed) {
      DCS.toast.show({ type: "info", title: "Account deletion requested", message: "Redirecting to login…" });
      setTimeout(() => { window.location.href = "login.html"; }, 1200);
    }
  });
})();
