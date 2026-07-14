/* ==========================================================================
   DeepCariesScan — Help & About Behavior
   Vanilla JS, no framework (Design Bible §15).
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     SCROLLSPY (same pattern as Settings)
     ------------------------------------------------------------------------ */
  const navLinks = Array.from(document.querySelectorAll("#helpNav .dcs-settings-nav__link"));
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
     SEVERITY GUIDE — full 5-stage scale, plain-language explanations
     ------------------------------------------------------------------------ */
  const SEVERITY_GUIDE = [
    { key: "e",  label: "Enamel", desc: "Early-stage decay limited to the outer enamel layer. Often reversible with preventive care such as fluoride treatment and improved oral hygiene." },
    { key: "d1", label: "Dentin 1", desc: "Decay has just begun reaching the dentin layer beneath the enamel. Usually treatable with a conservative filling." },
    { key: "d2", label: "Dentin 2", desc: "Decay has progressed further into the dentin. Typically requires a standard restorative filling." },
    { key: "d3", label: "Dentin 3", desc: "Decay is close to the pulp chamber. May require a deeper restoration or a protective liner depending on clinical assessment." },
    { key: "p",  label: "Pulp", desc: "Decay has reached the pulp (the tooth's nerve and blood supply). Often requires root canal treatment or further evaluation." },
  ];

  function renderSeverityGuide() {
    const container = document.getElementById("severityGuideList");
    container.innerHTML = SEVERITY_GUIDE.map((s) => `
      <div class="dcs-sev-guide__item">
        <span class="dcs-sev-guide__dot" style="background:var(--severity-${s.key})"></span>
        <div>
          <div class="dcs-sev-guide__title">${s.label}</div>
          <div class="dcs-sev-guide__desc">${s.desc}</div>
        </div>
      </div>
    `).join("");
  }
  renderSeverityGuide();

  /* ------------------------------------------------------------------------
     SUPPORT FORM
     ------------------------------------------------------------------------ */
  document.getElementById("sendSupportBtn").addEventListener("click", () => {
    const message = document.getElementById("supportMessage");
    if (!message.value.trim()) {
      DCS.toast.show({ type: "warning", title: "Message required", message: "Please describe your issue or question before sending." });
      return;
    }
    DCS.toast.show({ type: "success", title: "Message sent", message: "The KCD IT support desk will get back to you shortly." });
    message.value = "";
  });
})();
