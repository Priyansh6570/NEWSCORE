/* VĀRTA design-system page — theme toggle + depth demos */
(function () {
  const root = document.documentElement;
  const KEY = "varta-ds-theme";
  const saved = localStorage.getItem(KEY);
  if (saved) root.setAttribute("data-theme", saved);

  function setTheme(t) {
    root.setAttribute("data-theme", t);
    localStorage.setItem(KEY, t);
    document.querySelectorAll("[data-theme-label]").forEach(el => {
      el.textContent = t === "dark" ? "Light" : "Dark";
    });
  }
  window.addEventListener("DOMContentLoaded", () => {
    const cur = root.getAttribute("data-theme") || "light";
    document.querySelectorAll("[data-theme-label]").forEach(el => {
      el.textContent = cur === "dark" ? "Light" : "Dark";
    });
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
      btn.addEventListener("click", () => {
        const next = (root.getAttribute("data-theme") === "dark") ? "light" : "dark";
        setTheme(next);
      });
    });

    /* ---- 3D tilt (curves + depth signature) ---- */
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      document.querySelectorAll("[data-tilt]").forEach(card => {
        const max = parseFloat(card.getAttribute("data-tilt")) || 8;
        card.style.transition = "transform 120ms ease-out";
        card.style.transformStyle = "preserve-3d";
        card.addEventListener("pointermove", e => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          card.style.transform = `perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateY(-4px)`;
          const layer = card.querySelector("[data-tilt-layer]");
          if (layer) layer.style.transform = `translate(${px * 18}px, ${py * 18}px)`;
        });
        card.addEventListener("pointerleave", () => {
          card.style.transform = "";
          const layer = card.querySelector("[data-tilt-layer]");
          if (layer) layer.style.transform = "";
        });
      });

      /* ---- gentle parallax on decorative blobs ---- */
      const blobs = document.querySelectorAll("[data-parallax]");
      if (blobs.length) {
        window.addEventListener("scroll", () => {
          const y = window.scrollY;
          blobs.forEach(b => {
            const sp = parseFloat(b.getAttribute("data-parallax")) || 0.1;
            b.style.transform = `translate3d(0, ${y * sp}px, 0)`;
          });
        }, { passive: true });
      }
    }
  });
})();
