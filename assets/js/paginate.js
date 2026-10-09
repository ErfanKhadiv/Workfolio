/* Workfolio - page-break layout
 * Workfolio.paginate(root, page) makes sure no entry (job, project, skill row...)
 * and no section heading is ever cut by a page boundary. Anything that would
 * cross the boundary is moved to the next page with a spacer, and every
 * continuation page gets the same breathing room at the top and bottom.
 * The result is what you see on screen AND what the browser prints, so the PDF
 * matches the preview. Returns the number of pages.
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
    }

    // blocks that must stay in one piece. The first block of a section travels with its heading.
    function collectUnits(root) {
        const units = [];
        root.querySelectorAll(".sec").forEach((sec) => {
            const body = sec.querySelector(":scope > .sec-body");
            if (!body) return; // contact block: small and always at the top
            const h2 = sec.querySelector(":scope > h2");
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
        const bottom = Math.max(...rects.map((r) => r.bottom));
        return { top: (top - rootRect.top) / scale, bottom: (bottom - rootRect.top) / scale };
    }

    function paginate(root, paper) {
        const H = W.PAGE[paper].h;
        clear(root);
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
