/*
 * Conjunto360 · Motor de la presentación (sin dependencias).
 *
 * Teclado: → / Espacio / AvPág = siguiente · ← / RePág = anterior · Inicio / Fin
 *          F = pantalla completa · O = vista general · N = notas del presentador · ? = ayuda
 * Táctil: deslizar a izquierda o derecha. La URL guarda la diapositiva actual (#5).
 */
(function () {
  "use strict";

  var deck = document.querySelector(".deck");
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var total = slides.length;
  var current = 0;

  var progress = document.querySelector(".progress");
  var counter = document.querySelector(".controls .count");
  var notesBody = document.querySelector(".notes-panel .body");
  var overviewList = document.querySelector(".overview ol");

  // --- Escalado del lienzo 1920×1080 a la ventana ---
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    deck.style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }

  // --- Pie de página con número y título (se arma una sola vez) ---
  slides.forEach(function (slide, i) {
    if (slide.hasAttribute("data-sin-pie")) return;
    var foot = document.createElement("div");
    foot.className = "foot";
    foot.setAttribute("aria-hidden", "true");
    foot.innerHTML =
      '<span class="logo" style="font-size:20px"><span class="mark"><svg class="ic"><use href="#i-building-2"/></svg></span><span class="wordmark">Conjunto<span class="n360">360</span></span></span>' +
      '<span class="sep"></span><span>Propuesta comercial</span>' +
      '<span class="num">' + String(i + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0") + "</span>";
    slide.appendChild(foot);
  });

  // --- Vista general ---
  slides.forEach(function (slide, i) {
    var titulo = slide.getAttribute("data-titulo") || (slide.querySelector("h1, h2") || {}).textContent || "Diapositiva " + (i + 1);
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = "<b>" + String(i + 1).padStart(2, "0") + "</b>";
    b.appendChild(document.createTextNode(titulo.replace(/\s+/g, " ").trim()));
    b.addEventListener("click", function () {
      go(i);
      toggle("show-overview", false);
    });
    li.appendChild(b);
    overviewList.appendChild(li);
  });
  var overviewButtons = overviewList.querySelectorAll("button");

  function go(n, opts) {
    n = Math.max(0, Math.min(total - 1, n));
    slides[current].classList.remove("is-active");
    slides[current].setAttribute("aria-hidden", "true");
    current = n;
    var s = slides[current];
    s.classList.add("is-active");
    s.removeAttribute("aria-hidden");
    progress.style.width = ((current + 1) / total) * 100 + "%";
    counter.textContent = current + 1 + " / " + total;
    var notes = s.querySelector("aside.notes");
    notesBody.innerHTML = notes ? notes.innerHTML : "<p>Sin notas para esta diapositiva.</p>";
    overviewButtons.forEach(function (b, i) {
      b.setAttribute("aria-current", i === current ? "true" : "false");
    });
    document.title = (s.getAttribute("data-titulo") || "Conjunto360") + " · Conjunto360";
    if (!opts || !opts.fromHash) history.replaceState(null, "", "#" + (current + 1));
  }

  function toggle(cls, force) {
    document.body.classList.toggle(cls, force);
  }

  function fullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      document.exitFullscreen();
    }
  }

  // --- Teclado ---
  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea")) return;
    var k = e.key;
    if (document.body.classList.contains("show-help") && k !== "?") {
      toggle("show-help", false);
      return;
    }
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") {
      if (document.body.classList.contains("show-overview")) return;
      e.preventDefault();
      go(current + 1);
    } else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") {
      e.preventDefault();
      go(current - 1);
    } else if (k === "Home") {
      go(0);
    } else if (k === "End") {
      go(total - 1);
    } else if (k === "f" || k === "F") {
      fullscreen();
    } else if (k === "o" || k === "O") {
      toggle("show-overview");
      if (document.body.classList.contains("show-overview")) overviewButtons[current].focus();
    } else if (k === "Escape") {
      toggle("show-overview", false);
      toggle("show-help", false);
    } else if (k === "n" || k === "N") {
      toggle("show-notes");
    } else if (k === "?") {
      toggle("show-help");
    }
  });

  // --- Botones ---
  document.querySelector("[data-accion=anterior]").addEventListener("click", function () { go(current - 1); });
  document.querySelector("[data-accion=siguiente]").addEventListener("click", function () { go(current + 1); });
  document.querySelector("[data-accion=general]").addEventListener("click", function () { toggle("show-overview"); });
  document.querySelector("[data-accion=notas]").addEventListener("click", function () { toggle("show-notes"); });
  document.querySelector("[data-accion=completa]").addEventListener("click", fullscreen);
  document.querySelector("[data-accion=ayuda]").addEventListener("click", function () { toggle("show-help"); });
  document.querySelector(".help").addEventListener("click", function () { toggle("show-help", false); });

  // Clic en la diapositiva: mitad derecha avanza, mitad izquierda retrocede.
  document.querySelector(".viewport").addEventListener("click", function (e) {
    if (e.target.closest("a, button")) return;
    if (e.clientX > window.innerWidth / 2) go(current + 1);
    else go(current - 1);
  });

  // --- Táctil ---
  var x0 = null;
  var y0 = null;
  document.addEventListener("touchstart", function (e) {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(current + (dx < 0 ? 1 : -1));
    x0 = null;
  });

  // Muestra los controles un momento al mover el mouse.
  var uiTimer;
  document.addEventListener("mousemove", function () {
    document.body.classList.add("show-ui");
    clearTimeout(uiTimer);
    uiTimer = setTimeout(function () { document.body.classList.remove("show-ui"); }, 1800);
  });

  // --- Arranque ---
  window.addEventListener("resize", fit);
  window.addEventListener("hashchange", function () {
    var n = parseInt(location.hash.slice(1), 10);
    if (n && n - 1 !== current) go(n - 1, { fromHash: true });
  });
  slides.forEach(function (s) { s.setAttribute("aria-hidden", "true"); });
  fit();
  var inicial = parseInt(location.hash.slice(1), 10);
  go(inicial ? inicial - 1 : 0);
})();
