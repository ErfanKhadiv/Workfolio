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
                { key: "major", label: "Major / Field of Study", type: "text", placeholder: "e.g., Computer Engineering" },
                { key: "university", label: "University", type: "text", placeholder: "e.g., University of Bologna" },
                { key: "from", label: "From", type: "month", hint: "Choose the start month." },
                { key: "to", label: "To (empty = ongoing)", type: "month", hint: "Leave blank if ongoing." },
                { key: "gpa", label: "GPA / Grade", type: "text", placeholder: "e.g., 18.05/20 or 3.8/4.0" },
                { key: "details", label: "Details: thesis, honors... (one per line)", type: "textarea", placeholder: "e.g., Graduated with honors\nThesis on machine learning", wide: true },
            ],
        },
        job: {
            list: "jobList", store: "jobs", min: 0,
            fields: [
                { key: "title", label: "Job Title", type: "text", placeholder: "e.g., Software Engineering Intern" },
                { key: "company", label: "Company", type: "text", placeholder: "e.g., Example Technology Ltd." },
                { key: "location", label: "Location", type: "text", placeholder: "e.g., Remote or Milan, Italy" },
                { key: "from", label: "From", type: "month", hint: "Choose the start month." },
                { key: "to", label: "To (empty = current)", type: "month", hint: "Leave blank for your current role." },
                { key: "description", label: "Responsibilities / Achievements (one per line)", type: "textarea", placeholder: "e.g., Improved page load time by 25%\nAutomated a repetitive reporting task", wide: true },
            ],
        },
        project: {
            list: "projectList", store: "projects", min: 0,
            fields: [
                { key: "name", label: "Project Name", type: "text", placeholder: "e.g., Resume Builder or Image Classifier" },
                { key: "link", label: "Link", type: "text", placeholder: "e.g., github.com/your-name/project" },
                { key: "tech", label: "Technologies", type: "text", placeholder: "e.g., Python, JavaScript, SQL", wide: true },
                { key: "description", label: "What it does (one point per line)", type: "textarea", placeholder: "e.g., Built a tool to analyze and visualize data\nAdded input validation and automated tests", wide: true },
            ],
        },
        skill: {
            list: "skillList", store: "skills", min: 0, compact: true,
            fields: [
                { key: "name", label: "Skill", type: "text", placeholder: "e.g., Python, Git, Data Analysis" },
                { key: "rate", label: "Rate (1-5)", type: "select", options: RATES, fallback: "3" },
            ],
        },
        language: {
            list: "languageList", store: "languages", min: 0, compact: true,
            fields: [
                { key: "name", label: "Language", type: "text", placeholder: "e.g., English" },
                { key: "level", label: "Level", type: "select", options: W.LEVELS, fallback: "intermediate" },
                { key: "note", label: "Certificate (optional)", type: "text", placeholder: "e.g., IELTS 8.0 or CEFR B2" },
            ],
        },
        cert: {
            list: "certList", store: "certs", min: 0, compact: true,
            fields: [
                { key: "name", label: "Name", type: "text", placeholder: "e.g., CS50 Introduction to Computer Science" },
                { key: "issuer", label: "Issued by", type: "text", placeholder: "e.g., Harvard University" },
                { key: "date", label: "Date", type: "month", hint: "Choose the month awarded." },
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
    let wizardIndex = 0;
    let wizardSteps = [];
    let previewsLoaded = false;

    const WIZARD_META = [
        { title: "Personal details", description: "Start with the information people need to contact you." },
        { title: "Education", description: "Add degrees, grades, dates, and academic details." },
        { title: "Experience", description: "Include jobs, internships, and measurable achievements." },
        { title: "Projects", description: "Show work that demonstrates your practical skills." },
        { title: "Skills & languages", description: "List relevant skills and language proficiency." },
        { title: "Certifications & interests", description: "Add credentials and a few relevant interests." },
    ];

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const form = $("#resumeForm");
    const status = $("#draftStatus");

    function makeProgress(id) {
        const box = document.createElement("div");
        box.className = "wizard-progress";
        box.id = id;
        const text = document.createElement("div");
        text.className = "wizard-progress-label";
        text.setAttribute("aria-live", "polite");
        const track = document.createElement("div");
        track.className = "wizard-progress-track";
        const fill = document.createElement("div");
        fill.className = "wizard-progress-fill";
        track.append(fill);
        box.append(text, track);
        return box;
    }

    function updateProgress(box, index) {
        const finalIndex = WIZARD_META.length;
        const meta = index === finalIndex ? { title: "Choose a template" } : WIZARD_META[index];
        box.querySelector(".wizard-progress-label").textContent = `Step ${index + 1} of ${finalIndex + 1} · ${meta.title}`;
        box.querySelector(".wizard-progress-fill").style.width = `${((index + 1) / (finalIndex + 1)) * 100}%`;
        box.setAttribute("aria-label", `Step ${index + 1} of ${finalIndex + 1}`);
    }

    function setupWizard() {
        const formBox = $("#formBox");
        const fields = $$(":scope > .formGroup", formBox);
        const groups = [[0, 1], [2], [3], [4], [5, 6], [7, 8]];
        wizardSteps = groups.map((indices, i) => {
            const step = document.createElement("div");
            step.className = "wizard-step";
            step.dataset.wizardIndex = String(i);
            const intro = document.createElement("div");
            intro.className = "wizard-step-intro";
            const heading = document.createElement("h3");
            heading.textContent = WIZARD_META[i].title;
            const paragraph = document.createElement("p");
            paragraph.textContent = WIZARD_META[i].description;
            intro.append(heading, paragraph);
            step.append(intro, ...indices.map((n) => fields[n]).filter(Boolean));
            return step;
        });
        formBox.replaceChildren(...wizardSteps);

        const progress = makeProgress("wizardProgress");
        $("#scoreCard").after(progress);

        const nav = document.createElement("div");
        nav.id = "wizardNav";
        nav.className = "wizard-nav";
        const back = document.createElement("button");
        back.type = "button";
        back.id = "wizardBack";
        back.className = "ghost-btn";
        back.textContent = "← Back";
        const next = document.createElement("button");
        next.type = "button";
        next.id = "wizardNext";
        next.className = "base-btn wizard-next";
        next.textContent = "Next →";
        back.addEventListener("click", () => setWizardStep(wizardIndex - 1));
        next.addEventListener("click", () => {
            if (!validateStep(wizardIndex)) return;
            saveNow();
            setWizardStep(wizardIndex + 1);
        });
        nav.append(back, next);
        $(".formActions").before(nav);

        const templateContainer = $("#templateSelect .container");
        const finalProgress = makeProgress("templateWizardProgress");
        const finalBack = document.createElement("button");
        finalBack.type = "button";
        finalBack.id = "templateWizardBack";
        finalBack.className = "ghost-btn templateBack";
        finalBack.textContent = "← Back to details";
        finalBack.addEventListener("click", () => setWizardStep(wizardSteps.length - 1));
        templateContainer.insertBefore(finalProgress, $("#templateBox"));
        templateContainer.insertBefore(finalBack, $("#templateBox"));
        $("#templateSelect").hidden = true;
        setWizardStep(0, false);
    }

    function setWizardStep(index, shouldScroll = true) {
        const max = wizardSteps.length;
        wizardIndex = Math.max(0, Math.min(max, index));
        const finalStep = wizardIndex === max;
        $("#formSec").hidden = finalStep;
        $("#templateSelect").hidden = !finalStep;
        wizardSteps.forEach((step, i) => { step.hidden = i !== wizardIndex; });
        updateProgress($("#wizardProgress"), wizardIndex);
        updateProgress($("#templateWizardProgress"), wizardIndex);
        $("#wizardBack").hidden = wizardIndex === 0;
        $("#wizardNext").textContent = wizardIndex === max - 1 ? "Choose a template →" : "Next →";
        if (finalStep && !previewsLoaded) loadPreviews();
        if (shouldScroll) {
            const target = finalStep ? $("#templateSelect") : wizardSteps[wizardIndex];
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function validateStep(index) {
        const errors = [];
        const check = (input, message) => {
            if (!input) return;
            setError(input, message || "");
            if (message) errors.push(input);
        };
        const get = (name) => form.elements[name];
        const value = (name) => get(name)?.value.trim() || "";
        const validatePeriodList = (listId) => {
            $$(".entry", document.getElementById(listId)).forEach((entry) => {
                const from = $('[data-key="from"]', entry);
                const to = $('[data-key="to"]', entry);
                check(to, from?.value && to?.value && from.value > to.value ? "End date must be after the start date." : "");
            });
        };

        if (index === 0) {
            check(get("firstName"), value("firstName") ? "" : "First name is required.");
            check(get("lastName"), value("lastName") ? "" : "Last name is required.");
            check(get("professionalTitle"), value("professionalTitle") ? "" : "Professional title is required.");
            const email = value("emailAddress");
            check(get("emailAddress"), !email ? "Email address is required." : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : "Enter a valid email address.");
            const age = value("age");
            check(get("age"), age === "" || (Number.isInteger(Number(age)) && Number(age) >= 14 && Number(age) <= 100) ? "" : "Age must be between 14 and 100.");
            const phone = value("phoneNumber");
            check(get("phoneNumber"), phone === "" || /^\+?[\d\s().-]{6,20}$/.test(phone) ? "" : "Enter a valid phone number.");
            ["linkedin", "github", "website"].forEach((name) => check(get(name), value(name) === "" || W.safeUrl(value(name)) ? "" : "Enter a valid web address."));
        } else if (index === 1) {
            validatePeriodList("educationList");
        } else if (index === 2) {
            validatePeriodList("jobList");
        } else if (index === 3) {
            $$(".entry", document.getElementById("projectList")).forEach((entry) => {
                const link = $('[data-key="link"]', entry);
                check(link, !link || link.value.trim() === "" || W.safeUrl(link.value) ? "" : "Enter a valid web address.");
            });
        }
        if (errors.length) {
            errors[0].scrollIntoView({ behavior: "smooth", block: "center" });
            errors[0].focus({ preventScroll: true });
            return false;
        }
        return true;
    }

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
        else if (field.type === "text") {
            const examples = {
                degree: "Choose the closest degree type", name: "Enter a name", issuer: "Enter the issuing organization",
                company: "Enter the organization", title: "Enter a role or title", major: "e.g., Computer Science",
                university: "e.g., University name", location: "e.g., City, Country", details: "Add relevant details (optional)",
            };
            input.placeholder = examples[field.key] || `e.g., ${field.label.toLowerCase()}`;
        }
        input.id = id;
        input.dataset.key = field.key;
        input.className = "baseInput";

        const error = document.createElement("small");
        error.className = "errorMsg";
        error.dataset.errorFor = id;
        if (field.hint) {
            const hint = document.createElement("small");
            hint.className = "fieldHint";
            hint.textContent = field.hint;
            wrap.append(label, input, hint, error);
        } else {
            wrap.append(label, input, error);
        }
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

    // ---------- accessible square photo cropper ----------
    let cropDialog = null;
    let cropCanvas = null;
    let cropZoom = null;
    let cropImage = null;
    let cropUrl = null;
    let cropResolve = null;
    let cropSourceResult = null;
    let cropCenterX = 0;
    let cropCenterY = 0;
    let cropBaseSize = 0;
    let cropZoomValue = 1;
    let cropDrag = null;

    function ensureCropper() {
        if (cropDialog) return;
        cropDialog = document.createElement("dialog");
        cropDialog.className = "photo-crop-dialog";
        cropDialog.setAttribute("aria-labelledby", "photoCropTitle");
        cropDialog.innerHTML = `
            <div class="photo-crop-card">
                <div class="photo-crop-head">
                    <div><h2 id="photoCropTitle">Crop profile photo</h2><p>Drag the image to reposition it, then adjust the zoom.</p></div>
                    <button type="button" class="photo-crop-close" data-crop-cancel aria-label="Cancel cropping">×</button>
                </div>
                <div class="photo-crop-canvas-wrap"><canvas id="photoCropCanvas" width="320" height="320" aria-label="Square photo crop preview"></canvas></div>
                <label class="photo-crop-zoom" for="photoCropZoom"><span>Zoom</span><input id="photoCropZoom" type="range" min="1" max="3" step="0.05" value="1"><output id="photoCropZoomValue">1×</output></label>
                <div class="photo-crop-actions"><button type="button" class="ghost-btn" data-crop-cancel>Cancel</button><button type="button" class="base-btn" id="photoCropConfirm">Crop &amp; use photo</button></div>
            </div>`;
        document.body.append(cropDialog);
        cropCanvas = $("#photoCropCanvas");
        cropZoom = $("#photoCropZoom");
        cropImage = new Image();
        const ctx = cropCanvas.getContext("2d");

        const clampCrop = () => {
            const size = cropBaseSize / cropZoomValue;
            cropCenterX = Math.max(size / 2, Math.min(cropImage.naturalWidth - size / 2, cropCenterX));
            cropCenterY = Math.max(size / 2, Math.min(cropImage.naturalHeight - size / 2, cropCenterY));
        };
        const drawCrop = () => {
            if (!cropImage?.naturalWidth || !cropImage?.naturalHeight) return;
            clampCrop();
            const size = cropBaseSize / cropZoomValue;
            const sx = cropCenterX - size / 2;
            const sy = cropCenterY - size / 2;
            ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
            ctx.drawImage(cropImage, sx, sy, size, size, 0, 0, cropCanvas.width, cropCanvas.height);
            $("#photoCropZoomValue").textContent = `${cropZoomValue.toFixed(1).replace(/\.0$/, "")}×`;
        };
        cropZoom.addEventListener("input", () => {
            cropZoomValue = Number(cropZoom.value) || 1;
            drawCrop();
        });
        cropCanvas.addEventListener("pointerdown", (event) => {
            if (!cropImage?.naturalWidth) return;
            cropDrag = { x: event.clientX, y: event.clientY };
            cropCanvas.setPointerCapture?.(event.pointerId);
            cropCanvas.classList.add("is-dragging");
        });
        cropCanvas.addEventListener("pointermove", (event) => {
            if (!cropDrag || !cropImage?.naturalWidth) return;
            const rect = cropCanvas.getBoundingClientRect();
            const size = cropBaseSize / cropZoomValue;
            cropCenterX -= (event.clientX - cropDrag.x) * size / Math.max(1, rect.width);
            cropCenterY -= (event.clientY - cropDrag.y) * size / Math.max(1, rect.height);
            cropDrag = { x: event.clientX, y: event.clientY };
            drawCrop();
        });
        const endDrag = () => { cropDrag = null; cropCanvas.classList.remove("is-dragging"); };
        cropCanvas.addEventListener("pointerup", endDrag);
        cropCanvas.addEventListener("pointercancel", endDrag);
        cropCanvas.addEventListener("lostpointercapture", endDrag);
        $$CropCancel(cropDialog).forEach((button) => button.addEventListener("click", () => cropDialog.close("cancel")));
        $("#photoCropConfirm").addEventListener("click", () => {
            try {
                const output = document.createElement("canvas");
                output.width = MAX_PHOTO_PX;
                output.height = MAX_PHOTO_PX;
                const out = output.getContext("2d");
                const size = cropBaseSize / cropZoomValue;
                out.drawImage(cropImage, cropCenterX - size / 2, cropCenterY - size / 2, size, size, 0, 0, output.width, output.height);
                cropSourceResult = output.toDataURL("image/jpeg", 0.9);
                cropDialog.close("crop");
            } catch (error) {
                console.error("Photo crop failed", error);
                alert("This image could not be cropped. Try another image format.");
            }
        });
        cropDialog.addEventListener("close", () => {
            if (cropUrl) URL.revokeObjectURL(cropUrl);
            cropUrl = null;
            if (cropResolve) {
                const resolve = cropResolve;
                cropResolve = null;
                resolve(cropDialog.returnValue === "crop" ? cropSourceResult : null);
            }
            cropSourceResult = null;
            cropDrag = null;
            cropCanvas.classList.remove("is-dragging");
        });
        cropImage.onload = () => {
            cropBaseSize = Math.min(cropImage.naturalWidth, cropImage.naturalHeight);
            cropCenterX = cropImage.naturalWidth / 2;
            cropCenterY = cropImage.naturalHeight / 2;
            cropZoomValue = 1;
            cropZoom.value = "1";
            cropDialog.returnValue = "";
            drawCrop();
            cropDialog.showModal();
        };
        cropImage.onerror = () => {
            if (cropUrl) URL.revokeObjectURL(cropUrl);
            cropUrl = null;
            const resolve = cropResolve;
            cropResolve = null;
            if (resolve) resolve(null);
            setError($("#profileImgInput"), "This file could not be read as an image.");
        };
    }

    // Tiny local helper avoids relying on a global selector utility beyond this closure.
    function $$CropCancel(root) {
        return [...root.querySelectorAll("[data-crop-cancel]")];
    }

    function cropImageFile(file) {
        ensureCropper();
        return new Promise((resolve) => {
            if (cropUrl) URL.revokeObjectURL(cropUrl);
            cropResolve = resolve;
            cropSourceResult = null;
            cropUrl = URL.createObjectURL(file);
            cropImage.src = cropUrl;
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
            const cropped = await cropImageFile(file);
            if (cropped) {
                setPhoto(cropped);
                scheduleSave();
            }
        } catch (err) {
            console.error(err);
            setError(event.target, "This image could not be processed. Please try a different file.");
        } finally {
            event.target.value = "";
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
            const step = errors[0].closest(".wizard-step");
            if (step) setWizardStep(Number(step.dataset.wizardIndex), false);
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
        if (previewsLoaded) return;
        previewsLoaded = true;
        saveNow(); // previews read the stored data, so flush it first
        const stamp = Date.now();
        cards.forEach(({ frame, id }) => (frame.src = `resume.html?preview=1&t=${id}&_=${stamp}`));
    }

    setupWizard();
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
        // Enter in a text field should advance the wizard, not skip directly to the viewer.
        if (wizardIndex < wizardSteps.length) {
            if (!validateStep(wizardIndex)) return;
            saveNow();
            setWizardStep(wizardIndex + 1);
            return;
        }
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
        new IntersectionObserver((entries, observer) => {
            if (entries.some((e) => e.isIntersecting)) {
                loadPreviews();
                observer.disconnect();
            }
        }, { rootMargin: "200px" }).observe($("#formSec"));
    } else {
        loadPreviews();
    }
})();
