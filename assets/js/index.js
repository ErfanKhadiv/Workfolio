/* Workfolio - form logic (index.html)
 * Builds the dynamic form sections, validates input, autosaves a draft in
 * localStorage, shows a completeness score and live template previews.
 */
(() => {
    "use strict";
    const W = window.Workfolio;

    const MAX_PHOTO_PX = 320;
    const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
    const RATES = [1, 2, 3, 4, 5].map((n) => [String(n), String(n)]);

    // ---------- dynamic entry definitions ----------
    const ENTRY_TYPES = {
        education: {
            list: "educationList", store: "education", min: 1,
            fields: [
                { key: "degree", label: "Degree", type: "select", options: W.DEGREES },
                { key: "major", label: "Major", type: "text" },
                { key: "university", label: "University", type: "text" },
                { key: "from", label: "From", type: "month" },
                { key: "to", label: "To (empty = ongoing)", type: "month" },
                { key: "gpa", label: "GPA / Grade", type: "text", placeholder: "ex: 18.05 / 20" },
                { key: "details", label: "Details (thesis, honors...)", type: "text", wide: true },
            ],
        },
        job: {
            list: "jobList", store: "jobs", min: 0,
            fields: [
                { key: "title", label: "Job Title", type: "text" },
                { key: "company", label: "Company", type: "text" },
                { key: "location", label: "Location", type: "text" },
                { key: "from", label: "From", type: "month" },
                { key: "to", label: "To (empty = current)", type: "month" },
                { key: "description", label: "Responsibilities / Achievements (one per line)", type: "textarea", wide: true },
            ],
        },
        project: {
            list: "projectList", store: "projects", min: 0,
            fields: [
                { key: "name", label: "Project Name", type: "text" },
                { key: "link", label: "Link", type: "text", placeholder: "github.com/you/project" },
                { key: "tech", label: "Technologies", type: "text", placeholder: "React, Node.js", wide: true },
                { key: "description", label: "What it does (one point per line)", type: "textarea", wide: true },
            ],
        },
        skill: {
            list: "skillList", store: "skills", min: 0, compact: true,
            fields: [
                { key: "name", label: "Skill Title", type: "text" },
                { key: "rate", label: "Rate (1-5)", type: "select", options: RATES, fallback: "3" },
            ],
        },
        language: {
            list: "languageList", store: "languages", min: 0, compact: true,
            fields: [
                { key: "name", label: "Language", type: "text" },
                { key: "level", label: "Level", type: "select", options: W.LEVELS, fallback: "intermediate" },
                { key: "note", label: "Certificate (optional)", type: "text", placeholder: "ex: IELTS 8.0" },
            ],
        },
        cert: {
            list: "certList", store: "certs", min: 0, compact: true,
            fields: [
                { key: "name", label: "Name", type: "text" },
                { key: "issuer", label: "Issued by", type: "text" },
                { key: "date", label: "Date", type: "month" },
            ],
        },
    };

    const DEFAULT_COUNTS = { education: 1, job: 1, project: 0, skill: 3, language: 2, cert: 0 };
    const PERSONAL_FIELDS = {
        firstName: "firstName", lastName: "lastName", title: "professionalTitle", age: "age", phone: "phoneNumber",
        email: "emailAddress", address: "address", about: "aboutMe", linkedin: "linkedin", github: "github",
        website: "website", interests: "interests",
    };

    let idCounter = 0;
    let settings = W.defaultSettings();
    let photoData = null;

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const form = $("#resumeForm");
    const status = $("#draftStatus");

    // ---------- building entries ----------
    function buildField(field, value) {
        const id = `f${++idCounter}`;
        const wrap = document.createElement("div");
        wrap.className = "formItem" + (field.wide ? " wide" : "");

        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = field.label;

        let input;
        if (field.type === "select") {
            input = document.createElement("select");
            field.options.forEach(([val, text]) => input.add(new Option(text, val)));
            input.value = value || field.fallback || field.options[0][0];
        } else if (field.type === "textarea") {
            input = document.createElement("textarea");
            input.rows = 3;
            input.value = value || "";
        } else {
            input = document.createElement("input");
            input.type = field.type;
            input.value = value || "";
        }
        if (field.placeholder) input.placeholder = field.placeholder;
        input.id = id;
        input.dataset.key = field.key;
        input.className = "baseInput";

        const error = document.createElement("small");
        error.className = "errorMsg";
        error.dataset.errorFor = id;

        wrap.append(label, input, error);
        return wrap;
    }

    function addEntry(type, values = {}) {
        const def = ENTRY_TYPES[type];
        const entry = document.createElement("div");
        entry.className = "entry" + (def.compact ? " compact" : "");
        entry.dataset.type = type;

        const fields = document.createElement("div");
        fields.className = "formItems";
        def.fields.forEach((f) => fields.append(buildField(f, values[f.key])));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost-btn danger removeEntry";
        remove.setAttribute("aria-label", `Remove ${type}`);
        remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        remove.addEventListener("click", () => {
            entry.remove();
            updateRemoveButtons(type);
            scheduleSave();
        });

        entry.append(fields, remove);
        document.getElementById(def.list).append(entry);
        updateRemoveButtons(type);
        return entry;
    }

    function updateRemoveButtons(type) {
        const def = ENTRY_TYPES[type];
        const entries = $$(".entry", document.getElementById(def.list));
        entries.forEach((e) => ($(".removeEntry", e).hidden = entries.length <= def.min));
    }

    // ---------- reading / writing the form ----------
    function readEntries(type) {
        return $$(".entry", document.getElementById(ENTRY_TYPES[type].list)).map((entry) => {
            const item = {};
            $$("[data-key]", entry).forEach((el) => (item[el.dataset.key] = el.value.trim()));
            return item;
        });
    }

    function collectData() {
        const personal = { photo: photoData };
        Object.entries(PERSONAL_FIELDS).forEach(([key, name]) => (personal[key] = form.elements[name].value.trim()));
        const data = { version: W.VERSION, personal, settings };
        Object.entries(ENTRY_TYPES).forEach(([type, def]) => (data[def.store] = readEntries(type)));
        return W.normalize(data);
    }

    function restore(data) {
        const d = data || W.emptyData();
        Object.entries(PERSONAL_FIELDS).forEach(([key, name]) => (form.elements[name].value = d.personal[key] ?? ""));
        setPhoto(d.personal.photo || null);
        updateCounter();
        settings = d.settings;

        Object.entries(ENTRY_TYPES).forEach(([type, def]) => {
            document.getElementById(def.list).replaceChildren();
            const rows = data ? d[def.store] : [];
            const count = data ? Math.max(rows.length, def.min) : DEFAULT_COUNTS[type];
            for (let i = 0; i < count; i++) addEntry(type, rows[i] || {});
        });
        updateScore();
    }

    // ---------- photo ----------
    function setPhoto(dataUrl) {
        photoData = dataUrl;
        $("#photoPreview").src = dataUrl || "assets/imgs/avatar.svg";
        $("#removePhoto").hidden = !dataUrl;
        if (!dataUrl) $("#profileImgInput").value = "";
    }

    function resizeImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error("This file could not be read as an image."));
            };
            img.src = url;
        });
    }

    $("#profileImgInput").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        setError(event.target, "");
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            setError(event.target, "Please choose an image file.");
            event.target.value = "";
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            setError(event.target, "Image is too large (max 8 MB).");
            event.target.value = "";
            return;
        }
        try {
            setPhoto(await resizeImage(file));
            scheduleSave();
        } catch (err) {
            setError(event.target, err.message);
        }
    });

    $("#removePhoto").addEventListener("click", () => {
        setPhoto(null);
        scheduleSave();
    });

    // ---------- validation ----------
    function setError(input, message) {
        const slot = document.querySelector(`[data-error-for="${input.id}"]`);
        if (slot) slot.textContent = message;
        input.classList.toggle("invalid", Boolean(message));
        input.setAttribute("aria-invalid", message ? "true" : "false");
    }

    function validate() {
        const errors = [];
        const check = (input, message) => {
            setError(input, message || "");
            if (message) errors.push(input);
        };
        const el = (name) => form.elements[name];
        const val = (name) => el(name).value.trim();

        check(el("firstName"), val("firstName") ? "" : "First name is required.");
        check(el("lastName"), val("lastName") ? "" : "Last name is required.");
        check(el("professionalTitle"), val("professionalTitle") ? "" : "Professional title is required.");

        const email = val("emailAddress");
        check(
            el("emailAddress"),
            !email ? "Email address is required." : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : "Enter a valid email address."
        );

        const age = val("age");
        check(el("age"), age === "" || (Number.isInteger(Number(age)) && age >= 14 && age <= 100) ? "" : "Age must be between 14 and 100.");

        const phone = val("phoneNumber");
        check(el("phoneNumber"), phone === "" || /^\+?[\d\s().-]{6,20}$/.test(phone) ? "" : "Enter a valid phone number.");

        ["linkedin", "github", "website"].forEach((name) => {
            const v = val(name);
            check(el(name), v === "" || W.safeUrl(v) ? "" : "Enter a valid web address.");
        });

        ["education", "job"].forEach((type) => {
            $$(".entry", document.getElementById(ENTRY_TYPES[type].list)).forEach((entry) => {
                const from = $('[data-key="from"]', entry);
                const to = $('[data-key="to"]', entry);
                check(to, from.value && to.value && from.value > to.value ? "End date must be after the start date." : "");
            });
        });
        $$(".entry", document.getElementById("projectList")).forEach((entry) => {
            const link = $('[data-key="link"]', entry);
            check(link, link.value === "" || W.safeUrl(link.value) ? "" : "Enter a valid web address.");
        });

        if (errors.length) {
            errors[0].scrollIntoView({ behavior: "smooth", block: "center" });
            errors[0].focus({ preventScroll: true });
        }
        return errors.length === 0;
    }

    form.addEventListener("input", (event) => {
        if (event.target.classList?.contains("invalid")) setError(event.target, "");
    });

    // ---------- completeness score ----------
    function updateScore() {
        const { score, tips } = W.score(collectData());
        $("#scoreText").textContent = `${score}%`;
        $("#scoreFill").style.width = `${score}%`;
        $("#scoreFill").dataset.level = score >= 80 ? "high" : score >= 50 ? "mid" : "low";
        const ul = $("#scoreTips");
        ul.replaceChildren();
        tips.slice(0, 3).forEach((t) => {
            const li = document.createElement("li");
            li.textContent = t;
            ul.append(li);
        });
    }

    // ---------- autosave ----------
    let saveTimer;
    function saveNow() {
        clearTimeout(saveTimer);
        const ok = W.save(collectData());
        status.textContent = ok ? "Draft saved in this browser." : "Could not save a draft (browser storage unavailable).";
        updateScore();
        return ok;
    }
    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 400);
    }
    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);

    function updateCounter() {
        const area = form.elements.aboutMe;
        $("#aboutCounter").textContent = `${area.value.length} / ${area.maxLength}`;
    }
    form.elements.aboutMe.addEventListener("input", updateCounter);

    // ---------- template picker with live previews ----------
    const PREVIEW_SCALE = 0.33;
    const cards = [];

    function buildTemplatePicker() {
        const box = $("#templateItems");
        W.TEMPLATES.forEach((t) => {
            const card = document.createElement("div");
            card.className = "tplCard";
            card.dataset.template = t.id;
            card.setAttribute("role", "radio");
            card.tabIndex = 0;

            const thumb = document.createElement("div");
            thumb.className = "tplThumb";
            const frame = document.createElement("iframe");
            frame.title = `${t.name} template preview`;
            frame.tabIndex = -1;
            frame.setAttribute("aria-hidden", "true");
            frame.style.transform = `scale(${PREVIEW_SCALE})`;
            thumb.append(frame);

            const name = document.createElement("strong");
            name.textContent = `${t.id}. ${t.name}`;
            const tag = document.createElement("small");
            tag.textContent = t.tag;

            card.append(thumb, name, tag);
            card.addEventListener("click", () => {
                selectTemplate(t.id);
                scheduleSave();
            });
            card.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    card.click();
                }
            });
            box.append(card);
            cards.push({ card, frame, id: t.id });
        });
    }

    function selectTemplate(id) {
        settings.template = W.TEMPLATES.some((t) => t.id === String(id)) ? String(id) : "1";
        cards.forEach(({ card, id: cid }) => {
            const active = cid === settings.template;
            card.classList.toggle("selected", active);
            card.setAttribute("aria-checked", String(active));
        });
    }

    function loadPreviews() {
        saveNow(); // previews read the stored data, so flush it first
        const stamp = Date.now();
        cards.forEach(({ frame, id }) => (frame.src = `resume.html?preview=1&t=${id}&_=${stamp}`));
    }

    buildTemplatePicker();

    // ---------- add / reset / sample / import / export ----------
    $$("[data-add]").forEach((btn) =>
        btn.addEventListener("click", () => {
            const entry = addEntry(btn.dataset.add);
            $("input, textarea", entry)?.focus();
        })
    );

    function applyData(data) {
        restore(data);
        selectTemplate(data.settings.template);
        saveNow();
    }

    $("#sampleBtn").addEventListener("click", () => {
        if (W.hasContent(collectData()) && !confirm("Replace what you entered with the sample data?")) return;
        applyData(W.sample());
    });

    $("#exportBtn").addEventListener("click", () => {
        const data = collectData();
        W.download(`${W.fileBase(data)}.json`, JSON.stringify(data, null, 2), "application/json");
    });

    $("#importBtn").addEventListener("click", () => $("#importInput").click());
    $("#importInput").addEventListener("change", async (event) => {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        try {
            const data = W.migrate(JSON.parse(await file.text()));
            if (!data) throw new Error("Not a Workfolio file");
            applyData(data);
            status.textContent = "Imported successfully.";
        } catch {
            alert("This file could not be imported. Please choose a JSON file exported from Workfolio.");
        }
    });

    $("#resetBtn").addEventListener("click", () => {
        if (!confirm("Clear everything you have entered? This cannot be undone.")) return;
        W.clear();
        form.reset();
        settings = W.defaultSettings();
        restore(null);
        selectTemplate("1");
        $$(".errorMsg").forEach((s) => (s.textContent = ""));
        status.textContent = "Form cleared.";
    });

    // ---------- submit ----------
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!validate()) return;
        if (!saveNow()) {
            alert("Your browser blocked local storage, so the resume cannot be passed to the next page. Please allow site data and try again.");
            return;
        }
        window.location.href = "resume.html";
    });

    // ---------- init ----------
    const saved = W.load();
    restore(saved);
    selectTemplate(saved ? saved.settings.template : "1");

    // previews are loaded only once the section is near the viewport, and only
    // after the saved draft has been restored (loadPreviews() saves the form)
    if ("IntersectionObserver" in window) {
        new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && loadPreviews(), { rootMargin: "200px" }).observe($("#templateSelect"));
    } else {
        loadPreviews();
    }
})();
