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
        const docked = $("mobilePreviewViewport").contains($("fit"));
        const host = docked ? $("mobilePreviewViewport") : $("stage");
        const available = Math.max(220, host.clientWidth - (docked ? 12 : 40));
        const scale = Math.min(1, available / page.w);
        $("scaler").style.transform = `scale(${scale})`;
        $("fit").style.width = `${page.w * scale}px`;
        $("fit").style.height = `${resume.offsetHeight * scale}px`;
    }

    // On narrow screens, keep a compact live preview beside the design controls.
    // Moving the existing preview (instead of making a second copy) keeps it in sync.
    const mobileQuery = window.matchMedia("(max-width: 900px)");
    function syncMobilePreviewHost() {
        if (preview) return;
        const dock = $("mobilePreviewDock");
        const viewport = $("mobilePreviewViewport");
        const fitBox = $("fit");
        const mobile = mobileQuery.matches;
        dock.hidden = !mobile;
        if (mobile) {
            document.body.classList.add("mobile-dock-active");
            if (fitBox.parentElement !== viewport) viewport.append(fitBox);
        } else {
            document.body.classList.remove("mobile-dock-active", "preview-expanded");
            dock.classList.remove("preview-expanded");
            $("toggleMobilePreview").textContent = "Expand preview";
            $("toggleMobilePreview").setAttribute("aria-expanded", "false");
            if (fitBox.parentElement !== $("stage")) {
                const banner = $("sampleBanner");
                $("stage").insertBefore(fitBox, banner.nextSibling);
            }
        }
    }

    function toggleExpandedPreview(force) {
        if (preview || !mobileQuery.matches) return;
        const expanded = typeof force === "boolean" ? force : !document.body.classList.contains("preview-expanded");
        document.body.classList.toggle("preview-expanded", expanded);
        $("mobilePreviewDock").classList.toggle("preview-expanded", expanded);
        $("toggleMobilePreview").textContent = expanded ? "Close preview" : "Expand preview";
        $("toggleMobilePreview").setAttribute("aria-expanded", String(expanded));
        relayout();
    }

    $("toggleMobilePreview").addEventListener("click", () => toggleExpandedPreview());
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && document.body.classList.contains("preview-expanded")) toggleExpandedPreview(false);
    });

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
    // Print a clean document containing only the resume. Printing the live editor page
    // can work at a mobile-emulated viewport but become blank on desktop because its
    // preview/scaler layout is interactive and changes parents at different widths.
    // A dedicated print window avoids relying on the editor's responsive state.
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function printResume() {
        if (preview) return;
        // Open synchronously from the click event so popup blockers allow it.
        const printWindow = window.open("about:blank", "_blank");
        if (!printWindow) {
            alert("Chrome blocked the print window. Allow pop-ups for this site and try again.");
            return;
        }

        // Refresh pagination and fit values before taking the clone. The printed copy
        // is not inside #fit/#scaler and therefore cannot inherit screen-only transforms.
        relayout();
        const clone = resume.cloneNode(true);
        clone.querySelectorAll(".pg-guide").forEach((node) => node.remove());
        clone.style.margin = "0";
        clone.style.transform = "none";
        clone.style.boxShadow = "none";

        const stylesheetLinks = [...document.querySelectorAll('link[rel="stylesheet"]')]
            .filter((link) => link.href)
            .map((link) => `<link rel="stylesheet" href="${escapeHtml(link.href)}">`)
            .join("\n");
        const page = settings.paper === "letter" ? "Letter" : "A4";
        const title = escapeHtml(W.fileBase(data));
        const pageStyle = $("pageStyle").textContent || "";

        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${stylesheetLinks}
<style>
${pageStyle}
@page { size: ${page}; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; width: auto !important; min-height: 0 !important; background: #fff !important; overflow: visible !important; }
body { display: block !important; }
#resume.resume { margin: 0 !important; box-shadow: none !important; transform: none !important; max-width: none !important; break-after: auto; }
.pg-guide { display: none !important; }
.pg-spacer { display: block !important; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  #resume.resume { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
</style>
</head>
<body>
${clone.outerHTML}
<script>
(function () {
  var started = false;
  async function startPrint() {
    if (started) return;
    started = true;
    try {
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, new Promise(function (resolve) { setTimeout(resolve, 1800); })]);
      }
      var images = Array.from(document.images);
      await Promise.race([
        Promise.all(images.map(function (img) {
          if (img.complete) return Promise.resolve();
          return new Promise(function (resolve) {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        })),
        new Promise(function (resolve) { setTimeout(resolve, 1800); })
      ]);
    } catch (_) {}
    setTimeout(function () {
      window.focus();
      window.print();
    }, 250);
  }
  window.addEventListener('load', startPrint, { once: true });
  window.addEventListener('afterprint', function () {
    setTimeout(function () { window.close(); }, 400);
  });
  // Covers browsers that complete the new about:blank document before load listeners fire.
  setTimeout(startPrint, 1500);
})();
</script>
</body>
</html>`);
        printWindow.document.close();
    }

    $("pdfBtn").addEventListener("click", printResume);
    $("printBtn").addEventListener("click", printResume);

    $("txtBtn").addEventListener("click", () => W.download(`${W.fileBase(data)}.txt`, W.toText(data), "text/plain;charset=utf-8"));
    $("jsonBtn").addEventListener("click", () => W.download(`${W.fileBase(data)}.json`, JSON.stringify(data, null, 2), "application/json"));

    function saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    // shared by the Word and Excel buttons: busy state, validation, download, friendly error
    async function exportOffice(buttonId, exporter, extension, busyLabel, hint) {
        if (!exporter || typeof exporter.buildBlob !== "function") {
            alert("This export could not initialize. Reload the page and try again.");
            return;
        }
        const button = $(buttonId);
        const originalLabel = button.innerHTML;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> ${busyLabel}`;
        try {
            const blob = await exporter.buildBlob(data, W);
            if (!(blob instanceof Blob) || blob.size < 300) throw new Error("The generated file is empty or invalid.");
            saveBlob(blob, `${W.fileBase(data)}.${extension}`);
        } catch (error) {
            console.error(`${extension} export failed`, error);
            alert(`The ${extension.toUpperCase()} export failed. ${hint}`);
        } finally {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.innerHTML = originalLabel;
        }
    }

    const downloadWord = () => exportOffice("docxBtn", window.WorkfolioWordExport, "docx", "Creating Word file…", "Please try again. If the problem continues, remove the profile photo and retry.");
    const downloadExcel = () => exportOffice("xlsxBtn", window.WorkfolioExcelExport, "xlsx", "Creating Excel file…", "Please try again.");

    $("docxBtn").addEventListener("click", downloadWord);
    $("xlsxBtn").addEventListener("click", downloadExcel);

    // ---------- init ----------
    window.addEventListener("resize", () => { syncMobilePreviewHost(); relayout(); });
    mobileQuery.addEventListener?.("change", () => { syncMobilePreviewHost(); relayout(); });
    if (window.ResizeObserver) new ResizeObserver(() => { fit(); updatePageInfo(); }).observe(resume);
    if (document.fonts?.ready) document.fonts.ready.then(relayout); // web fonts / icons change text heights

    syncMobilePreviewHost();
    buildTemplates();
    buildSwatches();
    buildSections();
    refresh();
})();
