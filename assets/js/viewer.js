/* Workfolio - resume viewer / design panel (resume.html)
 * Renders the saved resume, lets the user restyle it live and exports it.
 */
(() => {
    "use strict";
    const W = window.Workfolio;

    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const preview = params.get("preview") === "1";
    if (preview) document.body.classList.add("preview");

    // ---------- load data (fall back to sample so the page is never empty) ----------
    let data = W.load();
    const usingSample = !W.hasContent(data);
    if (usingSample) data = W.sample();
    if (W.TEMPLATES.some((t) => t.id === params.get("t"))) data.settings.template = params.get("t");
    const settings = data.settings;
    $("sampleBanner").hidden = !usingSample || preview;

    const resume = $("resume");

    function persist() {
        if (!preview && !usingSample) W.save(data);
    }

    // ---------- render + fit ----------
    function fit() {
        if (preview) return;
        const page = W.PAGE[settings.paper];
        const available = $("stage").clientWidth - 40;
        const scale = Math.min(1, available / page.w);
        $("scaler").style.transform = `scale(${scale})`;
        $("fit").style.width = `${page.w * scale}px`;
        $("fit").style.height = `${resume.offsetHeight * scale}px`;
    }

    // keep entries and headings whole across pages (see paginate.js); the embedded preview shows page 1 only
    function layoutPages() {
        if (preview) return;
        W.paginate(resume, settings.paper, { numbers: settings.showPageNumbers });
    }

    function relayout() {
        layoutPages();
        fit();
        updatePageInfo();
    }

    function updatePageInfo() {
        const page = W.PAGE[settings.paper];
        const pages = Number(resume.dataset.pages) || Math.max(1, Math.ceil((resume.offsetHeight - 4) / page.h));
        const info = $("pageInfo");
        info.classList.toggle("warn", pages > 1);
        info.textContent = pages === 1
            ? "Fits on 1 page \u2713"
            : `${pages} pages. Tip: choose Compact spacing or hide a section to fit on one page.`;
    }

    function refresh() {
        W.render(data, resume);
        $("pageStyle").textContent = `@page { size: ${settings.paper === "a4" ? "A4" : "letter"}; margin: 0; }`;
        document.title = `${W.fullName(data.personal) || "Your Resume"} - Resume | Workfolio`;
        relayout();
        persist();
    }

    // ---------- panel: template ----------
    function buildTemplates() {
        const box = $("templateButtons");
        box.replaceChildren();
        W.TEMPLATES.forEach((t) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tplBtn" + (t.id === settings.template ? " active" : "");
            b.innerHTML = "<strong></strong><small></small>";
            b.firstChild.textContent = `${t.id}. ${t.name}`;
            b.lastChild.textContent = t.tag;
            b.addEventListener("click", () => {
                settings.template = t.id;
                buildTemplates();
                refresh();
            });
            box.append(b);
        });
    }

    // ---------- panel: colors ----------
    function buildSwatches() {
        const box = $("swatches");
        box.replaceChildren();
        W.ACCENTS.forEach((c) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "swatch" + (c === settings.accent ? " active" : "");
            b.style.background = c;
            b.setAttribute("aria-label", `Accent ${c}`);
            b.addEventListener("click", () => setAccent(c));
            box.append(b);
        });
        $("accentInput").value = settings.accent;
    }

    function setAccent(color) {
        settings.accent = color.toLowerCase();
        buildSwatches();
        refresh();
    }
    $("accentInput").addEventListener("input", (e) => setAccent(e.target.value));

    // ---------- panel: selects & checkboxes ----------
    function bindSelect(id, options, key) {
        const select = $(id);
        Object.entries(options).forEach(([value, label]) => select.add(new Option(label, value)));
        select.value = settings[key];
        select.addEventListener("change", () => {
            settings[key] = select.value;
            refresh();
        });
    }
    bindSelect("fontSelect", W.FONTS, "font");
    bindSelect("skillStyleSelect", W.SKILL_STYLES, "skillStyle");
    bindSelect("densitySelect", W.DENSITIES, "density");
    bindSelect("paperSelect", W.PAPERS, "paper");

    ["showPhoto", "showAge", "showPageNumbers"].forEach((key) => {
        $(key).checked = settings[key];
        $(key).addEventListener("change", (e) => {
            settings[key] = e.target.checked;
            refresh();
        });
    });
    if (!data.personal.photo) $("showPhoto").parentElement.hidden = true;

    // ---------- panel: sections ----------
    function buildSections() {
        const ul = $("sectionList");
        ul.replaceChildren();
        settings.order.forEach((id, index) => {
            const meta = W.SECTIONS.find((s) => s.id === id);
            const li = document.createElement("li");
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = !settings.hidden.includes(id);
            box.addEventListener("change", () => {
                settings.hidden = box.checked ? settings.hidden.filter((h) => h !== id) : [...settings.hidden, id];
                refresh();
            });
            label.append(box, document.createTextNode(meta.label));

            const move = (dir) => {
                const j = index + dir;
                [settings.order[index], settings.order[j]] = [settings.order[j], settings.order[index]];
                buildSections();
                refresh();
            };
            const up = document.createElement("button");
            up.type = "button";
            up.textContent = "\u2191";
            up.setAttribute("aria-label", `Move ${meta.label} up`);
            up.disabled = index === 0;
            up.addEventListener("click", () => move(-1));
            const down = document.createElement("button");
            down.type = "button";
            down.textContent = "\u2193";
            down.setAttribute("aria-label", `Move ${meta.label} down`);
            down.disabled = index === settings.order.length - 1;
            down.addEventListener("click", () => move(1));

            li.append(label, up, down);
            ul.append(li);
        });
    }

    // ---------- reset ----------
    $("resetDesign").addEventListener("click", () => {
        Object.assign(settings, W.defaultSettings(), { template: settings.template });
        ["fontSelect", "skillStyleSelect", "densitySelect", "paperSelect"].forEach((id) => {
            const key = { fontSelect: "font", skillStyleSelect: "skillStyle", densitySelect: "density", paperSelect: "paper" }[id];
            $(id).value = settings[key];
        });
        $("showPhoto").checked = settings.showPhoto;
        $("showAge").checked = settings.showAge;
        $("showPageNumbers").checked = settings.showPageNumbers;
        buildTemplates();
        buildSwatches();
        buildSections();
        refresh();
    });

    // ---------- exports ----------
    // The browser's own "Save as PDF" keeps text as real vector text (sharp at any zoom,
    // selectable, readable by ATS) and honours the page breaks laid out by paginate.js.
    // The document title becomes the suggested file name.
    function downloadPdf() {
        const previousTitle = document.title;
        const restore = () => {
            document.title = previousTitle;
            window.removeEventListener("afterprint", restore);
        };
        window.addEventListener("afterprint", restore);
        document.title = W.fileBase(data);
        window.print();
    }

    $("pdfBtn").addEventListener("click", downloadPdf);
    $("printBtn").addEventListener("click", () => window.print());
    $("txtBtn").addEventListener("click", () => W.download(`${W.fileBase(data)}.txt`, W.toText(data), "text/plain;charset=utf-8"));
    $("jsonBtn").addEventListener("click", () => W.download(`${W.fileBase(data)}.json`, JSON.stringify(data, null, 2), "application/json"));

    // ---------- init ----------
    window.addEventListener("resize", fit);
    if (window.ResizeObserver) new ResizeObserver(() => { fit(); updatePageInfo(); }).observe(resume);
    if (document.fonts?.ready) document.fonts.ready.then(relayout); // web fonts / icons change text heights

    buildTemplates();
    buildSwatches();
    buildSections();
    refresh();
})();
