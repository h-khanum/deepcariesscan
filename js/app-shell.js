/* ==========================================================================
   DeepCariesScan — App Shell Behavior (shared across all logged-in pages)
   Account menu (bottom-left avatar → upward dropdown), outside-click/
   escape dismissal. The old sidebar toggle is gone along with the sidebar
   itself — nav is now the fixed pill nav, which is pure CSS/links, no JS.
   ========================================================================== */

(function () {
  "use strict";

  const avatarBtn = document.getElementById("avatarBtn");
  const dropdown = document.getElementById("avatarDropdown");

  if (avatarBtn && dropdown) {
    function closeDropdown() {
      dropdown.hidden = true;
      avatarBtn.setAttribute("aria-expanded", "false");
    }
    function openDropdown() {
      dropdown.hidden = false;
      avatarBtn.setAttribute("aria-expanded", "true");
    }

    avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (dropdown.hidden) openDropdown(); else closeDropdown();
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.hidden && !dropdown.contains(e.target) && e.target !== avatarBtn) {
        closeDropdown();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !dropdown.hidden) closeDropdown();
    });

    const logoutItem = document.getElementById("logoutItem");
    if (logoutItem) {
      logoutItem.addEventListener("click", () => {
        if (window.DCS) {
          DCS.toast.show({ type: "info", title: "Signing out…", message: "Redirecting to login." });
        }
        setTimeout(() => { window.location.href = "login.html"; }, 500);
      });
    }
  }
})();
