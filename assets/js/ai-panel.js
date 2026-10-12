/* Workfolio - AI Job Match panel (resume.html)
 * UI for assets/js/ai-match.js: paste a job description, see how well the resume
 * fits, which skills are missing, and optionally reorder bullets/skills to match.
 * All text is inserted with textContent; nothing is sent to a server.
 */
(() => {
    "use strict";
    const AI = window.WorkfolioAI;
    if (!AI) return;

    const JD_KEY = "workfolio:job-description";
    const UNDO_KEY = "workfolio:pre-tailor";

    const EXAMPLE_JD = `Frontend Developer

We are looking for a Frontend Developer to build fast, accessible web applications used by thousands of people.

Responsibilities
- Build and maintain user interfaces with React and TypeScript
- Improve page load performance and accessibility (WCAG)
- Write unit tests with Jest and review teammates' code
- Work with REST APIs and GraphQL services
- Deploy with Docker and Kubernetes on AWS
- Collaborate with designers and backend engineers in an agile team
- Strong communication and problem-solving skills

Nice to have
- Experience with Node.js and SQL databases
- Interest in open source`;

    // ---------- tiny DOM helper (text only, never innerHTML) ----------
    function h(tag, props, ...kids) {
        const el = document.createElement(tag);
        Object.entries(props || {}).forEach(([k, v]) => {
            if (v === undefined || v === null || v === false) return;
            if (k === "class") el.className = v;
            else if (k === "text") el.textContent = v;
            else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? "" : v);
        });
        kids.flat().forEach((kid) => {
            if (kid === undefined || kid === null || kid === false) return;
            el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        });
        return el;
    }
    const icon = (name) => h("i", { class: `fa-solid fa-${name}`, "aria-hidden": "true" });

    const store = {
        get(key) { try { return localStorage.getItem(key); } catch { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable */ } },
        remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
    };

    let hooks = null; // { getData, isSample, apply }
    let opener = null;
    let modal;
    let els = {};
    let last = null; // last analysis (kept so Tailor can use it)
    let busy = false;

    // ---------- build the dialog once ----------
    function build() {
        els.jd = h("textarea", { id: "aiJd", rows: "12", placeholder: "Paste the full job posting here...", spellcheck: "false" });
        els.useModel = h("input", { type: "checkbox", id: "aiUseModel", checked: true });
        els.run = h("button", { class: "btn primary", type: "button", onclick: run }, icon("wand-magic-sparkles"), " Analyze match");
        els.status = h("div", { class: "ai-status", "aria-live": "polite" });
        els.results = h("section", { class: "ai-results", id: "aiResults", "aria-label": "Match results", hidden: true });

        const input = h("section", { class: "ai-input" },
            h("label", { for: "aiJd", class: "ai-label" }, "Job description"),
            els.jd,
            h("div", { class: "ai-row" },
                h("button", { class: "btn small", type: "button", onclick: () => { els.jd.value = EXAMPLE_JD; els.jd.focus(); } }, "Use an example posting"),
                h("button", { class: "btn small ghost", type: "button", onclick: () => { els.jd.value = ""; store.remove(JD_KEY); els.jd.focus(); } }, "Clear")),
            h("label", { class: "ai-check", for: "aiUseModel" }, els.useModel,
                h("span", {}, "Use the AI model for semantic matching ",
                    h("small", {}, "(downloads about 25 MB once, then works offline). Untick for a fast keyword-only check."))),
            els.run,
            els.status,
            h("p", { class: "ai-privacy" }, icon("lock"), " Your resume and the job text are processed in this browser tab. Only the open-source model files are downloaded; nothing you type is uploaded."));

        const dialog = h("div", { class: "ai-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "aiTitle", tabindex: "-1" },
            h("header", { class: "ai-head" },
                h("div", {},
                    h("h2", { id: "aiTitle" }, "AI Job Match"),
                    h("p", {}, "See how your resume reads against a specific job, and what to fix before you apply.")),
                h("button", { class: "ai-close", type: "button", "aria-label": "Close", onclick: close }, "\u00d7")),
            h("div", { class: "ai-body" }, input, els.results));

        modal = h("div", { class: "ai-modal", id: "aiModal", hidden: true },
            h("div", { class: "ai-backdrop", onclick: close }), dialog);
        document.body.append(modal);

        document.addEventListener("keydown", (e) => {
            if (modal.hidden) return;
            if (e.key === "Escape") close();
            if (e.key === "Tab") trapFocus(e);
        });
    }

    function trapFocus(e) {
        const items = [...modal.querySelectorAll("button, textarea, input, summary, a[href]")].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
        else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
    }

    function open() {
        if (!modal) build();
        if (!els.jd.value) els.jd.value = store.get(JD_KEY) || "";
        modal.hidden = false;
        document.body.classList.add("ai-open");
        els.jd.scrollTop = 0;
        // on phones, focusing the textarea would pop the keyboard up before the person has read anything
        const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
        (touch ? modal.querySelector(".ai-dialog") : els.jd).focus({ preventScroll: true });
        renderTailorUndoOnly();
    }

    function close() {
        if (!modal || modal.hidden) return;
        store.set(JD_KEY, els.jd.value);
        modal.hidden = true;
        document.body.classList.remove("ai-open");
        if (opener) opener.focus();
    }

    // ---------- run an analysis ----------
    function setStatus(text, progress) {
        els.status.replaceChildren();
        if (!text) return;
        els.status.append(h("span", {}, text));
        if (typeof progress === "number") {
            els.status.append(h("div", { class: "ai-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(progress * 100)) },
                h("span", { style: `width:${Math.round(progress * 100)}%` })));
        }
    }

    async function run() {
        if (busy) return;
        const jd = els.jd.value.trim();
        store.set(JD_KEY, els.jd.value);
        busy = true;
        els.run.disabled = true;
        els.results.hidden = true;
        let embed = null;
        let fellBack = false;

        try {
            if (els.useModel.checked) {
                setStatus("Loading the language model (first time only)...", 0);
                try {
                    embed = await AI.loadEmbedder((p) => setStatus("Downloading the language model (first time only)...", p));
                } catch (error) {
                    console.warn("Embedding model unavailable, using keyword matching", error);
                    fellBack = true;
                }
            }
            setStatus(embed ? "Comparing your resume with the posting..." : "Analyzing keywords...");
            await new Promise((r) => setTimeout(r, 30)); // let the status paint before heavy work
            last = await AI.analyze(hooks.getData(), jd, { embed });
            last.fellBack = fellBack;
            setStatus("");
            render(last);
        } catch (error) {
            console.error(error);
            setStatus("");
            els.status.append(h("p", { class: "ai-error", role: "alert" }, error && error.message ? error.message : "Something went wrong. Please try again."));
        } finally {
            busy = false;
            els.run.disabled = false;
        }
    }

    // ---------- render results ----------
    const levelText = { strong: "Strong", partial: "Partial", gap: "Gap", soft: "Soft skill" };

    function ring(score) {
        const tone = score >= 70 ? "good" : score >= 45 ? "mid" : "low";
        const el = h("div", { class: `ai-ring ${tone}`, role: "img", "aria-label": `Match score ${score} out of 100` },
            h("div", { class: "ai-ring-in" }, h("strong", {}, String(score)), h("span", {}, "/ 100")));
        el.style.setProperty("--p", `${score}%`);
        return el;
    }

    function chips(list, cls) {
        return h("ul", { class: "ai-chips" }, list.map((x) => h("li", { class: cls }, x)));
    }

    function requirementItem(r) {
        return h("li", { class: `ai-req ${r.level}` },
            h("div", { class: "ai-req-top" }, h("span", { class: "ai-tag" }, levelText[r.level]), h("p", {}, r.text)),
            r.level === "soft" ? h("p", { class: "ai-evidence" }, "Hard to prove from a CV by keywords. Show it through a concrete example in a project or job bullet.") :
            h("p", { class: "ai-evidence" }, h("b", {}, r.level === "gap" ? "Closest thing in your resume: " : "Backed by: "),
                r.evidence.text.startsWith(r.evidence.label) ? "" : `${r.evidence.label}. `,
                h("span", {}, r.evidence.text.length > 140 ? r.evidence.text.slice(0, 137) + "..." : r.evidence.text)),
            r.also ? h("p", { class: "ai-evidence" }, h("b", {}, "Also in: "), `${r.also.label}. `,
                h("span", {}, r.also.text.length > 110 ? r.also.text.slice(0, 107) + "..." : r.also.text)) : null);
    }

    function render(a) {
        const matched = a.skills.filter((s) => s.found).map((s) => s.name);
        const missing = a.skills.filter((s) => !s.found).map((s) => s.name);
        const order = { gap: 0, partial: 1, soft: 2, strong: 3 };
        const sorted = [...a.requirements].sort((x, y) => order[x.level] - order[y.level] || x.sim - y.sim);
        const open = sorted.filter((r) => r.level !== "strong");
        const strong = sorted.filter((r) => r.level === "strong");

        const breakdown = [`Requirement fit ${a.fit}%`];
        if (a.coverage !== null) breakdown.push(`keyword coverage ${a.coverage}%`);

        const modeNote = a.mode === "semantic"
            ? "Semantic matching with an on-device AI model (MiniLM sentence embeddings)."
            : a.fellBack
                ? "The AI model could not be loaded (offline or blocked), so this run used keyword matching only."
                : "Keyword matching only. Turn on the AI model for meaning-based matching.";

        const parts = [
            hooks.isSample() ? h("p", { class: "ai-note" }, "You are analyzing the sample resume. Fill in your own details to get real results.") : null,
            h("div", { class: "ai-score" },
                ring(a.overall),
                h("div", {},
                    h("h3", {}, a.overall >= 70 ? "Strong match" : a.overall >= 45 ? "Partial match" : "Weak match"),
                    h("p", { class: "ai-break" }, breakdown.join(" \u00b7 ")),
                    h("p", { class: "ai-mode" }, modeNote))),

            h("h3", { class: "ai-h" }, "Skills in the posting"),
            a.skills.length
                ? h("div", { class: "ai-skillbox" },
                    matched.length ? h("div", {}, h("p", { class: "ai-sub" }, `On your resume (${matched.length})`), chips(matched, "ok")) : null,
                    missing.length ? h("div", {}, h("p", { class: "ai-sub" }, `Not on your resume (${missing.length})`), chips(missing, "miss")) : null)
                : h("p", { class: "ai-muted" }, "No known skills were detected in this posting."),
            a.terms.length
                ? h("div", {}, h("p", { class: "ai-sub" }, "Other frequent words in the posting"),
                    h("ul", { class: "ai-chips" }, a.terms.map((t) => h("li", { class: t.found ? "ok" : "miss" }, t.text))))
                : null,

            h("h3", { class: "ai-h" }, "What the posting asks for"),
            open.length ? h("ul", { class: "ai-reqs" }, open.map(requirementItem)) : h("p", { class: "ai-muted" }, "Every requirement has strong support in your resume."),
            strong.length ? h("details", { class: "ai-strong" }, h("summary", {}, `Strong matches (${strong.length})`), h("ul", { class: "ai-reqs" }, strong.map(requirementItem))) : null,

            h("h3", { class: "ai-h" }, "Suggestions"),
            a.suggestions.length ? h("ul", { class: "ai-tips" }, a.suggestions.map((t) => h("li", {}, t))) : h("p", { class: "ai-muted" }, "Nothing major to fix for this posting."),

            tailorBox(a)];
        els.results.replaceChildren(...parts.filter(Boolean));
        els.results.hidden = false;
        els.results.scrollTop = 0;
        els.results.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    // ---------- tailor / undo ----------
    function readUndo() {
        try {
            const saved = JSON.parse(store.get(UNDO_KEY));
            if (saved && saved.before && saved.after === AI.signature(hooks.getData())) return saved;
        } catch { /* ignore */ }
        store.remove(UNDO_KEY); // data changed since: an old snapshot would overwrite newer edits
        return null;
    }

    function tailorBox(a) {
        const box = h("div", { class: "ai-tailor", id: "aiTailor" });
        fillTailor(box, a);
        return box;
    }

    function fillTailor(box, a) {
        box.replaceChildren(h("h3", { class: "ai-h" }, "Tailor your resume"),
            h("p", { class: "ai-muted" }, "Puts the skills and bullets most relevant to this posting first. It only changes the order. No text is rewritten or added, and you can undo it."));
        const msg = h("p", { class: "ai-msg", "aria-live": "polite" });
        const actions = h("div", { class: "ai-row" });

        if (a) {
            const plan = AI.planTailor(hooks.getData(), a);
            const apply = h("button", { class: "btn primary", type: "button", disabled: hooks.isSample() || a.applied || !plan.changed, onclick: () => {
                const data = hooks.getData();
                const before = AI.applyTailor(data, plan);
                hooks.apply(() => {});
                a.applied = true; // the analysis refers to the old order, so it cannot be applied twice
                store.set(UNDO_KEY, JSON.stringify({ before, after: AI.signature(data) }));
                fillTailor(box, a);
                box.querySelector(".ai-msg").textContent = "Done. Your resume now leads with the most relevant bullets and skills.";
            } }, icon("arrow-up-wide-short"), " Apply tailored order");
            actions.append(apply);
            if (hooks.isSample()) msg.textContent = "Sample data cannot be changed. Fill in your own details first.";
            else if (!plan.changed && !a.applied) msg.textContent = "Your bullets and skills are already in the best order for this posting.";
        }
        const saved = readUndo();
        if (saved) {
            actions.append(h("button", { class: "btn", type: "button", onclick: () => {
                hooks.apply((data) => AI.restore(data, saved.before));
                store.remove(UNDO_KEY);
                if (a) a.applied = false;
                fillTailor(box, a);
                box.querySelector(".ai-msg").textContent = "Restored your previous order.";
            } }, icon("rotate-left"), " Undo tailoring"));
        }
        box.append(actions, msg);
    }

    // lets the user undo a previous tailoring even before running a new analysis
    function renderTailorUndoOnly() {
        if (last || !readUndo()) return;
        els.results.replaceChildren(h("div", { class: "ai-tailor" }));
        fillTailor(els.results.firstChild, null);
        els.results.hidden = false;
    }

    // ---------- public init (called by viewer.js) ----------
    window.WorkfolioAIPanel = {
        init(options) {
            hooks = options;
            opener = options.button;
            if (opener) opener.addEventListener("click", open);
        },
    };
})();
