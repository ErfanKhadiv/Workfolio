/* Workfolio - editable Word (.docx) exporter
 * Builds a real WordprocessingML document in the browser (no library, nothing is
 * uploaded) that follows the layout of the chosen template: header, colored
 * sidebar / banner, headings, bold titles with right-aligned dates, real bullet
 * lists, shaded skill tags and level dots.
 *
 * Word cannot reproduce web fonts, so the template fonts are mapped to the
 * closest fonts every Word install has (Georgia / Calibri).
 */
(function (root) {
    "use strict";

    const NS = {
        w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
        r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
        a: "http://schemas.openxmlformats.org/drawingml/2006/main",
        pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
        pkg: "http://schemas.openxmlformats.org/package/2006/relationships",
    };
    const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    // eslint-disable-next-line no-control-regex
    const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
    const esc = (v) => String(v ?? "").replace(BAD, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const clean = (v) => {
        if (v === undefined || v === null) return "";
        const t = String(v).trim();
        return /^(null|undefined)$/i.test(t) ? "" : t;
    };
    const hex6 = (c, fb = "2563EB") => {
        const s = String(c || "").replace("#", "").toUpperCase();
        return /^[0-9A-F]{6}$/.test(s) ? s : fb;
    };
    function blend(a, b, t) {
        const p = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
        const x = p(a), y = p(b);
        return x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
    }
    const px = (n) => Math.round(n * 15); // CSS px -> twips (1px = 15 twips)

    // ---------------------------------------------------------------------
    function buildDocument(data, W, photo) {
        const s = data.settings || W.defaultSettings();
        const p = data.personal || {};
        const T = String(s.template || "1");
        const fsPx = { compact: 12, normal: 13, spacious: 14 }[s.density] || 13;
        const hp = (em) => Math.round(fsPx * 1.5 * em); // CSS em -> half-points
        const secGap = px({ compact: 13, normal: 20, spacious: 27 }[s.density] || 20);
        const itemGap = px({ compact: 8, normal: 12, spacious: 16 }[s.density] || 12);

        const accent = hex6(s.accent);
        const accentDark = hex6(W.mix(s.accent, 0, 0.35));
        const accentSoft = hex6(W.mix(s.accent, 255, 0.88));
        const onAccent = hex6(W.onColor(s.accent), "FFFFFF");
        const INK = "1F2937", MUTED = "6B7280", TRACK = "D1D5DB";
        const font = s.font === "serif" ? "Georgia" : s.font === "sans" || s.font === "poppins" ? "Calibri" : T === "1" ? "Georgia" : "Calibri";

        const page = s.paper === "letter" ? { w: 12240, h: 15840 } : { w: 11906, h: 16838 };
        const margins = T === "1" ? { t: px(44), b: px(44), l: px(52), r: px(52) } : T === "4" ? { t: px(54), b: px(54), l: px(58), r: px(58) } : { t: 0, b: 0, l: 0, r: 0 };
        const contentWidth = page.w - margins.l - margins.r;

        const rels = [];
        const addLink = (url) => {
            const id = `rIdL${rels.length + 1}`;
            rels.push(`<Relationship Id="${id}" Type="${NS.r}/hyperlink" Target="${esc(url)}" TargetMode="External"/>`);
            return id;
        };

        // ---------- low-level builders ----------
        function run(text, o = {}) {
            const t = String(text ?? "");
            if (!t) return "";
            const pr =
                (o.b ? "<w:b/><w:bCs/>" : "") +
                (o.i ? "<w:i/><w:iCs/>" : "") +
                `<w:color w:val="${o.color || INK}"/>` +
                (o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : "") +
                `<w:sz w:val="${o.size || hp(1)}"/><w:szCs w:val="${o.size || hp(1)}"/>` +
                (o.u ? `<w:u w:val="${o.u}"/>` : "") +
                (o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : "");
            const body = t.split(/\r?\n/).map((part) => `<w:t xml:space="preserve">${esc(part)}</w:t>`).join("<w:br/>");
            return `<w:r><w:rPr>${pr}</w:rPr>${body}</w:r>`;
        }
        const TAB = "<w:r><w:tab/></w:r>";

        function link(runs, url) {
            const href = url ? (url.startsWith("mailto:") ? url : W.safeUrl(url)) : null;
            return href ? `<w:hyperlink r:id="${addLink(href)}" w:history="1">${runs}</w:hyperlink>` : runs;
        }

        function para(content, o = {}) {
            const b = o.border || {};
            const bdr = (side) => (b[side] ? `<w:${side} w:val="single" w:sz="${b[side].sz}" w:space="${b[side].space ?? 1}" w:color="${b[side].color}"/>` : "");
            const pPr =
                (o.keepNext ? "<w:keepNext/>" : "") +
                (o.keepLines ? "<w:keepLines/>" : "") +
                (o.bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : "") +
                (o.border ? `<w:pBdr>${bdr("top")}${bdr("left")}${bdr("bottom")}${bdr("right")}</w:pBdr>` : "") +
                (o.tabRight ? `<w:tabs><w:tab w:val="right" w:pos="${Math.round(o.tabRight)}"/></w:tabs>` : "") +
                `<w:spacing w:before="${Math.round(o.before || 0)}" w:after="${Math.round(o.after || 0)}" w:line="${o.line || 288}" w:lineRule="${o.lineRule || "auto"}"/>` +
                (o.indLeft ? `<w:ind w:left="${Math.round(o.indLeft)}"/>` : "") +
                (o.align ? `<w:jc w:val="${o.align}"/>` : "");
            return `<w:p><w:pPr>${pPr}</w:pPr>${Array.isArray(content) ? content.join("") : content || ""}</w:p>`;
        }

        const SPACER = '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';

        function cellXml(c) {
            const m = c.mar || {};
            const bd = c.borders || {};
            const edge = (side) => (bd[side] ? `<w:${side} w:val="single" w:sz="${bd[side].sz}" w:space="0" w:color="${bd[side].color}"/>` : "");
            const pr =
                `<w:tcW w:w="${c.w}" w:type="dxa"/>` +
                (c.borders ? `<w:tcBorders>${edge("top")}${edge("bottom")}</w:tcBorders>` : "") +
                (c.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${c.fill}"/>` : "") +
                `<w:tcMar><w:top w:w="${m.t || 0}" w:type="dxa"/><w:left w:w="${m.l || 0}" w:type="dxa"/><w:bottom w:w="${m.b || 0}" w:type="dxa"/><w:right w:w="${m.r || 0}" w:type="dxa"/></w:tcMar>` +
                `<w:vAlign w:val="${c.vAlign || "top"}"/>`;
            return `<w:tc><w:tcPr>${pr}</w:tcPr>${c.content || "<w:p/>"}</w:tc>`;
        }

        // rows: [{ height?: {val, rule}, cells: [{w, fill, mar, content, vAlign, borders}] }]
        function table(rows) {
            const widths = rows[0].cells.map((c) => c.w);
            const total = widths.reduce((a, b) => a + b, 0);
            const nil = ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="nil"/>`).join("");
            const tr = rows
                .map((r) => `<w:tr><w:trPr>${r.height ? `<w:trHeight w:val="${Math.round(r.height.val)}" w:hRule="${r.height.rule}"/>` : ""}</w:trPr>${r.cells.map(cellXml).join("")}</w:tr>`)
                .join("");
            return (
                `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${nil}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
                `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
                `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${tr}</w:tbl>`
            );
        }

        function picture(sizePx, shape, outline) {
            if (!photo) return "";
            const emu = Math.round(sizePx * 9525);
            const ln = outline ? `<a:ln w="${Math.round(outline.px * 9525)}"><a:solidFill><a:srgbClr val="${outline.color}"/></a:solidFill></a:ln>` : "";
            return (
                `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${emu}" cy="${emu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
                `<wp:docPr id="1" name="Profile photo" descr="Profile photo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
                `<a:graphic><a:graphicData uri="${NS.pic}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="profile.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
                `<pic:blipFill><a:blip r:embed="rIdPhoto"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
                `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="${shape}"><a:avLst/></a:prstGeom>${ln}</pic:spPr>` +
                `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
            );
        }

        // ---------- contexts (colors + text width of the column being filled) ----------
        const mainCtx = (width) => ({ kind: "main", width, fg: INK, muted: MUTED, bullet: accent, dotOn: accent, dotOff: TRACK, chipBg: accentSoft, chipFg: accentDark });
        const sideCtx = (width) =>
            T === "2"
                ? { kind: "side", width, fg: onAccent, muted: blend(onAccent, accent, 0.25), bullet: onAccent, dotOn: onAccent, dotOff: blend(accent, onAccent, 0.3), chipBg: blend(accent, onAccent, 0.2), chipFg: onAccent }
                : { kind: "side", width, fg: INK, muted: MUTED, bullet: accent, dotOn: accent, dotOff: TRACK, chipBg: accentSoft, chipFg: accentDark };

        // ---------- headings ----------
        function heading(label, ctx, first) {
            const text = label.toUpperCase();
            const before = first ? 0 : secGap;
            const base = { before, after: 110, keepNext: true };
            const r = (color, size = hp(1)) => run(text, { b: true, color, size, spacing: 18 });
            if (T === "1") return para(r(INK, hp(0.98)), { ...base, border: { bottom: { sz: 6, color: "CBD5E1", space: 2 } } });
            if (T === "2") {
                return ctx.kind === "side"
                    ? para(r(onAccent), { ...base, border: { bottom: { sz: 6, color: blend(accent, onAccent, 0.4), space: 3 } } })
                    : para(r(accent), base);
            }
            if (T === "3") return ctx.kind === "side" ? para(r(accent, hp(0.95)), base) : para(r(accent, hp(0.95)), { ...base, border: { bottom: { sz: 12, color: accentSoft, space: 4 } } });
            if (T === "5") return ctx.kind === "side" ? para(r(accent), base) : para(r(INK), { ...base, border: { left: { sz: 24, color: accent, space: 8 } } });
            return para(r(MUTED, hp(0.76)), base);
        }

        // ---------- section content ----------
        const bulletsOf = (text, ctx) =>
            W.bullets(clean(text)).map((line) => para(run(line, { color: ctx.fg }), { bullet: true, after: 30, keepLines: true }));

        function titleRow(titleRuns, period, ctx, before, keep = true) {
            return para([titleRuns, period ? TAB + run(period, { color: ctx.muted, size: hp(0.92) }) : ""], { tabRight: ctx.width, before, after: 0, keepNext: keep });
        }

        function chips(names, ctx) {
            const runs = names.map((n) => run(`\u00a0${n}\u00a0`, { color: ctx.chipFg, shd: ctx.chipBg, size: hp(0.92) }) + run("  ", { size: hp(0.92) }));
            return para(runs, { line: 380, after: 0 });
        }

        function levelRow(name, rate, total, mark, ctx, last) {
            const dots = run(mark.repeat(rate), { color: ctx.dotOn, size: hp(0.85) }) + run(mark.repeat(total - rate), { color: ctx.dotOff, size: hp(0.85) });
            return para([run(name, { color: ctx.fg }), TAB, dots], { tabRight: ctx.width, after: last ? 0 : 90, keepNext: !last });
        }

        const sectionBodies = {
            summary(ctx) {
                const text = clean(p.about);
                return text ? [para(run(text, { color: ctx.fg }), { line: 360 })] : [];
            },
            experience(ctx) {
                const out = [];
                (data.jobs || []).filter((j) => clean(j.title) || clean(j.company)).forEach((j, i) => {
                    const before = i ? itemGap : 0;
                    out.push(titleRow(run(clean(j.title) || clean(j.company), { b: true, size: hp(1.04), color: ctx.fg }), W.formatPeriod(j.from, j.to), ctx, before));
                    const sub = [clean(j.title) ? clean(j.company) : "", clean(j.location)].filter(Boolean).join(" \u00b7 ");
                    const bl = bulletsOf(j.description, ctx);
                    if (sub) out.push(para(run(sub, { color: ctx.muted }), { keepNext: bl.length > 0 }));
                    out.push(...bl);
                });
                return out;
            },
            projects(ctx) {
                const out = [];
                (data.projects || []).filter((x) => clean(x.name)).forEach((x, i) => {
                    const name = run(clean(x.name), { b: true, size: hp(1.04), color: ctx.fg, u: clean(x.link) && W.safeUrl(x.link) ? "dotted" : undefined });
                    out.push(titleRow(link(name, clean(x.link)), "", ctx, i ? itemGap : 0));
                    const bl = bulletsOf(x.description, ctx);
                    if (clean(x.tech)) out.push(para(run(clean(x.tech), { color: ctx.muted }), { keepNext: bl.length > 0 }));
                    out.push(...bl);
                });
                return out;
            },
            education(ctx) {
                const out = [];
                (data.education || []).filter((e) => clean(e.university) || clean(e.major)).forEach((e, i) => {
                    const deg = W.degreeLabel(e.degree);
                    const major = clean(e.major);
                    const title = major ? (deg ? `${deg} in ${major}` : major) : deg;
                    out.push(titleRow(run(title || clean(e.university), { b: true, size: hp(1.04), color: ctx.fg }), W.formatPeriod(e.from, e.to), ctx, i ? itemGap : 0));
                    const bl = bulletsOf(e.details, ctx);
                    const hasMore = clean(e.gpa) || bl.length;
                    if (clean(e.university) && title) out.push(para(run(clean(e.university), { color: ctx.muted }), { keepNext: Boolean(hasMore) }));
                    if (clean(e.gpa)) out.push(para(run(`GPA: ${clean(e.gpa)}`, { color: ctx.muted, size: hp(0.94) }), { keepNext: bl.length > 0 }));
                    out.push(...bl);
                });
                return out;
            },
            skills(ctx) {
                const rows = (data.skills || []).filter((x) => clean(x.name));
                if (!rows.length) return [];
                if (s.skillStyle === "tags") return [chips(rows.map((x) => clean(x.name)), ctx)];
                const mark = s.skillStyle === "stars" ? "\u2605" : "\u25cf";
                return rows.map((x, i) => levelRow(clean(x.name), Math.min(5, Math.max(1, Number(x.rate) || 3)), 5, mark, ctx, i === rows.length - 1));
            },
            languages(ctx) {
                const rows = (data.languages || []).filter((x) => clean(x.name));
                const out = [];
                rows.forEach((x, i) => {
                    const level = W.levelLabel(clean(x.level));
                    const note = clean(x.note);
                    const last = i === rows.length - 1;
                    if (s.skillStyle === "tags") {
                        out.push(para(run(clean(x.name), { color: ctx.fg }), { after: 0, keepNext: true }));
                        const extra = [level, note].filter(Boolean).join(" \u00b7 ");
                        if (extra) out.push(para(run(extra, { color: ctx.muted, size: hp(0.86) }), { after: last ? 0 : 90 }));
                        return;
                    }
                    const mark = s.skillStyle === "stars" ? "\u2605" : "\u25cf";
                    const hasNote = Boolean(note);
                    out.push(
                        para([run(clean(x.name), { color: ctx.fg }), TAB, run(mark.repeat(W.LEVEL_RATE[clean(x.level)] || 2), { color: ctx.dotOn, size: hp(0.85) }) + run(mark.repeat(5 - (W.LEVEL_RATE[clean(x.level)] || 2)), { color: ctx.dotOff, size: hp(0.85) })], { tabRight: ctx.width, after: hasNote ? 0 : last ? 0 : 90, keepNext: hasNote || !last })
                    );
                    if (hasNote) out.push(para(run(note, { color: ctx.muted, size: hp(0.86) }), { after: last ? 0 : 90 }));
                });
                return out;
            },
            certs(ctx) {
                const out = [];
                (data.certs || []).filter((c) => clean(c.name)).forEach((c, i) => {
                    out.push(titleRow(run(clean(c.name), { b: true, size: hp(1.04), color: ctx.fg }), W.formatMonth(c.date), ctx, i ? itemGap : 0, Boolean(clean(c.issuer))));
                    if (clean(c.issuer)) out.push(para(run(clean(c.issuer), { color: ctx.muted })));
                });
                return out;
            },
            interests(ctx) {
                const items = W.list(clean(p.interests));
                return items.length ? [chips(items, ctx)] : [];
            },
        };

        const labelOf = (id) => (W.SECTIONS.find((x) => x.id === id) || { label: id }).label;
        const isSide = (id) => Boolean((W.SECTIONS.find((x) => x.id === id) || {}).side);
        const visibleIds = () => (Array.isArray(s.order) ? s.order : W.SECTIONS.map((x) => x.id)).filter((id) => sectionBodies[id] && !(s.hidden || []).includes(id));

        function sectionsXml(ids, ctx) {
            let first = true;
            return ids
                .map((id) => {
                    const body = sectionBodies[id](ctx);
                    if (!body.length) return "";
                    const xml = heading(labelOf(id), ctx, first) + body.join("");
                    first = false;
                    return xml;
                })
                .join("");
        }

        // ---------- header / contact ----------
        const contactItems = () =>
            [
                { text: clean(p.email), href: clean(p.email) ? `mailto:${clean(p.email)}` : "" },
                { text: clean(p.phone) },
                { text: clean(p.address) },
                { text: W.displayUrl(clean(p.website)), href: clean(p.website) },
                { text: W.displayUrl(clean(p.linkedin)), href: clean(p.linkedin) },
                { text: W.displayUrl(clean(p.github)), href: clean(p.github) },
            ].filter((c) => c.text);

        const inlineContact = (color, align) => {
            const items = contactItems();
            if (!items.length) return "";
            const runs = items.map((c, i) => (i ? run("   \u00b7   ", { color, size: hp(0.94) }) : "") + link(run(c.text, { color, size: hp(0.94) }), c.href)).join("");
            return para(runs, { align, after: 0, line: 340 });
        };

        function contactSection(ctx) {
            const items = contactItems();
            if (!items.length) return "";
            const head = heading("Contact", ctx, true);
            return head + items.map((c, i) => para(link(run(c.text, { color: ctx.fg, size: hp(0.95) }), c.href), { after: i === items.length - 1 ? 0 : 90 })).join("");
        }

        const showAge = s.showAge && clean(p.age);
        const nameRuns = (color, size, firstWeight) => {
            const first = clean(p.firstName), last = clean(p.lastName);
            return run(first, { b: firstWeight, color, size }) + (first && last ? run(" ", { size }) : "") + run(last, { b: true, color, size });
        };
        const fullName = W.fullName(p) || "Resume";

        // =====================================================================
        //  layouts
        // =====================================================================
        const body = [];
        const ids = visibleIds();

        if (T === "1") {
            const ctx = mainCtx(contentWidth);
            if (photo) body.push(para(picture(92, "ellipse"), { align: "center", after: 150 }));
            body.push(para(nameRuns(INK, hp(2.3), true), { align: "center", after: 20, line: 276 }));
            if (clean(p.title)) body.push(para(run(clean(p.title), { color: accent, size: hp(1.2) }), { align: "center", after: 40 }));
            if (showAge) body.push(para(run(`${clean(p.age)} years old`, { color: MUTED, size: hp(0.92) }), { align: "center" }));
            const contact = inlineContact(MUTED, "center");
            body.push(contact);
            body.push(para("", { after: 0, line: 20, lineRule: "exact", border: { bottom: { sz: 12, color: accent, space: 6 } } }));
            body.push(para("", { after: secGap - 20, line: 20, lineRule: "exact" }));
            body.push(sectionsXml(ids, ctx));
        } else if (T === "4") {
            const photoCellW = photo ? px(84) + px(20) : 0;
            const leftW = contentWidth - photoCellW;
            const head = [
                para(nameRuns(INK, hp(2.6), false), { after: 60, line: 276 }),
                clean(p.title) ? para(run(clean(p.title).toUpperCase(), { b: true, color: accent, size: hp(0.86), spacing: 30 }), { after: 100 }) : "",
                showAge ? para(run(`${clean(p.age)} years old`, { color: MUTED, size: hp(0.92) }), { after: 60 }) : "",
                inlineContact(MUTED, "left"),
            ].join("");
            if (photo) {
                body.push(table([{ cells: [{ w: leftW, content: head, vAlign: "center" }, { w: photoCellW, content: para(picture(84, "roundRect"), { align: "right" }), vAlign: "center" }] }]));
                body.push(SPACER);
            } else body.push(head);
            body.push(para("", { after: px(10), line: 20, lineRule: "exact" }));
            const labelW = Math.round((contentWidth * 1.65) / (1.65 + 8.2));
            const bodyW = contentWidth - labelW;
            const ctx = mainCtx(bodyW - px(10));
            const rows = ids
                .map((id) => {
                    const content = sectionBodies[id](ctx);
                    if (!content.length) return null;
                    return {
                        cells: [
                            { w: labelW, borders: { top: { sz: 4, color: "E5E7EB" } }, mar: { t: secGap, b: secGap, r: px(20) }, content: para(run(labelOf(id).toUpperCase(), { b: true, color: MUTED, size: hp(0.76), spacing: 30 }), { after: 0 }) },
                            { w: bodyW, borders: { top: { sz: 4, color: "E5E7EB" } }, mar: { t: secGap, b: secGap, l: px(10) }, content: content.join("") },
                        ],
                    };
                })
                .filter(Boolean);
            if (rows.length) body.push(table(rows));
            body.push(SPACER);
        } else if (T === "2") {
            const sideW = px(250);
            const mainW = page.w - sideW;
            const sMar = { t: px(34), b: px(34), l: px(22), r: px(22) };
            const mMar = { t: px(40), b: px(36), l: px(38), r: px(38) };
            const sCtx = sideCtx(sideW - sMar.l - sMar.r);
            const mCtx = mainCtx(mainW - mMar.l - mMar.r);
            const sideSections = ids.filter(isSide);
            const sideXml = (photo ? para(picture(140, "ellipse", { px: 4, color: blend(accent, "FFFFFF", 0.55) }), { align: "center", after: px(24) }) : "") + contactSection(sCtx) + sideSectionsXml(sideSections, sCtx, contactItems().length > 0);
            const mainHead =
                para(nameRuns(INK, hp(2.5), false), { after: 80, line: 276 }) +
                (clean(p.title) ? para(run(clean(p.title).toUpperCase(), { b: true, color: accent, size: hp(1.0), spacing: 36 }), { after: showAge ? 40 : 0 }) : "") +
                (showAge ? para(run(`${clean(p.age)} years old`, { color: MUTED, size: hp(0.92) }), {}) : "") +
                para("", { after: secGap, line: 20, lineRule: "exact" });
            body.push(table([{ height: { val: page.h - 100, rule: "atLeast" }, cells: [{ w: sideW, fill: accent, mar: sMar, content: sideXml }, { w: mainW, mar: mMar, content: mainHead + sectionsXml(ids.filter((id) => !isSide(id)), mCtx) }] }]));
            body.push(SPACER);
        } else if (T === "3") {
            const bannerH = px(180);
            const bannerFill = blend(accent, "000000", 0.12);
            const bMarL = px(42);
            const photoW = photo ? bMarL + px(118) + px(26) : 0;
            const nameW = page.w - photoW;
            const bText = hex6(W.onColor(bannerFill), onAccent);
            const nameBlock =
                para(nameRuns(bText, fullName.length > 24 ? hp(1.9) : hp(2.4), true), { after: 40, line: 276 }) +
                (clean(p.title) ? para(run(clean(p.title), { color: bText, size: hp(1.2) }), { after: showAge ? 30 : 0 }) : "") +
                (showAge ? para(run(`${clean(p.age)} years old`, { color: bText, size: hp(0.92) }), {}) : "");
            const bannerCells = [];
            if (photo) bannerCells.push({ w: photoW, fill: bannerFill, vAlign: "center", mar: { l: bMarL, r: px(26) }, content: para(picture(118, "ellipse", { px: 4, color: "FFFFFF" }), {}) });
            bannerCells.push({ w: nameW, fill: bannerFill, vAlign: "center", mar: { l: photo ? 0 : bMarL, r: px(42) }, content: nameBlock });
            body.push(table([{ height: { val: bannerH, rule: "exact" }, cells: bannerCells }]));
            body.push(SPACER);
            const sideW = px(238);
            const mainW = page.w - sideW;
            const sMar = { t: px(28), b: px(28), l: px(22), r: px(22) };
            const mMar = { t: px(28), b: px(34), l: px(32), r: px(36) };
            const sCtx = sideCtx(sideW - sMar.l - sMar.r);
            const mCtx = mainCtx(mainW - mMar.l - mMar.r);
            const sideSections = ids.filter(isSide);
            const sideXml = contactSection(sCtx) + sideSectionsXml(sideSections, sCtx, contactItems().length > 0);
            body.push(table([{ height: { val: page.h - bannerH - 40 - 40 - 60, rule: "atLeast" }, cells: [{ w: sideW, fill: "F3F4F6", mar: sMar, content: sideXml }, { w: mainW, mar: mMar, content: sectionsXml(ids.filter((id) => !isSide(id)), mCtx) }] }]));
            body.push(SPACER);
        } else {
            // 5 - Executive: dark header band, content left, light column right
            const headH = photo ? px(172) : px(140);
            const photoW = photo ? px(104) + px(70) : 0;
            const nameW = page.w - photoW;
            const nameBlock =
                para(nameRuns("FFFFFF", fullName.length > 24 ? hp(1.9) : hp(2.35), false), { after: 60, line: 276 }) +
                (clean(p.title) ? para(run(clean(p.title), { color: "CBD5E1", size: hp(1.15), spacing: 12 }), { after: showAge ? 30 : 0 }) : "") +
                (showAge ? para(run(`${clean(p.age)} years old`, { color: "94A3B8", size: hp(0.92) }), {}) : "");
            const bottom = { bottom: { sz: 30, color: accent } };
            const cells = [{ w: nameW, fill: "0F172A", vAlign: "center", borders: bottom, mar: { l: px(40), r: px(20) }, content: nameBlock }];
            if (photo) cells.push({ w: photoW, fill: "0F172A", vAlign: "center", borders: bottom, mar: { r: px(40) }, content: para(picture(104, "roundRect", { px: 3, color: "475569" }), { align: "right" }) });
            body.push(table([{ height: { val: headH, rule: "exact" }, cells }]));
            body.push(SPACER);
            const sideW = px(244);
            const mainW = page.w - sideW;
            const mMar = { t: px(28), b: px(34), l: px(40), r: px(30) };
            const sMar = { t: px(28), b: px(28), l: px(24), r: px(24) };
            const mCtx = mainCtx(mainW - mMar.l - mMar.r);
            const sCtx = sideCtx(sideW - sMar.l - sMar.r);
            const sideSections = ids.filter(isSide);
            const sideXml = contactSection(sCtx) + sideSectionsXml(sideSections, sCtx, contactItems().length > 0);
            body.push(table([{ height: { val: page.h - headH - 40 - 40 - 60, rule: "atLeast" }, cells: [{ w: mainW, mar: mMar, content: sectionsXml(ids.filter((id) => !isSide(id)), mCtx) }, { w: sideW, fill: "F1F5F9", mar: sMar, content: sideXml }] }]));
            body.push(SPACER);
        }

        // side column: sections after the contact block need a gap, so they are never "first"
        function sideSectionsXml(sideIds, ctx, afterContact) {
            let first = !afterContact;
            return sideIds
                .map((id) => {
                    const content = sectionBodies[id](ctx);
                    if (!content.length) return "";
                    const xml = heading(labelOf(id), ctx, first) + content.join("");
                    first = false;
                    return xml;
                })
                .join("");
        }

        const sect = `<w:sectPr><w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${margins.t}" w:right="${margins.r}" w:bottom="${margins.b}" w:left="${margins.l}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
        const documentXml = `${XML}<w:document xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}"><w:body>${body.join("")}${sect}</w:body></w:document>`;

        return { documentXml, rels, font, size: hp(1), accent, name: fullName };
    }

    // ---------------------------------------------------------------------
    // profile photo -> square PNG bytes (circle / rounded corners are applied by Word)
    async function photoToPng(dataUrl) {
        const img = new Image();
        img.decoding = "async";
        img.src = dataUrl;
        // never let a stuck image hang the export button
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("Loading the profile photo timed out")), root.WorkfolioWordExport.photoTimeoutMs));
        const loaded = typeof img.decode === "function" ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("Could not load the profile photo")); });
        await Promise.race([loaded, timeout]);
        const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
        const out = Math.min(400, side);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = out;
        const ctx = canvas.getContext("2d");
        const sx = ((img.naturalWidth || img.width) - side) / 2;
        const sy = ((img.naturalHeight || img.height) - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
        const b64 = canvas.toDataURL("image/png").split(",")[1];
        const raw = atob(b64);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    function packageDocx(W, doc, photo) {
        const styles = `${XML}<w:styles xmlns:w="${NS.w}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${doc.font}" w:hAnsi="${doc.font}" w:cs="${doc.font}" w:eastAsia="${doc.font}"/><w:sz w:val="${doc.size}"/><w:szCs w:val="${doc.size}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="288" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`;
        const numbering = `${XML}<w:numbering xmlns:w="${NS.w}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="\u2022"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="270" w:hanging="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:color w:val="${doc.accent}"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
        const settings = `${XML}<w:settings xmlns:w="${NS.w}"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
        const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(doc.name)} - Resume</dc:title><dc:creator>${esc(doc.name)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`;

        const docRels = [
            `<Relationship Id="rIdStyles" Type="${NS.r}/styles" Target="styles.xml"/>`,
            `<Relationship Id="rIdNumbering" Type="${NS.r}/numbering" Target="numbering.xml"/>`,
            `<Relationship Id="rIdSettings" Type="${NS.r}/settings" Target="settings.xml"/>`,
            ...(photo ? [`<Relationship Id="rIdPhoto" Type="${NS.r}/image" Target="media/profile.png"/>`] : []),
            ...doc.rels,
        ].join("");

        const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${photo ? '<Default Extension="png" ContentType="image/png"/>' : ""}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;

        const files = [
            { name: "[Content_Types].xml", data: types },
            { name: "_rels/.rels", data: `${XML}<Relationships xmlns="${NS.pkg}"><Relationship Id="rId1" Type="${NS.r}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
            { name: "word/document.xml", data: doc.documentXml },
            { name: "word/_rels/document.xml.rels", data: `${XML}<Relationships xmlns="${NS.pkg}">${docRels}</Relationships>` },
            { name: "word/styles.xml", data: styles },
            { name: "word/numbering.xml", data: numbering },
            { name: "word/settings.xml", data: settings },
            { name: "docProps/core.xml", data: core },
        ];
        if (photo) files.push({ name: "word/media/profile.png", data: photo });
        return W.zip(files, MIME);
    }

    root.WorkfolioWordExport = {
        photoTimeoutMs: 5000,
        /** data = resume data (core.js shape); returns a Blob (.docx) */
        async buildBlob(data, WOverride) {
            const W = WOverride || root.Workfolio;
            let photo = null;
            if (data.settings && data.settings.showPhoto && data.personal && data.personal.photo) {
                try {
                    photo = await photoToPng(data.personal.photo);
                } catch (error) {
                    console.warn("Workfolio: the profile photo was left out of the Word file", error);
                }
            }
            return packageDocx(W, buildDocument(data, W, photo), photo);
        },
        _buildWithPhoto(data, W, photoBytes) { // for tests
            return packageDocx(W, buildDocument(data, W, photoBytes), photoBytes);
        },
    };
})(window);
