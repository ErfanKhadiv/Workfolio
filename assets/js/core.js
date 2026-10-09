/* Workfolio - shared data layer
 * Defaults, migration of older saved data, sample data, completeness score,
 * plain-text export and small helpers used by both the form and the viewer.
 */
(function (root) {
    "use strict";

    const KEY = "workfolio:resume";
    const VERSION = 3;

    const TEMPLATES = [
        { id: "1", name: "Classic", tag: "ATS-friendly, single column" },
        { id: "2", name: "Sidebar", tag: "Colored left sidebar" },
        { id: "3", name: "Banner", tag: "Bold header banner" },
        { id: "4", name: "Minimal", tag: "Clean, lots of whitespace" },
        { id: "5", name: "Executive", tag: "Dark header, right column" },
    ];

    const SECTIONS = [
        { id: "summary", label: "Summary", side: false },
        { id: "experience", label: "Experience", side: false },
        { id: "projects", label: "Projects", side: false },
        { id: "education", label: "Education", side: false },
        { id: "skills", label: "Skills", side: true },
        { id: "languages", label: "Languages", side: true },
        { id: "certs", label: "Certifications", side: false },
        { id: "interests", label: "Interests", side: true },
    ];

    const ACCENTS = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#c2410c", "#334155", "#059669"];
    const FONTS = {
        default: "Template default",
        sans: "Inter (sans-serif)",
        serif: "Lora (serif)",
        poppins: "Poppins (rounded)",
    };
    const SKILL_STYLES = { bars: "Progress bars", stars: "Stars", tags: "Tags (no level)" };
    const DENSITIES = { compact: "Compact", normal: "Normal", spacious: "Spacious" };
    const PAPERS = { a4: "A4", letter: "US Letter" };
    const PAGE = { a4: { w: 794, h: 1123 }, letter: { w: 816, h: 1056 } };

    const DEGREES = [
        ["bachelor", "Bachelor"],
        ["master", "Master"],
        ["phd", "PhD"],
        ["associate", "Associate"],
    ];
    const LEVELS = [
        ["beginner", "Beginner"],
        ["intermediate", "Intermediate"],
        ["advanced", "Advanced"],
        ["fluent", "Fluent"],
        ["native", "Native"],
    ];
    const LEVEL_RATE = { beginner: 1, intermediate: 2, advanced: 3, fluent: 4, native: 5 };

    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const str = (v) => (v === undefined || v === null ? "" : String(v));

    function defaultSettings() {
        return {
            template: "1",
            accent: ACCENTS[0],
            font: "default",
            skillStyle: "bars",
            density: "normal",
            paper: "a4",
            showPhoto: true,
            showAge: true,
            showPageNumbers: true,
            hidden: [],
            order: SECTIONS.map((s) => s.id),
        };
    }

    function emptyData() {
        return {
            version: VERSION,
            personal: {
                firstName: "", lastName: "", title: "", age: "", phone: "", email: "",
                address: "", website: "", linkedin: "", github: "", about: "", interests: "", photo: null,
            },
            education: [], jobs: [], projects: [], skills: [], languages: [], certs: [],
            settings: defaultSettings(),
        };
    }

    // ---------- normalisation / migration ----------
    const month = (v) => (/^\d{4}-\d{2}/.test(str(v)) ? str(v).slice(0, 7) : "");

    function normSettings(raw) {
        const s = defaultSettings();
        if (!isObj(raw)) return s;
        if (TEMPLATES.some((t) => t.id === String(raw.template))) s.template = String(raw.template);
        if (/^#[0-9a-f]{6}$/i.test(str(raw.accent))) s.accent = raw.accent.toLowerCase();
        if (raw.font in FONTS) s.font = raw.font;
        if (raw.skillStyle in SKILL_STYLES) s.skillStyle = raw.skillStyle;
        if (raw.density in DENSITIES) s.density = raw.density;
        if (raw.paper in PAPERS) s.paper = raw.paper;
        if (typeof raw.showPhoto === "boolean") s.showPhoto = raw.showPhoto;
        if (typeof raw.showAge === "boolean") s.showAge = raw.showAge;
        if (typeof raw.showPageNumbers === "boolean") s.showPageNumbers = raw.showPageNumbers;
        const ids = SECTIONS.map((x) => x.id);
        if (Array.isArray(raw.hidden)) s.hidden = raw.hidden.filter((id) => ids.includes(id));
        if (Array.isArray(raw.order)) {
            const seen = raw.order.filter((id, i) => ids.includes(id) && raw.order.indexOf(id) === i);
            s.order = [...seen, ...ids.filter((id) => !seen.includes(id))];
        }
        return s;
    }

    function normalize(raw) {
        const d = emptyData();
        const r = isObj(raw) ? raw : {};
        if (isObj(r.personal)) {
            Object.keys(d.personal).forEach((k) => {
                if (r.personal[k] !== undefined && r.personal[k] !== null) d.personal[k] = r.personal[k];
            });
            d.personal.photo = typeof r.personal.photo === "string" ? r.personal.photo : null;
        }
        ["education", "jobs", "projects", "skills", "languages", "certs"].forEach((k) => {
            d[k] = Array.isArray(r[k]) ? r[k].filter(isObj).map((o) => ({ ...o })) : [];
        });
        d.education.forEach((e) => { e.from = month(e.from); e.to = month(e.to); });
        d.jobs.forEach((j) => { j.from = month(j.from); j.to = month(j.to); });
        d.certs.forEach((c) => { c.date = month(c.date); });
        // Older drafts or imported JSON can contain the literal strings "null" or
        // "undefined". Treat them as empty values rather than showing them in resumes.
        const cleanField = (value) => {
            if (value === undefined || value === null) return "";
            const text = String(value).trim();
            return /^(null|undefined)$/i.test(text) ? "" : text;
        };
        d.skills.forEach((skill) => {
            skill.name = cleanField(skill.name);
            const rate = cleanField(skill.rate);
            skill.rate = /^[1-5]$/.test(rate) ? rate : "";
        });
        d.languages.forEach((language) => {
            language.name = cleanField(language.name);
            language.note = cleanField(language.note);
            const level = cleanField(language.level);
            language.level = LEVEL_RATE[level] ? level : "";
        });
        d.settings = normSettings(r.settings);
        return d;
    }

    // data saved by version 1 / 2 used personalInfo[0], {skill} and {language}
    function migrate(raw) {
        if (!isObj(raw)) return null;
        if (raw.version >= 3) return normalize(raw);
        const p = (Array.isArray(raw.personalInfo) && raw.personalInfo[0]) || {};
        return normalize({
            personal: {
                firstName: p.firstName, lastName: p.lastName, age: p.age, title: p.professionalTitle,
                phone: p.phoneNumber, email: p.emailAddress, address: p.address, about: p.aboutMe, photo: p.profileImg,
            },
            education: raw.education,
            jobs: raw.jobs,
            skills: (raw.skills || []).map((s) => ({ name: s.name ?? s.skill, rate: s.rate })),
            languages: (raw.languages || []).map((l) => ({ name: l.name ?? l.language, level: l.level })),
            settings: { template: raw.template },
        });
    }

    // ---------- storage ----------
    function load() {
        try {
            return migrate(JSON.parse(localStorage.getItem(KEY)));
        } catch {
            return null;
        }
    }
    function save(data) {
        try {
            localStorage.setItem(KEY, JSON.stringify(data));
            return true;
        } catch {
            return false;
        }
    }
    function clear() {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }

    function hasContent(d) {
        return Boolean(d && (d.personal.firstName || d.personal.lastName));
    }

    // ---------- helpers ----------
    function fullName(p) {
        return `${p.firstName || ""} ${p.lastName || ""}`.trim();
    }

    function safeUrl(u) {
        const v = str(u).trim();
        if (!v) return null;
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
        if (/\s/.test(withScheme)) return null;
        try {
            const url = new URL(withScheme);
            const okHost = url.hostname.includes(".") || url.hostname === "localhost";
            return (url.protocol === "http:" || url.protocol === "https:") && okHost ? withScheme : null;
        } catch {
            return null;
        }
    }

    function displayUrl(u) {
        return str(u).trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
    }

    function formatMonth(v) {
        const m = /^(\d{4})-(\d{2})/.exec(str(v));
        if (!m) return "";
        return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }

    function formatPeriod(from, to) {
        const a = formatMonth(from);
        const b = formatMonth(to);
        if (!a && !b) return "";
        return `${a || b}${a ? " - " + (b || "Present") : ""}`;
    }

    function bullets(text) {
        return str(text).split(/\r?\n/).map((l) => l.replace(/^\s*[-*\u2022]\s*/, "").trim()).filter(Boolean);
    }

    function list(text) {
        return str(text).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
    }

    function levelLabel(level) {
        return (LEVELS.find((l) => l[0] === level) || [, ""])[1];
    }

    function degreeLabel(deg) {
        return (DEGREES.find((d) => d[0] === deg) || [, ""])[1];
    }

    function download(filename, content, mime) {
        const url = URL.createObjectURL(new Blob([content], { type: mime || "text/plain" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function fileBase(d) {
        return (fullName(d.personal).replace(/[^\w-]+/g, "_") || "resume") + "_Resume";
    }

    // ---------- colour helpers ----------
    function rgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function hex(r, g, b) {
        return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
    }
    function mix(hexColor, target, amount) {
        const c = rgb(hexColor);
        return hex(...c.map((v) => v + (target - v) * amount));
    }
    function onColor(hexColor) {
        const [r, g, b] = rgb(hexColor);
        return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111827" : "#ffffff";
    }

    // ---------- completeness score ----------
    function score(d) {
        const p = d.personal;
        const checks = [
            [4, Boolean(p.firstName && p.lastName), "Add your full name."],
            [4, Boolean(p.title), "Add a professional title under your name."],
            [5, Boolean(p.email), "Add an email address."],
            [3, Boolean(p.phone), "Add a phone number."],
            [6, Boolean(p.linkedin || p.github || p.website), "Link your LinkedIn, GitHub or website."],
            [10, str(p.about).length >= 80, "Write a 2-3 sentence summary (at least ~80 characters)."],
            [12, d.education.some((e) => e.university), "Add at least one education entry."],
            [12, d.jobs.some((j) => j.title && bullets(j.description).length >= 2), "Add work experience with 2+ achievement lines (one per line)."],
            [8, d.projects.some((x) => x.name), "Add a project that shows your work."],
            [10, d.skills.filter((s) => s.name).length >= 5, "List at least 5 skills."],
            [4, d.languages.some((l) => l.name), "Add the languages you speak."],
            [4, d.certs.some((c) => c.name), "Add a certification or award."],
            [2, list(p.interests).length > 0, "Add a few interests."],
        ];
        const total = checks.reduce((a, c) => a + c[0], 0);
        const earned = checks.reduce((a, c) => a + (c[1] ? c[0] : 0), 0);
        return { score: Math.round((earned / total) * 100), tips: checks.filter((c) => !c[1]).map((c) => c[2]) };
    }

    // ---------- plain-text (ATS) export ----------
    function toText(d) {
        const p = d.personal;
        const out = [];
        const section = (title) => out.push("", title.toUpperCase(), "-".repeat(title.length));
        out.push(fullName(p).toUpperCase());
        if (p.title) out.push(p.title);
        out.push([p.email, p.phone, p.address].filter(Boolean).join(" | "));
        out.push([p.linkedin, p.github, p.website].filter(Boolean).join(" | "));
        const visible = (id) => !d.settings.hidden.includes(id);

        d.settings.order.forEach((id) => {
            if (!visible(id)) return;
            if (id === "summary" && p.about) { section("Summary"); out.push(p.about); }
            if (id === "experience" && d.jobs.some((j) => j.title || j.company)) {
                section("Experience");
                d.jobs.filter((j) => j.title || j.company).forEach((j) => {
                    out.push("", [j.title, j.company, j.location].filter(Boolean).join(", ") + (formatPeriod(j.from, j.to) ? ` (${formatPeriod(j.from, j.to)})` : ""));
                    bullets(j.description).forEach((b) => out.push("- " + b));
                });
            }
            if (id === "projects" && d.projects.some((x) => x.name)) {
                section("Projects");
                d.projects.filter((x) => x.name).forEach((x) => {
                    out.push("", x.name + (x.link ? ` (${x.link})` : "") + (x.tech ? ` [${x.tech}]` : ""));
                    bullets(x.description).forEach((b) => out.push("- " + b));
                });
            }
            if (id === "education" && d.education.some((e) => e.university || e.major)) {
                section("Education");
                d.education.filter((e) => e.university || e.major).forEach((e) => {
                    const deg = degreeLabel(e.degree);
                    out.push("", [deg && e.major ? `${deg} in ${e.major}` : e.major || deg, e.university].filter(Boolean).join(", ") + (formatPeriod(e.from, e.to) ? ` (${formatPeriod(e.from, e.to)})` : ""));
                    if (e.gpa) out.push("GPA: " + e.gpa);
                    bullets(e.details).forEach((b) => out.push("- " + b));
                });
            }
            if (id === "skills" && d.skills.some((s) => s.name)) { section("Skills"); out.push(d.skills.filter((s) => s.name).map((s) => s.name).join(", ")); }
            if (id === "languages" && d.languages.some((l) => l.name)) {
                section("Languages");
                d.languages.filter((l) => l.name).forEach((l) => out.push(`${l.name} - ${levelLabel(l.level)}${l.note ? " (" + l.note + ")" : ""}`));
            }
            if (id === "certs" && d.certs.some((c) => c.name)) {
                section("Certifications");
                d.certs.filter((c) => c.name).forEach((c) => out.push([c.name, c.issuer, formatMonth(c.date)].filter(Boolean).join(" - ")));
            }
            if (id === "interests" && list(p.interests).length) { section("Interests"); out.push(list(p.interests).join(", ")); }
        });
        return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
    }

    // ---------- sample data (fictional) ----------
    function sample() {
        return normalize({
            personal: {
                firstName: "Alex", lastName: "Morgan", title: "Full-Stack Developer", age: "26",
                phone: "+1 555 123 4567", email: "alex.morgan@example.com", address: "Berlin, Germany",
                website: "alexmorgan.dev", linkedin: "linkedin.com/in/alexmorgan", github: "github.com/alexmorgan",
                about: "Developer with 3 years of experience building fast, accessible web apps. I enjoy turning messy requirements into simple interfaces and care about clean, testable code.",
                interests: "Open source, Chess, Trail running, Photography",
            },
            education: [{ degree: "bachelor", major: "Computer Science", university: "Technical University of Berlin", from: "2017-10", to: "2021-07", gpa: "3.8 / 4.0", details: "Thesis on real-time collaboration in the browser\nGraduated with honors" }],
            jobs: [
                { title: "Frontend Developer", company: "Northwind Labs", location: "Berlin", from: "2022-02", to: "", description: "Rebuilt the customer dashboard in React, cutting load time by 45%\nIntroduced component tests that raised coverage from 30% to 85%\nMentored two junior developers through code reviews" },
                { title: "Junior Web Developer", company: "Pixel & Co", location: "Remote", from: "2021-08", to: "2022-01", description: "Built 10+ responsive marketing sites\nAutomated image optimisation in the build pipeline" },
            ],
            projects: [{ name: "TaskFlow", link: "github.com/alexmorgan/taskflow", tech: "TypeScript, React, Node.js", description: "Kanban board with real-time sync and offline support\nUsed by 300+ people in the first month" }],
            skills: [{ name: "JavaScript", rate: "5" }, { name: "React", rate: "4" }, { name: "Node.js", rate: "4" }, { name: "CSS", rate: "4" }, { name: "SQL", rate: "3" }, { name: "Git", rate: "4" }],
            languages: [{ name: "English", level: "fluent", note: "IELTS 8.0" }, { name: "German", level: "intermediate", note: "" }],
            certs: [{ name: "AWS Cloud Practitioner", issuer: "Amazon Web Services", date: "2023-05" }],
        });
    }

    root.Workfolio = {
        KEY, VERSION, TEMPLATES, SECTIONS, ACCENTS, FONTS, SKILL_STYLES, DENSITIES, PAPERS, PAGE, DEGREES, LEVELS, LEVEL_RATE,
        defaultSettings, emptyData, normalize, migrate, load, save, clear, hasContent, sample, score, toText,
        fullName, safeUrl, displayUrl, formatMonth, formatPeriod, bullets, list, levelLabel, degreeLabel,
        download, fileBase, mix, onColor,
    };
})(window);
