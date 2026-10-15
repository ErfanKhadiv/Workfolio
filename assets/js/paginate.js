/* Workfolio - page-break layout
 * Workfolio.paginate(root, page) makes sure no entry (job, project, skill row...)
 * and no section heading is ever cut by a page boundary. Anything that would
 * cross the boundary is moved to the next page with a spacer, and every
 * continuation page gets the same breathing room at the top and bottom.
 * The result is what you see on screen AND what the browser prints, so the PDF
 * matches the preview. Returns the number of pages.
 *
 * Sidebar templates: if the sidebar would spill onto page 2, the sidebar spacing is
 * tightened in up to three steps (data-tight="1".."3", see resume.css) until it fits on
 * page 1. Small sidebar sections (contact, languages...) always move as one piece.
 */
(function (W) {
    "use strict";

    const PAD_TOP = 40;    // space kept free at the top of pages 2, 3, ... (px)
    const PAD_BOTTOM = 32; // minimum space kept free at the bottom of every page (px)
    const SLACK = 2;       // printed pages are a fraction of a pixel shorter than the CSS pixel size
    // exact printed page height, so a one-page resume never spills onto a blank 2nd page
    const PAGE_CSS = { a4: (n) => `${n * 297}mm`, letter: (n) => `${n * 11}in` };

    function clear(root) {
        root.querySelectorAll(".pg-spacer, .pg-guide, .pg-num").forEach((n) => n.remove());
        root.style.minHeight = "";
        delete root.dataset.tight;
        root.querySelectorAll(".pg-last").forEach((sec) => { sec.classList.remove("pg-last"); sec.style.marginBottom = ""; });
    }

    // blocks that must stay in one piece. The first block of a section travels with its heading.
    const SIDE_WHOLE_MAX = 240; // sidebar sections up to this height (px) are never split

    // a real sidebar is a column of its own (single-column templates flatten it with display: contents)
    function realSide(root) {
        const side = root.querySelector(".r-side");
        return side && getComputedStyle(side).display !== "contents" ? side : null;
    }

    function collectUnits(root) {
        const units = [];
        const side = realSide(root);
        root.querySelectorAll(".sec").forEach((sec) => {
            const body = sec.querySelector(":scope > .sec-body");
            if (!body) return; // contact block: small and always at the top
            const h2 = sec.querySelector(":scope > h2");
            if (side && side.contains(sec) && sec.offsetHeight <= SIDE_WHOLE_MAX) {
                units.push({ nodes: [sec], target: sec, sec });
                return;
            }
            Array.from(body.children).filter((c) => !c.classList.contains("pg-spacer")).forEach((child, i) => {
                units.push({ nodes: i === 0 ? [h2, child] : [child], target: i === 0 ? sec : child, sec });
            });
        });
        return units;
    }

    // The template's own bottom padding sits below the last block of the last page, so a page
    // must keep at least that much free, otherwise the padding alone would create an extra page.
    function bottomSpace(root) {
        const px = (el) => (el ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0);
        return Math.max(PAD_BOTTOM, px(root), px(root.querySelector(".r-main")), px(root.querySelector(".r-side"))) + SLACK;
    }

    function measure(unit, rootRect, scale) {
        const rects = unit.nodes.map((n) => n.getBoundingClientRect());
        const top = Math.min(...rects.map((r) => r.top));
        // Only the last node decides the bottom. In templates with a label column (Minimal) the heading
        // is stretched to the height of the whole section, which used to make the section's first entry
        // look as tall as the entire section and pushed all of it to the next page.
        const bottom = rects[rects.length - 1].bottom;
        return { top: (top - rootRect.top) / scale, bottom: (bottom - rootRect.top) / scale };
    }

    // moves every block that would cross a page boundary onto the next page
    function layout(root, H) {
        const padBottom = bottomSpace(root);
        let guard = 400;
        while (guard-- > 0) {
            const rootRect = root.getBoundingClientRect();
            const scale = rootRect.width / root.offsetWidth || 1; // preview is scaled with a CSS transform
            let moved = false;

            // find the first (top-most) block that crosses a page boundary
            const crossing = collectUnits(root)
                .map((u) => ({ u, m: measure(u, rootRect, scale) }))
                .filter(({ m }) => {
                    const pageIndex = Math.floor((m.top + 0.5) / H);
                    const limit = (pageIndex + 1) * H - padBottom;
                    const fits = m.bottom - m.top <= H - PAD_TOP - padBottom;
                    return fits && m.bottom > limit;
                })
                .sort((a, b) => a.m.top - b.m.top)[0];

            if (crossing) {
                const { u, m } = crossing;
                const nextPageTop = (Math.floor((m.top + 0.5) / H) + 1) * H;
                const spacer = document.createElement("div");
                spacer.className = "pg-spacer";
                spacer.setAttribute("aria-hidden", "true");
                spacer.style.cssText = `height:${Math.ceil(nextPageTop + PAD_TOP - m.top)}px;flex:none;`;
                if (u.target.style.order) spacer.style.order = u.target.style.order; // keep flex ordering
                u.target.before(spacer);
                moved = true;
            }
            if (!moved) break;
        }
    }

    // true when a sidebar section starts on page 2 or later
    function sideSpills(root, H) {
        const side = realSide(root);
        if (!side) return false;
        const rootRect = root.getBoundingClientRect();
        const scale = rootRect.width / root.offsetWidth || 1;
        return Array.from(side.querySelectorAll(":scope > .sec")).some((sec) => (sec.getBoundingClientRect().top - rootRect.top) / scale >= H - 1);
    }

    // The last section of every column keeps no bottom margin. That margin is trailing space, not content,
    // but when the content ends just inside a page it pushed the page over its height: the page counter said
    // "2 pages" and a completely blank second page was added (and printed).
    function trimTrailingMargins(root) {
        const flowParent = (el) => {
            let p = el.parentElement;
            while (p && getComputedStyle(p).display === "contents") p = p.parentElement;
            return p;
        };
        const lowest = new Map();
        root.querySelectorAll(".sec").forEach((sec) => {
            const r = sec.getBoundingClientRect();
            if (!r.height) return; // hidden (for example the contact block in single-column templates)
            const key = flowParent(sec);
            const cur = lowest.get(key);
            if (!cur || r.bottom > cur.bottom) lowest.set(key, { sec, bottom: r.bottom });
        });
        lowest.forEach(({ sec }) => {
            sec.classList.add("pg-last");
            sec.style.marginBottom = "0";
        });
    }

    function paginate(root, paper) {
        const H = W.PAGE[paper].h;

        // try the normal spacing first, then tighten the sidebar until it fits on the first page
        for (let level = 0; level <= 3; level++) {
            clear(root);
            if (level) root.dataset.tight = String(level);
            layout(root, H);
            if (level === 3 || !sideSpills(root, H)) break;
        }

        trimTrailingMargins(root);
        const pages = Math.max(1, Math.ceil((root.offsetHeight - 4) / H));
        root.style.minHeight = `calc(${PAGE_CSS[paper](pages)} - 1px)`; // fills every page (sidebar colours, banners)
        root.dataset.pages = String(pages);
        return pages;
    }

    // dashed page-edge markers, shown on screen only (hidden when printing)
    function addGuides(root, pages, paper) {
        const H = W.PAGE[paper].h;
        for (let i = 1; i < pages; i++) {
            const g = document.createElement("div");
            g.className = "pg-guide";
            g.setAttribute("aria-hidden", "true");
            g.style.top = `${i * H}px`;
            g.textContent = `page ${i + 1}`;
            root.append(g);
        }
    }

    // "Page 1 of 3" in the bottom margin of every page (only for multi-page resumes).
    // Sits inside the space paginate() keeps free, so it never touches the content.
    function addNumbers(root, pages, paper) {
        const H = W.PAGE[paper].h;
        for (let i = 0; i < pages; i++) {
            const n = document.createElement("div");
            n.className = "pg-num";
            n.setAttribute("aria-hidden", "true");
            n.style.top = `${(i + 1) * H - 26}px`;
            n.textContent = `Page ${i + 1} of ${pages}`;
            root.append(n);
        }
    }

    W.paginate = function (root, paper, opts) {
        const pages = paginate(root, paper);
        if (!opts || opts.guides !== false) addGuides(root, pages, paper);
        if (pages > 1 && (!opts || opts.numbers !== false)) addNumbers(root, pages, paper);
        return pages;
    };
})(window.Workfolio);
