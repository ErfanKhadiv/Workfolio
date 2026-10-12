/* Workfolio - AI Job Match engine
 *
 * Compares a resume with a job description entirely in the browser.
 *
 *  - Semantic layer: sentence embeddings (all-MiniLM-L6-v2 through Transformers.js,
 *    loaded lazily from a CDN) + cosine similarity between every job requirement
 *    and every piece of the resume.
 *  - Keyword layer: skill dictionary + frequent-term extraction, so the tool still
 *    works (and explains itself) when the model cannot be downloaded.
 *  - Fallback: TF-IDF cosine similarity when no embedding model is available.
 *
 * Nothing is uploaded: the model is downloaded once, then runs locally.
 * The module has no DOM dependency, so it can be unit-tested in Node.
 */
(function (root) {
    "use strict";

    const MODEL = "Xenova/all-MiniLM-L6-v2";
    const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";

    // Raw cosine thresholds. MiniLM scores related sentences around 0.45-0.75 and
    // unrelated ones below ~0.2; TF-IDF scores are lower because they need word overlap.
    const THRESHOLDS = {
        semantic: { strong: 0.5, partial: 0.32, floor: 0.15, ceil: 0.6 },
        keyword: { strong: 0.28, partial: 0.18, floor: 0.05, ceil: 0.45 },
    };
    const MAX_REQUIREMENTS = 40;
    const MIN_JD_WORDS = 15;

    // ---------- text helpers ----------
    const str = (v) => (v === undefined || v === null ? "" : String(v));
    const clamp01 = (x) => Math.max(0, Math.min(1, x));

    const STOP = new Set((
        "a about above after again all also am an and any are as at be because been before being below between both but by " +
        "can could did do does doing down during each few for from further had has have having he her here hers him his how " +
        "i if in into is it its itself just me more most my no nor not of off on once only or other our ours out over own same " +
        "she should so some such than that the their theirs them then there these they this those through to too under until up " +
        "very was we were what when where which while who whom why will with would you your yours yourself"
    ).split(" "));

    // words that appear in nearly every job posting and say nothing about fit
    const NOISE = new Set((
        "ability able across additional apply applicant applicants background benefit benefits bonus candidate candidates company " +
        "competitive culture degree description diverse duties environment equal etc excellent experience experienced exciting " +
        "following full good great growth help helping highly ideal include includes including individual join joining job " +
        "knowledge looking maintain make must need needs new offer opportunity part passion passionate people please plus " +
        "position preferred proven qualification qualifications required requirement requirements responsibilities responsibility " +
        "responsible role salary seeking skill skills solid strong successful team teams time understanding use used using " +
        "want way well within work working world year years you'll we're " +
        "build building maintain improve ensure support create deliver drive provide collaborate"
    ).split(" "));

    function tokenize(text) {
        const found = str(text).toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) || [];
        return found.map((t) => t.replace(/\.+$/, "")).filter(Boolean);
    }

    // very small suffix stripper, applied to both sides so it only has to be consistent
    function stem(word) {
        let w = word;
        if (w.length <= 3 || /[0-9+#.]/.test(w)) return w;
        if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
        else if (/(sses|xes|ches|shes)$/.test(w)) w = w.slice(0, -2);
        else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
        if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
        else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
        if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
        return w;
    }

    const stems = (text) => tokenize(text).map(stem);

    // ---------- skill dictionary ----------
    // "Display|alias|alias": the display name is also an alias.
    // "Display::alias|alias": explicit aliases only (for words that are common in plain English).
    const SKILL_GROUPS = {
        "Programming": [
            "JavaScript|js|ecmascript|es6", "TypeScript|ts", "Python|python3", "Java", "C++|cpp", "C#|csharp|c sharp",
            "Go::golang|go lang", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "Scala", "MATLAB", "Bash|shell scripting",
            "SQL", "Dart", "R::r language|rstats", "Perl",
        ],
        "Web": [
            "HTML|html5", "CSS|css3", "React|react.js|reactjs", "Next.js|nextjs", "Vue|vue.js|vuejs", "Angular|angularjs",
            "Svelte", "Redux", "Tailwind|tailwindcss", "Bootstrap", "Sass|scss", "jQuery", "Webpack", "Vite",
            "Responsive design|responsive web", "Accessibility|a11y|wcag", "REST APIs::rest api|restful|restful api|rest",
            "GraphQL", "WebSockets|websocket", "PWA|progressive web app", "SEO", "Frontend|front end|front-end",
            "Backend|back end|back-end", "Full stack|fullstack|full-stack",
        ],
        "Backend": [
            "Node.js|nodejs|node", "Express::express.js|expressjs|express js", "Django", "Flask", "FastAPI",
            "Spring Boot::spring boot|springboot|spring framework", "ASP.NET|asp.net|dotnet", "Laravel",
            "Ruby on Rails|rails", "Microservices", "API design",
        ],
        "Databases": [
            "MySQL", "PostgreSQL|postgres", "MongoDB|mongo", "Redis", "SQLite", "Oracle::oracle database|oracle db",
            "Elasticsearch", "Firebase", "DynamoDB", "NoSQL",
        ],
        "Cloud & DevOps": [
            "AWS|amazon web services", "Azure", "GCP|google cloud", "Docker", "Kubernetes|k8s", "Terraform",
            "CI/CD|ci cd|continuous integration", "Jenkins", "GitHub Actions", "GitLab CI", "Linux", "Nginx", "Ansible",
            "DevOps", "Serverless",
        ],
        "Data & AI": [
            "Machine learning|ml", "Deep learning", "Artificial intelligence|ai", "NLP|natural language processing",
            "Computer vision", "TensorFlow", "PyTorch", "Keras", "scikit-learn|sklearn|scikit learn", "Pandas", "NumPy",
            "Matplotlib", "Data analysis|data analytics", "Data science", "Data visualization|data visualisation",
            "Tableau", "Power BI|powerbi", "Excel", "Spark|apache spark", "Hadoop", "ETL", "LLMs|llm|large language model",
            "Generative AI|genai|gen ai", "Transformers::transformer models|transformer architecture|hugging face transformers",
            "Hugging Face|huggingface", "Reinforcement learning", "Statistics|statistical analysis", "OpenCV", "Jupyter",
            "RAG|retrieval augmented generation", "Prompt engineering", "MLOps", "Optimization|optimisation",
        ],
        "Engineering practice": [
            "Algorithms", "Data structures", "OOP|object oriented|object-oriented", "Design patterns", "Git", "GitHub",
            "GitLab", "Jira", "Agile", "Scrum", "Kanban", "Unit testing|unit tests", "Jest", "Pytest", "Cypress", "Selenium",
            "TDD|test driven development", "Code review|code reviews", "Version control", "Figma", "Postman",
        ],
        "Mobile": ["Android", "iOS", "React Native", "Flutter", "SwiftUI"],
        "Language tests": ["IELTS", "TOEFL", "Duolingo English Test|duolingo", "GRE", "GMAT"],
        "Soft skills": [
            "Communication", "Teamwork|collaboration|collaborative", "Leadership", "Mentoring|mentorship",
            "Problem solving|problem-solving", "Time management", "Stakeholder management|stakeholders",
            "Project management", "Presentation skills|presentation", "Critical thinking", "Adaptability|adaptable",
            "Ownership",
        ],
    };

    const SKILLS = [];
    const SKILL_INDEX = new Map(); // "stem stem" -> skill id
    let SKILL_MAX_N = 1;
    Object.entries(SKILL_GROUPS).forEach(([group, entries]) => {
        entries.forEach((entry) => {
            let display;
            let aliases;
            if (entry.includes("::")) {
                [display, aliases] = entry.split("::");
                aliases = aliases.split("|");
            } else {
                const parts = entry.split("|");
                display = parts[0];
                aliases = parts;
            }
            const id = SKILLS.length;
            SKILLS.push({ id, name: display, group, soft: group === "Soft skills", exam: group === "Language tests" });
            aliases.forEach((alias) => {
                const key = stems(alias).join(" ");
                if (!key) return;
                SKILL_INDEX.set(key, id);
                SKILL_MAX_N = Math.max(SKILL_MAX_N, key.split(" ").length);
            });
        });
    });

    // returns Map(skillId -> { count, positions:Set })
    function findSkills(stemSeq) {
        const hits = new Map();
        for (let i = 0; i < stemSeq.length; i++) {
            for (let n = Math.min(SKILL_MAX_N, stemSeq.length - i); n >= 1; n--) {
                const id = SKILL_INDEX.get(stemSeq.slice(i, i + n).join(" "));
                if (id === undefined) continue;
                const hit = hits.get(id) || { count: 0, positions: new Set() };
                hit.count++;
                for (let k = i; k < i + n; k++) hit.positions.add(k);
                hits.set(id, hit);
                i += n - 1;
                break;
            }
        }
        return hits;
    }

    // ---------- job description parsing ----------
    const HEADING = /^(about|who we are|what you|what we|responsibilities|requirements|qualifications|nice to have|benefits|perks|why join|why you|the role|job description|overview|our team|how to apply|key )/i;
    const BOILERPLATE = /equal opportunity|we offer|health insurance|paid (time off|vacation|leave)|401\(k\)|apply (now|today|here)|salary range|relocation|drug test|background check|reasonable accommodation|our mission|who we are|follow us|visa sponsor/i;

    function splitRequirements(jd) {
        const out = [];
        const seen = new Set();
        const push = (text) => {
            const clean = text.replace(/\s+/g, " ").trim();
            const words = clean.split(" ").length;
            const key = clean.toLowerCase();
            if (words < 3 || words > 60 || seen.has(key)) return;
            if (BOILERPLATE.test(clean)) return;
            if (words <= 6 && (clean.endsWith(":") || HEADING.test(clean))) return;
            seen.add(key);
            out.push(clean.replace(/[:;,]+$/, ""));
        };
        str(jd).replace(/\r/g, "").split("\n").forEach((raw) => {
            const line = raw.replace(/^\s*(?:[-*\u2022\u25cf\u25aa\u25e6\u00b7\u2013\u2014]|\d+[.)])\s*/, "").trim();
            if (!line) return;
            if (line.length > 170) (line.match(/[^.!?]+[.!?]*/g) || [line]).forEach(push);
            else push(line);
        });
        return out.slice(0, MAX_REQUIREMENTS);
    }

    // ---------- resume -> chunks ----------
    const bullets = (text) => str(text).split(/\r?\n/).map((l) => l.replace(/^\s*[-*\u2022]\s*/, "").trim()).filter(Boolean);
    const DEGREES = { bachelor: "Bachelor", master: "Master", phd: "PhD", associate: "Associate" };

    // kind: summary | job | project | education | skills | cert | language | interests | skill
    // ref:  where the chunk came from, so the tailoring step can reorder it
    // evidence: false for chunks that are only used for ranking, never shown as proof
    function buildChunks(data) {
        const chunks = [];
        const add = (kind, label, text, ref, evidence) => {
            const clean = str(text).replace(/\s+/g, " ").trim();
            if (clean) chunks.push({ id: chunks.length, kind, label, text: clean.slice(0, 800), ref: ref || null, evidence: evidence !== false, rel: 0 });
        };
        const p = data.personal || {};
        add("summary", "Title", p.title, null);
        add("summary", "Summary", p.about, null);
        (data.jobs || []).forEach((job, i) => {
            const label = [job.title, job.company].filter(Boolean).join(" at ") || "Experience";
            const lines = bullets(job.description);
            if (!lines.length) add("job", label, [job.title, job.company].filter(Boolean).join(" at "), { i, j: -1 });
            lines.forEach((line, j) => add("job", label, line, { i, j }));
            if (lines.length > 1) add("job", label, [job.title, job.company, ...lines].filter(Boolean).join(". "), { i, j: -2 });
        });
        (data.projects || []).forEach((project, i) => {
            const label = project.name || "Project";
            add("project", label, [project.name, project.tech].filter(Boolean).join(" - "), { i, j: -1 });
            const lines = bullets(project.description);
            lines.forEach((line, j) => add("project", label, line, { i, j }));
            if (lines.length) add("project", label, [project.name, project.tech, ...lines].filter(Boolean).join(". "), { i, j: -2 });
        });
        (data.education || []).forEach((edu, i) => {
            const degree = DEGREES[edu.degree] || "";
            const head = [degree && edu.major ? `${degree} in ${edu.major}` : edu.major || degree, edu.university].filter(Boolean).join(", ");
            add("education", edu.university || "Education", head, { i, j: -1 });
            const details = bullets(edu.details);
            details.forEach((line, j) => add("education", edu.university || "Education", line, { i, j }));
            if (details.length) add("education", edu.university || "Education", [head, ...details].filter(Boolean).join(". "), { i, j: -2 });
        });
        const skillNames = (data.skills || []).map((s) => str(s.name).trim());
        if (skillNames.some(Boolean)) add("skills", "Skills", "Skills: " + skillNames.filter(Boolean).join(", "), null);
        skillNames.forEach((name, i) => { if (name) add("skill", name, name, { i }, false); });
        (data.certs || []).forEach((c, i) => add("cert", c.name || "Certification", [c.name, c.issuer].filter(Boolean).join(" - "), { i }));
        (data.languages || []).forEach((l, i) => {
            if (l.name) add("language", "Languages", [l.name, l.level ? `(${l.level})` : "", l.note].filter(Boolean).join(" "), { i });
        });
        if (str(p.interests).trim()) add("interests", "Interests", "Interests: " + str(p.interests).trim(), null);
        return chunks;
    }

    // ---------- keyword analysis ----------
    function keywordAnalysis(jd, resumeStemSeq) {
        const jdStems = stems(jd);
        const jdTokens = tokenize(jd);
        const jdSkills = findSkills(jdStems);
        const resumeSkills = findSkills(resumeStemSeq);
        const resumeSet = new Set(resumeStemSeq);

        const skills = [...jdSkills.entries()]
            .map(([id, hit]) => ({ ...SKILLS[id], count: hit.count, found: resumeSkills.has(id) }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        // frequent terms that are not already covered by a dictionary skill
        const covered = new Set();
        jdSkills.forEach((hit) => hit.positions.forEach((pos) => covered.add(pos)));
        const usable = (i) => {
            const t = jdTokens[i];
            return t && !covered.has(i) && t.length > 2 && !/^[0-9.]+$/.test(t) && !STOP.has(t) && !NOISE.has(t);
        };
        const uni = new Map();
        const bi = new Map();
        for (let i = 0; i < jdStems.length; i++) {
            if (!usable(i)) continue;
            const a = jdStems[i];
            const u = uni.get(a) || { stems: [a], text: jdTokens[i], count: 0 };
            u.count++;
            uni.set(a, u);
            if (usable(i + 1)) {
                const key = `${a} ${jdStems[i + 1]}`;
                const b = bi.get(key) || { stems: [a, jdStems[i + 1]], text: `${jdTokens[i]} ${jdTokens[i + 1]}`, count: 0 };
                b.count++;
                bi.set(key, b);
            }
        }
        const bigrams = [...bi.values()].filter((t) => t.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);
        const bigramStems = new Set(bigrams.flatMap((t) => t.stems));
        const unigrams = [...uni.values()].filter((t) => t.count >= 2 && !bigramStems.has(t.stems[0])).sort((a, b) => b.count - a.count).slice(0, 10);
        const terms = [...bigrams, ...unigrams]
            .sort((a, b) => b.count - a.count)
            .slice(0, 12)
            .map((t) => ({ text: t.text, count: t.count, found: t.stems.every((s) => resumeSet.has(s)) }));

        const weight = (s) => (s.soft || s.exam ? 0.5 : 1);
        const total = skills.reduce((a, s) => a + weight(s), 0);
        const hit = skills.reduce((a, s) => a + (s.found ? weight(s) : 0), 0);
        let coverage = null;
        if (total > 0) coverage = hit / total;
        else if (terms.length) coverage = terms.filter((t) => t.found).length / terms.length;
        return { skills, terms, coverage, jdStemSet: new Set(jdStems) };
    }

    // ---------- similarity ----------
    const dot = (a, b) => {
        let s = 0;
        for (let i = 0; i < a.length; i++) s += a[i] * b[i];
        return s;
    };

    function tfidfVectors(texts) {
        const docs = texts.map((t) => stems(t).filter((s, i) => s.length > 1 && !STOP.has(tokenize(t)[i])));
        const df = new Map();
        docs.forEach((d) => new Set(d).forEach((s) => df.set(s, (df.get(s) || 0) + 1)));
        const n = docs.length;
        return docs.map((d) => {
            const tf = new Map();
            d.forEach((s) => tf.set(s, (tf.get(s) || 0) + 1));
            const vec = new Map();
            let norm = 0;
            tf.forEach((c, s) => {
                const w = (1 + Math.log(c)) * Math.log(1 + n / df.get(s));
                vec.set(s, w);
                norm += w * w;
            });
            norm = Math.sqrt(norm) || 1;
            vec.forEach((w, s) => vec.set(s, w / norm));
            return vec;
        });
    }

    const sparseDot = (a, b) => {
        const [small, big] = a.size < b.size ? [a, b] : [b, a];
        let s = 0;
        small.forEach((w, k) => { const o = big.get(k); if (o) s += w * o; });
        return s;
    };

    // Keyword mode only: words that mean nearly the same thing in a CV, so "thesis" can find a final project.
    const SYNONYMS = {
        thesis: "project manuscript dissertation", dissertation: "thesis project manuscript",
        paper: "manuscript publication journal article", publication: "manuscript paper journal",
        manuscript: "paper publication journal", research: "manuscript study publication",
        publish: "manuscript submitted journal", scientific: "research academic manuscript",
        independent: "sole author", independently: "sole author", handson: "implemented built developed",
        "hands-on": "implemented built developed practical", project: "implemented built developed",
        teamwork: "collaborat team", certificate: "certification certified course",
        degree: "bachelor master graduate", graduate: "bachelor degree",
    };
    function expandForKeywords(text) {
        const extra = tokenize(text).map((t) => SYNONYMS[t]).filter(Boolean);
        return extra.length ? `${text} ${extra.join(" ")}` : text;
    }

    // Both signals are used whenever possible: the embedding model understands meaning, TF-IDF catches
    // exact words. A requirement counts as supported if either one finds good evidence in the resume.
    async function similarity(chunks, reqs, embed) {
        const vectors = tfidfVectors([...chunks.map((c) => c.text), ...reqs.map(expandForKeywords)]);
        const chunkVecs = vectors.slice(0, chunks.length);
        const reqVecs = vectors.slice(chunks.length);
        const lex = (q, c) => sparseDot(reqVecs[q], chunkVecs[c]);
        let sem = null;
        if (embed) {
            const [C, Q] = await Promise.all([embed(chunks.map((c) => c.text)), embed(reqs)]);
            sem = (q, c) => dot(Q[q], C[c]);
        }
        return { sem, lex };
    }

    // Scores are compared as a ratio to each signal's "strong" threshold: >= 1 strong, >= 0.64 partial.
    const RATIO = { strong: 1, partial: 0.64, floor: 0.25, ceil: 1.4 };

    // Things a requirement can ask for that are not skills, and the words a resume uses to show them.
    const CONCEPTS = [
        { ask: /\b(papers?|manuscripts?|publications?|journals?|publish(?:ed|ing)?|thesis|dissertation|scientific)\b/i,
          have: /\b(manuscripts?|journal|springer|ieee|acm|published|publications?|papers?|thesis|dissertation|research report)\b/gi },
        { ask: /\b(research|thesis|dissertation)\b/i,
          have: /\b(research|manuscripts?|thesis|dissertation|final project|experiments?|evaluated|benchmark\w*)\b/gi },
        { ask: /\bhands-on\b|\b(personal|academic|independent|real-world|relevant|technical)\s+projects?\b|\bproject experience\b/i,
          have: /\b(projects?|implemented|designed|built|developed)\b/gi },
    ];
    // Soft skills are rarely written out on a CV, so a missing match is "hard to show", not a gap.
    const SOFT_REQ = /\b(work (?:independently|in a team|well with others)|team player|self-motivated|problem[- ]solving|communication skills|interpersonal)\b/i;
    // The skills list and interests line are only evidence for requirements that talk about skills or interests.
    const AGGREGATE_OK = /\b(skills?|knowledge|proficien\w*|familiar\w*|tools?|technolog\w*|interest\w*|topics?|areas?|fields?)\b/i;
    const isAggregate = (c) => c.kind === "skills" || c.kind === "interests" || c.kind === "skill";

    // ---------- main entry ----------
    async function analyze(data, jdText, options) {
        const opts = options || {};
        const embed = opts.embed || null;
        const jd = str(jdText).trim();
        if (jd.split(/\s+/).filter(Boolean).length < MIN_JD_WORDS) {
            throw new Error("Paste a longer job description (at least a few sentences).");
        }

        let reqs = splitRequirements(jd);
        if (!reqs.length) reqs = [jd.replace(/\s+/g, " ").slice(0, 600)];
        const chunks = buildChunks(data);
        if (!chunks.length) throw new Error("Your resume is empty. Fill in your details first.");

        const mode = embed ? "semantic" : "keyword";
        const resumeStemSeq = stems(chunks.filter((c) => c.kind !== "skill").map((c) => `${c.label} ${c.text}`).join("\n"));
        const kw = keywordAnalysis(jd, resumeStemSeq);
        const { sem, lex } = await similarity(chunks, reqs, embed);
        const ratioOf = (q, c) => Math.max(sem ? sem(q, c) / THRESHOLDS.semantic.strong : 0, lex(q, c) / THRESHOLDS.keyword.strong);

        const evidenceIdx = chunks.filter((c) => c.evidence).map((c) => c.id);
        const resumeSkillIds = new Set(findSkills(resumeStemSeq).keys());
        const skillCache = new Map();
        const skillsIn = (c) => {
            if (!skillCache.has(c)) skillCache.set(c, new Set(findSkills(stems(`${chunks[c].label} ${chunks[c].text}`)).keys()));
            return skillCache.get(c);
        };
        const toEvidence = (c) => ({ label: c.label, text: c.text, kind: c.kind });

        const requirements = reqs.map((text, q) => {
            const named = [...findSkills(stems(text)).keys()];
            const hardNamed = named.filter((id) => !SKILLS[id].soft);
            const pool = evidenceIdx.filter((c) => AGGREGATE_OK.test(text) || hardNamed.length || !isAggregate(chunks[c]));

            let best = -1;
            let bestIdx = pool[0];
            pool.forEach((c) => {
                const r = ratioOf(q, c);
                if (r > best) { best = r; bestIdx = c; }
            });

            // skills or exams the requirement names and that appear anywhere in the resume
            if (hardNamed.length) {
                const have = hardNamed.filter((id) => resumeSkillIds.has(id)).length / hardNamed.length;
                const credit = RATIO.partial + (RATIO.strong - RATIO.partial) * have;
                if (have > 0 && credit > best) {
                    best = credit;
                    // show the line that really contains those skills (a precise line beats the skills list)
                    let top = null;
                    pool.forEach((c) => {
                        const ch = chunks[c];
                        if (ch.ref && ch.ref.j === -2) return;
                        const n = hardNamed.filter((id) => skillsIn(c).has(id)).length;
                        const rank = n * 2 + (isAggregate(ch) ? 0 : 1);
                        if (n && (!top || rank > top.rank)) top = { rank, c };
                    });
                    if (top) bestIdx = top.c;
                }
            }
            // papers, research, hands-on projects: look for the words that show them in any single entry
            CONCEPTS.forEach((k) => {
                if (!k.ask.test(text)) return;
                let top = null;
                pool.forEach((c) => {
                    const ch = chunks[c];
                    if (isAggregate(ch) || (ch.ref && ch.ref.j === -2)) return;
                    const n = new Set((ch.text.toLowerCase().match(k.have) || [])).size;
                    if (n && (!top || n > top.n || (n === top.n && ratioOf(q, c) > ratioOf(q, top.c)))) top = { n, c };
                });
                if (top) {
                    const credit = top.n >= 2 ? RATIO.strong : 0.85;
                    if (credit > best) { best = credit; bestIdx = top.c; }
                }
            });

            let level = best >= RATIO.strong ? "strong" : best >= RATIO.partial ? "partial" : "gap";
            if (level === "gap" && (SOFT_REQ.test(text) || (named.length > 0 && hardNamed.length === 0))) level = "soft";

            // when a whole entry wins, show the single line inside it that fits best
            let evIdx = bestIdx;
            const won = chunks[bestIdx];
            if (won.ref && won.ref.j === -2) {
                let top = -1;
                chunks.forEach((c) => {
                    if (c.evidence && c.kind === won.kind && c.label === won.label && c.ref && c.ref.i === won.ref.i && c.ref.j >= 0) {
                        const r = ratioOf(q, c.id);
                        if (r > top) { top = r; evIdx = c.id; }
                    }
                });
            }
            // a second source from a different part of the resume
            let second = null;
            pool.forEach((c) => {
                const ch = chunks[c];
                if (ch.label === chunks[evIdx].label || (ch.ref && ch.ref.j === -2)) return;
                const r = ratioOf(q, c);
                if (r >= RATIO.partial && (!second || r > second.r)) second = { r, c };
            });

            const score = level === "soft" ? 0.5 : clamp01((best - RATIO.floor) / (RATIO.ceil - RATIO.floor));
            return { text, sim: best, score, level, evidence: toEvidence(chunks[evIdx]), also: second ? toEvidence(chunks[second.c]) : null };
        });

        // how relevant each chunk is to the posting (used to reorder bullets and skills)
        chunks.forEach((c) => {
            let best = 0;
            for (let q = 0; q < reqs.length; q++) best = Math.max(best, ratioOf(q, c.id));
            c.rel = best;
        });

        const fit = requirements.reduce((a, r) => a + r.score, 0) / requirements.length;
        const parts = kw.coverage === null ? [[fit, 1]] : [[fit, mode === "semantic" ? 0.6 : 0.5], [kw.coverage, mode === "semantic" ? 0.4 : 0.5]];
        const overall = Math.round((parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0)) * 100);

        const analysis = {
            mode,
            overall,
            fit: Math.round(fit * 100),
            coverage: kw.coverage === null ? null : Math.round(kw.coverage * 100),
            requirements,
            skills: kw.skills,
            terms: kw.terms,
            chunks,
            jdStemSet: kw.jdStemSet,
        };
        analysis.suggestions = suggestions(analysis);
        return analysis;
    }

    function suggestions(a) {
        const out = [];
        const missing = a.skills.filter((s) => !s.found && !s.soft && !s.exam).slice(0, 6).map((s) => s.name);
        if (missing.length) {
            out.push(`The posting mentions ${missing.join(", ")}, which your resume does not. Add one only if you really have that experience: list it under Skills or work it into a bullet that shows how you used it.`);
        }
        const gaps = a.requirements.filter((r) => r.level === "gap").sort((x, y) => x.sim - y.sim).slice(0, 3);
        gaps.forEach((r) => out.push(`No clear evidence for: "${r.text}". If you have done something like this, add a bullet with what you did, the tools you used and the result.`));
        const summary = a.chunks.find((c) => c.label === "Summary");
        if (!summary) out.push("Add a short summary that names the kind of role you are targeting; it is the first thing a recruiter and an ATS read.");
        else if (summary.rel < RATIO.partial) out.push("Your summary does not echo this role. Mention the field or role type from the posting in the first sentence, using your own honest wording.");
        if (a.requirements.some((r) => r.level === "soft")) out.push("Soft skills such as problem-solving or teamwork are hard to prove from a CV by keywords. Show them through a concrete example inside a project or job bullet (what the problem was, whether you worked alone or with others, and the outcome).");
        if (a.overall >= 75 && !out.length) out.push("Strong match. Use Tailor to put your most relevant bullets and skills first.");
        return out.slice(0, 6);
    }

    // ---------- tailoring (reorder only; text is never rewritten) ----------
    const stableSortDesc = (items, key) => items.map((item, i) => ({ item, i, k: key(item) })).sort((a, b) => b.k - a.k || a.i - b.i);

    function planTailor(data, analysis) {
        const rel = new Map();
        analysis.chunks.forEach((c) => {
            if (c.ref && (c.kind === "job" || c.kind === "project") && c.ref.j >= 0) rel.set(`${c.kind}:${c.ref.i}:${c.ref.j}`, c.rel);
        });
        const orderLines = (kind, items) => items.map((entry, i) => {
            const lines = bullets(entry.description);
            const ranked = stableSortDesc(lines.map((text, j) => ({ text, j })), (l) => rel.get(`${kind}:${i}:${l.j}`) || 0);
            return { lines: ranked.map((r) => r.item.text), moved: ranked.some((r, pos) => r.item.j !== pos) };
        });
        const jobs = orderLines("job", data.jobs || []);
        const projects = orderLines("project", data.projects || []);

        const skillRel = new Map();
        analysis.chunks.filter((c) => c.kind === "skill").forEach((c) => skillRel.set(c.ref.i, c.rel));
        const skillScore = (skill, i) => {
            const own = stems(skill.name);
            const inPosting = own.length > 0 && own.every((s) => analysis.jdStemSet.has(s));
            return (inPosting ? 1 : 0) + (skillRel.get(i) || 0);
        };
        const skills = stableSortDesc((data.skills || []).map((s, i) => ({ s, i })), (x) => skillScore(x.s, x.i));
        const skillOrder = skills.map((r) => r.item.i);
        const skillsMoved = skillOrder.some((idx, pos) => idx !== pos);

        return {
            jobs, projects, skillOrder,
            changed: skillsMoved || jobs.some((j) => j.moved) || projects.some((p) => p.moved),
        };
    }

    // snapshot = what is needed to undo; kept small on purpose
    function snapshot(data) {
        return {
            skills: (data.skills || []).map((s) => ({ ...s })),
            jobs: (data.jobs || []).map((j) => str(j.description)),
            projects: (data.projects || []).map((p) => str(p.description)),
        };
    }

    function signature(data) {
        const s = snapshot(data);
        return JSON.stringify([s.skills.map((x) => x.name + "|" + x.rate), s.jobs, s.projects]);
    }

    function applyTailor(data, plan) {
        const before = snapshot(data);
        data.skills = plan.skillOrder.map((i) => before.skills[i]);
        plan.jobs.forEach((j, i) => { if (j.moved && data.jobs[i]) data.jobs[i].description = j.lines.join("\n"); });
        plan.projects.forEach((p, i) => { if (p.moved && data.projects[i]) data.projects[i].description = p.lines.join("\n"); });
        return before;
    }

    function restore(data, before) {
        data.skills = before.skills.map((s) => ({ ...s }));
        before.jobs.forEach((d, i) => { if (data.jobs[i]) data.jobs[i].description = d; });
        before.projects.forEach((d, i) => { if (data.projects[i]) data.projects[i].description = d; });
    }

    // ---------- browser-only: load the embedding model ----------
    let embedderPromise = null;

    function loadEmbedder(onProgress) {
        if (embedderPromise) return embedderPromise;
        embedderPromise = (async () => {
            const mod = await import(TRANSFORMERS_URL);
            mod.env.allowLocalModels = false;
            mod.env.useBrowserCache = true;
            const files = {};
            const extractor = await mod.pipeline("feature-extraction", MODEL, {
                quantized: true,
                progress_callback: (p) => {
                    if (p && p.status === "progress" && p.file && onProgress) {
                        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
                        const all = Object.values(files);
                        const total = all.reduce((a, f) => a + f.total, 0);
                        if (total) onProgress(all.reduce((a, f) => a + f.loaded, 0) / total);
                    }
                },
            });
            const cache = new Map();
            return async function embed(texts) {
                const out = new Array(texts.length);
                const todo = [];
                texts.forEach((t, i) => { const hit = cache.get(t); if (hit) out[i] = hit; else todo.push(i); });
                for (let s = 0; s < todo.length; s += 16) {
                    const idx = todo.slice(s, s + 16);
                    const res = await extractor(idx.map((i) => texts[i]), { pooling: "mean", normalize: true });
                    const rows = res.tolist();
                    idx.forEach((i, k) => { out[i] = rows[k]; cache.set(texts[i], rows[k]); });
                }
                return out;
            };
        })();
        embedderPromise.catch(() => { embedderPromise = null; }); // allow a retry after a failed download
        return embedderPromise;
    }

    const api = {
        MODEL, SKILLS, THRESHOLDS,
        tokenize, stem, splitRequirements, buildChunks, keywordAnalysis,
        analyze, planTailor, applyTailor, restore, snapshot, signature, loadEmbedder,
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    root.WorkfolioAI = api;
})(typeof window !== "undefined" ? window : globalThis);
