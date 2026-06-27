/* ============================================================
   VĀRTA editorial — language switch · theme · live wire
   Language switch sets <html lang/dir>; :lang() CSS retunes
   every font + line-height automatically. Then we swap text.
   ============================================================ */
(function () {
  const root = document.documentElement;
  const LKEY = "varta-ed-lang";
  const TKEY = "varta-ed-theme";
  const order = ["en", "hi", "ta", "bn", "ur"];

  function dict() { return (window.I18N && window.I18N[root.lang]) || window.I18N.en; }

  function apply(lang) {
    const I = window.I18N[lang] || window.I18N.en;
    root.lang = lang;
    root.dir = I.dir || "ltr";
    // text nodes
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const k = el.getAttribute("data-i18n");
      if (I[k] != null) el.textContent = I[k];
    });
    // composed read-time / views tails: <span data-read="6"></span>
    document.querySelectorAll("[data-read]").forEach(el => {
      el.textContent = el.getAttribute("data-read") + " " + (I.readUnit || "");
    });
    document.querySelectorAll("[data-views]").forEach(el => {
      el.textContent = el.getAttribute("data-views") + " " + (I.viewsUnit || "");
    });
    // language button label + menu active state
    document.querySelectorAll("[data-lang-current]").forEach(el => el.textContent = I._native);
    document.querySelectorAll(".lang-menu button, .foot-lang button").forEach(b => {
      b.classList.toggle("active", b.getAttribute("data-set-lang") === lang);
    });
    try { localStorage.setItem(LKEY, lang); } catch (e) {}
  }

  function setTheme(t) {
    root.setAttribute("data-theme", t);
    try { localStorage.setItem(TKEY, t); } catch (e) {}
    document.querySelectorAll("[data-theme-label]").forEach(el => el.textContent = t === "dark" ? "Light" : "Dark");
  }

  document.addEventListener("DOMContentLoaded", () => {
    // restore (URL ?lang / ?theme override and do NOT persist — lets canvas frames differ)
    const params = new URLSearchParams(location.search);
    const pLang = params.get("lang"), pTheme = params.get("theme");
    let lang = "en", theme = "light";
    try { lang = localStorage.getItem(LKEY) || "en"; theme = localStorage.getItem(TKEY) || "light"; } catch (e) {}
    if (pTheme) root.setAttribute("data-theme", pTheme); else setTheme(theme);
    if (pLang && window.I18N[pLang]) { root.lang = pLang; root.dir = window.I18N[pLang].dir || "ltr";
      document.querySelectorAll("[data-i18n]").forEach(el => { const k = el.getAttribute("data-i18n"); const I = window.I18N[pLang]; if (I[k] != null) el.textContent = I[k]; });
      document.querySelectorAll("[data-read]").forEach(el => el.textContent = el.getAttribute("data-read") + " " + window.I18N[pLang].readUnit);
      document.querySelectorAll("[data-views]").forEach(el => el.textContent = el.getAttribute("data-views") + " " + window.I18N[pLang].viewsUnit);
      document.querySelectorAll("[data-lang-current]").forEach(el => el.textContent = window.I18N[pLang]._native);
    } else {
      apply(order.includes(lang) ? lang : "en");
    }

    // language dropdown
    const langWrap = document.querySelector(".lang");
    const langBtn = document.querySelector(".lang-btn");
    if (langBtn && langWrap) {
      langBtn.addEventListener("click", e => { e.stopPropagation(); langWrap.classList.toggle("open"); });
      document.addEventListener("click", () => langWrap.classList.remove("open"));
    }
    document.querySelectorAll("[data-set-lang]").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        apply(b.getAttribute("data-set-lang"));
        langWrap && langWrap.classList.remove("open");
      });
    });

    // theme toggles
    document.querySelectorAll("[data-theme-toggle]").forEach(b => {
      b.addEventListener("click", () => setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark"));
    });

    // gentle "live" affordance: the newest wire row + thread dot breathe via CSS;
    // here we only rotate the wire order subtly to feel real-time (optional, paused on hover)
    const wire = document.querySelector("[data-wire-rotate]");
    if (wire && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let paused = false;
      wire.addEventListener("pointerenter", () => paused = true);
      wire.addEventListener("pointerleave", () => paused = false);
      setInterval(() => {
        if (paused) return;
        const first = wire.querySelector(".wire-item");
        if (first && wire.children.length > 2) {
          first.style.transition = "opacity .3s";
          first.style.opacity = "0";
          setTimeout(() => { wire.appendChild(first); first.style.opacity = "1"; }, 300);
        }
      }, 6000);
    }
  });
})();
