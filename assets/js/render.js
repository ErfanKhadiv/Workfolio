/* Workfolio - resume renderer
 * Workfolio.render(data, rootElement) builds the resume DOM. Templates only
 * differ in CSS (assets/css/resume.css, selected through the .tpl-N class).
 * All user text goes in through textContent, never innerHTML.
 */
(function (W) {
    "use strict";

    const FONT_STACKS = {
        sans: "'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
        serif: "'Lora', Georgia, 'Times New Roman', serif",
        poppins: "'Poppins', 'Segoe UI', Arial, sans-serif",
    };

    function displayText(value) {
        if (value === undefined || value === null) return "";
        const text = String(value);
        return /^(null|undefined)$/i.test(text.trim()) ? "" : text;
    }

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        const safeText = displayText(text);
        if (safeText !== "") n.textContent = safeText;
        return n;
    }

    function icon(cls) {
        const i = el("i", cls);
        i.setAttribute("aria-hidden", "true");
        return i;
    }

    function link(text, url) {
        const href = W.safeUrl(url);
        if (!href) return el("span", "", text);
        const a = el("a", "", text);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
    }

    function bulletList(text) {
        const lines = W.bullets(text);
        if (!lines.length) return null;
        const ul = el("ul", "bullets");
        lines.forEach((l) => ul.append(el("li", "", l)));
        return ul;
    }

    function head(title, right) {
        const row = el("div", "item-head");
        row.append(title);
        if (right) row.append(el("span", "item-period", right));
        return row;
    }

    // ---------- level indicators ----------
    function levelVisual(rate, total, style) {
        if (style === "bars") {
            const bar = el("span", "lvl bar");
            const fill = document.createElement("i");
            fill.style.width = `${Math.round((rate / total) * 100)}%`;
            bar.append(fill);
            return bar;
        }
        if (style === "stars") {
            const wrap = el("span", "lvl stars");
            for (let i = 0; i < total; i++) wrap.append(icon("fa-solid fa-star" + (i < rate ? " on" : "")));
            return wrap;
        }
        return null;
    }

    // ---------- sections ----------
    const builders = {
        summary(d) {
            return d.personal.about ? [el("p", "summary", d.personal.about)] : null;
        },

        experience(d) {
            const rows = d.jobs.filter((j) => j.title || j.company);
            if (!rows.length) return null;
            return rows.map((j) => {
                const item = el("div", "item");
                item.append(head(el("strong", "item-title", j.title || j.company), W.formatPeriod(j.from, j.to)));
                const sub = [j.title ? j.company : "", j.location].filter(Boolean).join(" \u00b7 ");
                if (sub) item.append(el("div", "item-sub", sub));
                const ul = bulletList(j.description);
                if (ul) item.append(ul);
                return item;
            });
        },

        projects(d) {
            const rows = d.projects.filter((x) => x.name);
            if (!rows.length) return null;
            return rows.map((x) => {
                const item = el("div", "item");
                const title = el("strong", "item-title");
                title.append(x.link ? link(x.name, x.link) : document.createTextNode(x.name));
                item.append(head(title, ""));
                if (x.tech) item.append(el("div", "item-sub", x.tech));
                const ul = bulletList(x.description);
                if (ul) item.append(ul);
                return item;
            });
        },

        education(d) {
            const rows = d.education.filter((e) => e.university || e.major);
            if (!rows.length) return null;
            return rows.map((e) => {
                const deg = W.degreeLabel(e.degree);
                const title = e.major ? (deg ? `${deg} in ${e.major}` : e.major) : deg;
                const item = el("div", "item");
                item.append(head(el("strong", "item-title", title || e.university), W.formatPeriod(e.from, e.to)));
                if (e.university && title) item.append(el("div", "item-sub", e.university));
                if (e.gpa) item.append(el("div", "item-meta", `GPA: ${e.gpa}`));
                const ul = bulletList(e.details);
                if (ul) item.append(ul);
                return item;
            });
        },

        skills(d, s) {
            const rows = d.skills.filter((x) => x.name);
            if (!rows.length) return null;
            if (s.skillStyle === "tags") {
                const chips = el("div", "chips");
                rows.forEach((x) => chips.append(el("span", "chip", x.name)));
                return [chips];
            }
            return rows.map((x) => {
                const row = el("div", "skill-row");
                row.append(el("span", "skill-name", x.name));
                row.append(levelVisual(Math.min(5, Math.max(1, Number(x.rate) || 3)), 5, s.skillStyle));
                return row;
            });
        },

        languages(d, s) {
            const usable = (value) => {
                if (value === undefined || value === null) return "";
                const text = String(value).trim();
                return /^(null|undefined)$/i.test(text) ? "" : text;
            };
            const rows = d.languages.filter((x) => usable(x.name));
            if (!rows.length) return null;
            return rows.map((x) => {
                const row = el("div", "skill-row lang-row");
                const label = el("span", "skill-name", usable(x.name));
                const level = usable(x.level);
                const note = usable(x.note);
                const proficiency = s.skillStyle === "tags" && level ? W.levelLabel(level) : "";
                const extra = [proficiency, note].filter(Boolean).join(" · ");
                if (extra) label.append(el("small", "lang-note", extra));
                row.append(label);
                // Tag mode has no level graphic. Never append a null value: Node.append(null)
                // creates a visible text node reading "null".
                const visual = s.skillStyle === "tags" ? null : levelVisual(W.LEVEL_RATE[level] || 2, 5, s.skillStyle);
                if (visual) row.append(visual);
                return row;
            });
        },

        certs(d) {
            const rows = d.certs.filter((c) => c.name);
            if (!rows.length) return null;
            return rows.map((c) => {
                const item = el("div", "item");
                item.append(head(el("strong", "item-title", c.name), W.formatMonth(c.date)));
                if (c.issuer) item.append(el("div", "item-sub", c.issuer));
                return item;
            });
        },

        interests(d) {
            const items = W.list(d.personal.interests);
            if (!items.length) return null;
            const chips = el("div", "chips");
            items.forEach((t) => chips.append(el("span", "chip", t)));
            return [chips];
        },
    };

    const SECTION_ICONS = {
        summary: "fa-solid fa-address-card", experience: "fa-solid fa-briefcase", projects: "fa-solid fa-diagram-project",
        education: "fa-solid fa-user-graduate", skills: "fa-solid fa-list-check", languages: "fa-solid fa-language",
        certs: "fa-solid fa-certificate", interests: "fa-solid fa-heart",
    };

    // ---------- contact ----------
    function contactItems(p) {
        const items = [];
        const add = (ic, text, href, rawUrl) => {
            if (!text) return;
            items.push({ ic, text, href, rawUrl });
        };
        add("fa-solid fa-envelope", p.email, p.email ? `mailto:${p.email}` : null);
        add("fa-solid fa-phone", p.phone, null);
        add("fa-solid fa-location-dot", p.address, null);
        add("fa-solid fa-globe", W.displayUrl(p.website), W.safeUrl(p.website));
        add("fa-brands fa-linkedin-in", W.displayUrl(p.linkedin), W.safeUrl(p.linkedin));
        add("fa-brands fa-github", W.displayUrl(p.github), W.safeUrl(p.github));
        return items;
    }

    function contactBlock(p, cls) {
        const items = contactItems(p);
        if (!items.length) return null;
        const ul = el("ul", cls);
        items.forEach((c) => {
            const li = el("li");
            li.append(icon(c.ic));
            if (c.href) {
                const a = el("a", "", c.text);
                a.href = c.href;
                if (!c.href.startsWith("mailto:")) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
                li.append(a);
            } else {
                li.append(el("span", "", c.text));
            }
            ul.append(li);
        });
        return ul;
    }

    // ---------- main entry ----------
    function render(d, root) {
        const p = d.personal;
        const s = d.settings;
        const page = W.PAGE[s.paper];

        root.className = `resume tpl-${s.template} dens-${s.density}`;
        root.id = root.id || "resume";
        root.style.setProperty("--accent", s.accent);
        root.style.setProperty("--accent-dark", W.mix(s.accent, 0, 0.35));
        root.style.setProperty("--accent-soft", W.mix(s.accent, 255, 0.88));
        root.style.setProperty("--on-accent", W.onColor(s.accent));
        root.style.setProperty("--page-w", `${page.w}px`);
        root.style.setProperty("--page-h", `${page.h}px`);
        if (FONT_STACKS[s.font]) root.style.setProperty("--ff", FONT_STACKS[s.font]);
        else root.style.removeProperty("--ff");
        root.replaceChildren();

        const photoUrl = s.showPhoto && p.photo ? p.photo : null;
        const makePhoto = (cls) => {
            const img = el("img", cls);
            img.src = photoUrl;
            img.alt = `Photo of ${W.fullName(p)}`;
            return img;
        };

        // header
        const header = el("header", "r-header");
        if (photoUrl) header.append(makePhoto("r-photo"));
        const id = el("div", "r-id");
        const h1 = el("h1", "r-name");
        h1.append(el("span", "r-first", p.firstName), document.createTextNode(" "), el("span", "r-last", p.lastName));
        id.append(h1);
        if (p.title) id.append(el("p", "r-title", p.title));
        if (p.age && s.showAge) id.append(el("p", "r-age", `${p.age} years old`));
        const inline = contactBlock(p, "r-contact r-contact-inline");
        if (inline) id.append(inline);
        header.append(id);

        // body
        const body = el("div", "r-body");
        const side = el("aside", "r-side");
        const main = el("div", "r-main");
        if (photoUrl) side.append(makePhoto("r-photo-side"));
        const sideContact = contactBlock(p, "r-contact r-contact-side");
        if (sideContact) {
            const sec = el("section", "sec sec-contact");
            const h2 = el("h2");
            h2.append(icon("fa-solid fa-address-book"), document.createTextNode(" Contact"));
            sec.append(h2, sideContact);
            sec.style.order = "-1";
            side.append(sec);
        }

        s.order.forEach((secId, index) => {
            if (s.hidden.includes(secId)) return;
            const content = builders[secId](d, s);
            if (!content) return;
            const meta = W.SECTIONS.find((x) => x.id === secId);
            const sec = el("section", `sec sec-${secId}`);
            sec.dataset.section = secId;
            sec.style.order = String(index);
            const h2 = el("h2");
            h2.append(icon(SECTION_ICONS[secId]), document.createTextNode(" " + meta.label));
            const bodyEl = el("div", "sec-body");
            content.filter(Boolean).forEach((n) => bodyEl.append(n));
            sec.append(h2, bodyEl);
            (meta.side ? side : main).append(sec);
        });

        body.append(side, main);
        root.append(header, body);
    }

    W.render = render;
})(window.Workfolio);
