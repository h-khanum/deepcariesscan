/* ==========================================================================
   DeepCariesScan — Login Page Behavior
   Vanilla JS, no framework, no build step (Design Bible §15).

   BACKEND INTEGRATION NOTE:
   This form currently POSTs JSON to "/login". Since the Flask backend
   already exists (per the project brief), wire it up like this on the
   server side:

     @app.route("/login", methods=["POST"])
     def login():
         data = request.get_json()
         # validate data["email"], data["password"] against your user store
         # on success: return jsonify({ "ok": True, "redirect": "/dashboard" })
         # on failure: return jsonify({ "ok": False, "message": "Invalid credentials" }), 401

   If no backend is reachable (e.g., previewing this file standalone), the
   script falls back to a short simulated demo flow so the page is still
   fully clickable/demoable — see `fakeLoginFallback()` below.
   ========================================================================== */

(function () {
  "use strict";

  const form = document.getElementById("loginForm");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const emailField = document.getElementById("emailField");
  const passwordField = document.getElementById("passwordField");
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const submitBtn = document.getElementById("submitBtn");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const eyeIcon = document.getElementById("eyeIcon");
  const demoBtn = document.getElementById("demoBtn");
  const forgotLink = document.getElementById("forgotLink");

  const EYE_OPEN = eyeIcon.innerHTML;
  const EYE_CLOSED = '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.22-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a19.83 19.83 0 0 1-2.94 4.31M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/>';

  /* ------------------------------------------------------------------------
     Password visibility toggle
     ------------------------------------------------------------------------ */
  togglePasswordBtn.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    eyeIcon.innerHTML = isPassword ? EYE_CLOSED : EYE_OPEN;
    togglePasswordBtn.setAttribute("aria-pressed", String(isPassword));
    togglePasswordBtn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
  });

  /* ------------------------------------------------------------------------
     Inline validation helpers
     ------------------------------------------------------------------------ */
  function setFieldError(fieldEl, errorEl, show) {
    fieldEl.classList.toggle("dcs-error", show);
    errorEl.hidden = !show;
  }

  function clearErrors() {
    setFieldError(emailField, emailError, false);
    setFieldError(passwordField, passwordError, false);
  }

  emailInput.addEventListener("input", () => {
    if (emailInput.value.trim()) setFieldError(emailField, emailError, false);
  });
  passwordInput.addEventListener("input", () => {
    if (passwordInput.value.trim()) setFieldError(passwordField, passwordError, false);
  });

  function validate() {
    let valid = true;
    if (!emailInput.value.trim()) {
      setFieldError(emailField, emailError, true);
      valid = false;
    }
    if (!passwordInput.value.trim()) {
      setFieldError(passwordField, passwordError, true);
      valid = false;
    }
    return valid;
  }

  /* ------------------------------------------------------------------------
     Submit button loading state
     ------------------------------------------------------------------------ */
  function setLoading(isLoading) {
    submitBtn.classList.toggle("dcs-loading", isLoading);
    submitBtn.disabled = isLoading;
    demoBtn.disabled = isLoading;
  }

  /* ------------------------------------------------------------------------
     Submit flow
     ------------------------------------------------------------------------ */
  async function handleLogin(email, password) {
    setLoading(true);
    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // If a real Flask backend is listening, use its response.
      const data = await response.json().catch(() => null);

      if (response.ok && data && data.ok) {
        DCS.toast.show({ type: "success", title: "Signed in", message: "Redirecting to your dashboard…" });
        setTimeout(() => { window.location.href = data.redirect || "dashboard.html"; }, 700);
      } else {
        setLoading(false);
        DCS.toast.show({
          type: "error",
          title: "Sign in failed",
          message: (data && data.message) || "Invalid email or password.",
        });
      }
    } catch (err) {
      // No backend reachable in this static preview — fall back to a
      // simulated flow so the page remains demoable end-to-end.
      fakeLoginFallback(email, password);
    }
  }

  function fakeLoginFallback(email, password) {
    setTimeout(() => {
      setLoading(false);
      DCS.toast.show({
        type: "info",
        title: "Preview mode",
        message: "No backend detected — simulating a successful sign-in.",
      });
      setTimeout(() => {
        DCS.toast.show({ type: "success", title: "Signed in", message: `Welcome, ${email.split("@")[0]}.` });
      }, 600);
    }, 900);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors();
    if (!validate()) {
      DCS.toast.show({ type: "warning", title: "Missing information", message: "Please fill in both fields to continue." });
      return;
    }
    handleLogin(emailInput.value.trim(), passwordInput.value);
  });

  /* ------------------------------------------------------------------------
     Demo account shortcut — useful for supervisor/faculty demos (§3 tertiary
     user class: faculty need to see the demo run cleanly).
     ------------------------------------------------------------------------ */
  demoBtn.addEventListener("click", () => {
    emailInput.value = "demo.dentist@kcd.edu.pk";
    passwordInput.value = "DemoAccess123";
    clearErrors();
    DCS.toast.show({ type: "info", title: "Demo credentials filled", message: "Click \u201cSign In\u201d to continue." });
    emailInput.focus();
  });

  /* ------------------------------------------------------------------------
     Forgot password — placeholder until that flow/page is built
     ------------------------------------------------------------------------ */
  forgotLink.addEventListener("click", (e) => {
    e.preventDefault();
    DCS.toast.show({
      type: "info",
      title: "Password reset",
      message: "Contact your clinic administrator to reset your password.",
    });
  });
})();
