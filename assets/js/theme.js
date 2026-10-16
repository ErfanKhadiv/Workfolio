/* Workfolio - dark / light mode toggle.
   The initial theme is set by a tiny inline script in <head> (no flash).
   This file wires up the button(s) and keeps the choice in localStorage. */
(function () {
    "use strict";
    var KEY = "workfolio-theme";
    var root = document.documentElement;

    function current() { return root.getAttribute("data-theme") === "dark" ? "dark" : "light"; }

    function apply(theme, persist) {
        root.setAttribute("data-theme", theme);
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", theme === "dark" ? "#0b1220" : "#ffffff");
        document.querySelectorAll(".theme-toggle").forEach(function (b) {
            var dark = theme === "dark";
            b.setAttribute("aria-pressed", String(dark));
            b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
            b.title = dark ? "Switch to light mode" : "Switch to dark mode";
        });
        if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    }

    function init() {
        apply(current(), false);
        document.querySelectorAll(".theme-toggle").forEach(function (b) {
            b.addEventListener("click", function () { apply(current() === "dark" ? "light" : "dark", true); });
        });
        requestAnimationFrame(function () { root.classList.add("theme-ready"); });

        // keep several open tabs in sync
        window.addEventListener("storage", function (e) {
            if (e.key === KEY && (e.newValue === "dark" || e.newValue === "light")) apply(e.newValue, false);
        });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
