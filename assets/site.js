/* The Award Hacker — shared site enhancements (vanilla JS, no dependencies).
 * Features: site search, article TOC + scroll-spy, reading progress bar,
 * sortable tables, FAQ accordions, dark mode toggle, back-to-top button.
 * Every feature checks for its required DOM first, so pages that lack the
 * markup simply skip that feature. If this script fails to load, the site
 * works exactly as before.
 */
(function () {
  "use strict";

  var THEME_KEY = "tah-theme";
  var IS_ARTICLE = /\/articles\//.test(location.pathname);

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  /* ============ 1. Site search (search box injected into the nav) ============ */
  function initSearch() {
    var navBar = document.querySelector(".nav-bar");
    if (!navBar) return;

    var inArticles = /\/articles\//.test(location.pathname);
    var linkPrefix = inArticles ? "../" : "";
    var scriptEl = document.currentScript;
    var indexUrl = scriptEl
      ? new URL("../search-index.json", scriptEl.src).href
      : (inArticles ? "../search-index.json" : "search-index.json");

    var box = document.createElement("div");
    box.className = "site-search";
    box.innerHTML =
      '<label class="sr-only" for="site-search-input">Search guides</label>' +
      '<input id="site-search-input" type="search" placeholder="Search guides\u2026" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="site-search-results">' +
      '<div class="search-results" id="site-search-results" role="listbox" hidden></div>';
    var toggle = navBar.querySelector(".nav-toggle");
    navBar.insertBefore(box, toggle || navBar.querySelector(".site-nav"));

    var input = box.querySelector("input");
    var results = box.querySelector(".search-results");
    var index = null;
    var activeIdx = -1;
    var items = [];

    fetch(indexUrl)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { index = Array.isArray(data) ? data : []; })
      .catch(function () { index = []; });

    function close() {
      results.hidden = true;
      input.setAttribute("aria-expanded", "false");
      activeIdx = -1;
    }

    function render(query) {
      var q = query.trim().toLowerCase();
      results.innerHTML = "";
      items = [];
      if (!q || !index) { close(); return; }
      var matches = index.filter(function (e) {
        var hay = (e.title + " " + e.excerpt + " " + (e.headings || []).join(" ")).toLowerCase();
        return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
      }).slice(0, 6);
      if (!matches.length) {
        results.innerHTML = '<p class="search-empty">No guides match your search.</p>';
      } else {
        matches.forEach(function (e) {
          var a = document.createElement("a");
          a.className = "search-item";
          a.href = linkPrefix + e.url;
          a.setAttribute("role", "option");
          var title = document.createElement("strong");
          title.textContent = e.title;
          var ex = document.createElement("span");
          ex.textContent = e.excerpt;
          a.appendChild(title);
          a.appendChild(ex);
          results.appendChild(a);
          items.push(a);
        });
      }
      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
      activeIdx = -1;
    }

    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { if (input.value.trim()) render(input.value); });
    input.addEventListener("keydown", function (ev) {
      if (results.hidden) return;
      if (ev.key === "Escape") { close(); input.blur(); }
      else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        if (!items.length) return;
        activeIdx = ev.key === "ArrowDown"
          ? (activeIdx + 1) % items.length
          : (activeIdx - 1 + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle("active", i === activeIdx); });
        if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: "nearest" });
      } else if (ev.key === "Enter" && activeIdx >= 0 && items[activeIdx]) {
        ev.preventDefault();
        location.href = items[activeIdx].href;
      }
    });
    document.addEventListener("click", function (ev) {
      if (!box.contains(ev.target)) close();
    });
  }

  /* ============ 2. Article table of contents + scroll-spy ============ */
  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  }

  function initToc() {
    if (!IS_ARTICLE) return;
    var prose = document.querySelector("article.prose");
    if (!prose) return;
    var headings = Array.prototype.filter.call(
      prose.querySelectorAll("h2"),
      function (h) { return !h.closest(".faq") && !h.closest(".keep-reading"); }
    );
    if (headings.length < 2) return;

    var layout = document.createElement("div");
    layout.className = "article-layout";
    prose.parentNode.insertBefore(layout, prose);
    layout.appendChild(prose);

    var aside = document.createElement("aside");
    aside.className = "toc";
    aside.setAttribute("aria-label", "Table of contents");
    aside.innerHTML = '<p class="toc-title">On this page</p>';
    var list = document.createElement("ul");
    var used = {};
    headings.forEach(function (h) {
      if (!h.id) {
        var base = slugify(h.textContent), id = base, n = 1;
        while (used[id] || document.getElementById(id)) { id = base + "-" + (++n); }
        used[id] = true;
        h.id = id;
      }
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.className = "toc-link";
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      a.dataset.target = h.id;
      li.appendChild(a);
      list.appendChild(li);
    });
    aside.appendChild(list);
    layout.insertBefore(aside, prose);

    // Scroll-spy
    var links = list.querySelectorAll(".toc-link");
    function setActive(id) {
      links.forEach(function (a) { a.classList.toggle("active", a.dataset.target === id); });
    }
    if ("IntersectionObserver" in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) setActive(en.target.id);
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      headings.forEach(function (h) { obs.observe(h); });
    }
  }

  /* ============ 3. Reading progress bar (article pages) ============ */
  function initProgress() {
    if (!IS_ARTICLE) return;
    var bar = document.createElement("div");
    bar.className = "read-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    var ticking = false;
    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ============ 4. Sortable comparison tables ============ */
  function cellValue(td) {
    var t = td.textContent.trim().replace(/[$,%\u2013\u2014]/g, "").replace(/,/g, "");
    var num = parseFloat(t);
    return isNaN(num) ? td.textContent.trim().toLowerCase() : num;
  }

  function initSortableTables() {
    var prose = document.querySelector("article.prose");
    if (!prose) return;
    prose.querySelectorAll("table").forEach(function (table) {
      var headerRow = table.tHead
        ? table.tHead.rows[0]
        : Array.prototype.find.call(table.rows, function (r) { return r.querySelector("th"); });
      if (!headerRow) return;
      var body = table.tBodies[0];
      if (!body || body.rows.length < 2) return;

      Array.prototype.forEach.call(headerRow.cells, function (th, colIdx) {
        if (th.tagName !== "TH") return;
        th.classList.add("sortable");
        th.setAttribute("tabindex", "0");
        th.setAttribute("title", "Sort by this column");
        var dir = 1;
        function sort() {
          var rows = Array.prototype.slice.call(body.rows);
          rows.sort(function (a, b) {
            var va = cellValue(a.cells[colIdx] || { textContent: "" });
            var vb = cellValue(b.cells[colIdx] || { textContent: "" });
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
          });
          rows.forEach(function (r) { body.appendChild(r); });
          dir *= -1;
          Array.prototype.forEach.call(headerRow.cells, function (c) { c.removeAttribute("aria-sort"); });
          th.setAttribute("aria-sort", dir === 1 ? "descending" : "ascending");
          th.classList.toggle("sorted-asc", dir === -1);
          th.classList.toggle("sorted-desc", dir === 1);
        }
        th.addEventListener("click", sort);
        th.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); sort(); }
        });
      });
    });
  }

  /* ============ 5. FAQ accordions ============ */
  function initFaq() {
    document.querySelectorAll(".faq").forEach(function (faq) {
      Array.prototype.slice.call(faq.querySelectorAll("p")).forEach(function (p) {
        var q = p.querySelector("strong.q");
        if (!q) return;
        var item = document.createElement("div");
        item.className = "faq-item";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "faq-q";
        btn.setAttribute("aria-expanded", "false");
        var label = document.createElement("span");
        label.textContent = q.textContent;
        var icon = document.createElement("span");
        icon.className = "faq-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "+";
        btn.appendChild(label);
        btn.appendChild(icon);
        var answer = document.createElement("div");
        answer.className = "faq-a";
        answer.hidden = true;
        var rest = p.innerHTML.replace(q.outerHTML, "").replace(/^\s*<br\s*\/?>/i, "").trim();
        answer.innerHTML = "<p>" + rest + "</p>";
        btn.addEventListener("click", function () {
          var open = btn.getAttribute("aria-expanded") === "true";
          btn.setAttribute("aria-expanded", String(!open));
          answer.hidden = open;
          icon.textContent = open ? "+" : "\u2212";
        });
        item.appendChild(btn);
        item.appendChild(answer);
        p.replaceWith(item);
      });
    });
  }

  /* ============ 6. Dark mode toggle ============ */
  function currentTheme() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch (e) {}
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e2) { return "light"; }
  }

  function initDarkMode() {
    var navBar = document.querySelector(".nav-bar");
    if (!navBar) return;
    if (!document.documentElement.hasAttribute("data-theme")) {
      if (currentTheme() === "dark") document.documentElement.setAttribute("data-theme", "dark");
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    function paint() {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.textContent = dark ? "\u2600" : "\u263E";
      btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      btn.title = btn.getAttribute("aria-label");
    }
    btn.addEventListener("click", function () {
      var dark = document.documentElement.getAttribute("data-theme") === "dark";
      if (dark) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", "dark");
      try { localStorage.setItem(THEME_KEY, dark ? "light" : "dark"); } catch (e) {}
      paint();
    });
    paint();
    var toggle = navBar.querySelector(".nav-toggle");
    navBar.insertBefore(btn, toggle);
  }

  /* ============ 7. Back-to-top button ============ */
  function initBackToTop() {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "back-to-top";
    btn.setAttribute("aria-label", "Back to top");
    btn.textContent = "\u2191";
    btn.hidden = true;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(btn);
    var ticking = false;
    function update() {
      btn.hidden = window.scrollY < 600;
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  onReady(function () {
    try { initSearch(); } catch (e) {}
    try { initDarkMode(); } catch (e) {}
    try { initToc(); } catch (e) {}
    try { initProgress(); } catch (e) {}
    try { initSortableTables(); } catch (e) {}
    try { initFaq(); } catch (e) {}
    try { initBackToTop(); } catch (e) {}
  });
})();
