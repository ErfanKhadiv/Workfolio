/* Workfolio - Excel (.xlsx) export
 * One sheet per resume section (Personal, Education, Experience, Projects, Skills,
 * Languages, Certifications). Handy for tracking applications, sharing the raw
 * data or importing it somewhere else. Built in the browser, nothing is uploaded.
 */
(function (root) {
    "use strict";

    const W = root.Workfolio;
    const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
    // eslint-disable-next-line no-control-regex
    const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
    const esc = (v) => String(v ?? "").replace(BAD_XML, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    function colName(i) {
        let n = i + 1;
        let s = "";
        while (n > 0) {
            const m = (n - 1) % 26;
            s = String.fromCharCode(65 + m) + s;
            n = Math.floor((n - 1) / 26);
        }
        return s;
    }

    function sheetXml(columns, rows) {
        const cols = `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join("")}</cols>`;
        const cell = (v, ref, style, numeric) => {
            if (numeric && /^\d+(\.\d+)?$/.test(String(v))) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
            if (v === "" || v === undefined || v === null) return `<c r="${ref}" s="${style}"/>`;
            return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
        };
        const header = `<row r="1" ht="22" customHeight="1">${columns.map((c, i) => cell(c.title, `${colName(i)}1`, 1)).join("")}</row>`;
        const body = rows
            .map((r, ri) => `<row r="${ri + 2}">${columns.map((c, i) => cell(r[i], `${colName(i)}${ri + 2}`, 2, c.numeric)).join("")}</row>`)
            .join("");
        return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${header}${body}</sheetData></worksheet>`;
    }

    function buildXlsx(d) {
        const p = d.personal;
        const accent = d.settings.accent.replace("#", "").toUpperCase();
        const dash = (v) => v || "";

        const sheets = [
            {
                name: "Personal",
                columns: [{ title: "Field", width: 22 }, { title: "Value", width: 70 }],
                rows: [
                    ["First name", p.firstName], ["Last name", p.lastName], ["Professional title", p.title], ["Age", p.age],
                    ["Email", p.email], ["Phone", p.phone], ["Address / location", p.address], ["LinkedIn", p.linkedin],
                    ["GitHub", p.github], ["Website", p.website], ["Summary", p.about], ["Interests", p.interests],
                ],
            },
            {
                name: "Education",
                columns: [{ title: "Degree", width: 14 }, { title: "Major", width: 28 }, { title: "University", width: 34 }, { title: "From", width: 12 }, { title: "To", width: 12 }, { title: "GPA / Grade", width: 14 }, { title: "Details", width: 40 }],
                rows: d.education.filter((e) => e.university || e.major).map((e) => [W.degreeLabel(e.degree), e.major, e.university, W.formatMonth(e.from), e.to ? W.formatMonth(e.to) : e.from ? "Present" : "", e.gpa, W.bullets(e.details).join("\n")]),
            },
            {
                name: "Experience",
                columns: [{ title: "Job title", width: 26 }, { title: "Company", width: 26 }, { title: "Location", width: 18 }, { title: "From", width: 12 }, { title: "To", width: 12 }, { title: "Achievements", width: 70 }],
                rows: d.jobs.filter((j) => j.title || j.company).map((j) => [j.title, j.company, j.location, W.formatMonth(j.from), j.to ? W.formatMonth(j.to) : j.from ? "Present" : "", W.bullets(j.description).join("\n")]),
            },
            {
                name: "Projects",
                columns: [{ title: "Project", width: 26 }, { title: "Link", width: 34 }, { title: "Technologies", width: 28 }, { title: "Description", width: 70 }],
                rows: d.projects.filter((x) => x.name).map((x) => [x.name, x.link, x.tech, W.bullets(x.description).join("\n")]),
            },
            {
                name: "Skills",
                columns: [{ title: "Skill", width: 30 }, { title: "Rating (1-5)", width: 14, numeric: true }],
                rows: d.skills.filter((x) => x.name).map((x) => [x.name, x.rate]),
            },
            {
                name: "Languages",
                columns: [{ title: "Language", width: 24 }, { title: "Level", width: 16 }, { title: "Certificate", width: 24 }],
                rows: d.languages.filter((x) => x.name).map((x) => [x.name, W.levelLabel(x.level), dash(x.note)]),
            },
            {
                name: "Certifications",
                columns: [{ title: "Name", width: 36 }, { title: "Issued by", width: 30 }, { title: "Date", width: 14 }],
                rows: d.certs.filter((c) => c.name).map((c) => [c.name, c.issuer, W.formatMonth(c.date)]),
            },
        ];

        const stylesXml = `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${accent}"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

        const workbook = `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL_NS}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
        const wbRels = `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
        const types = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

        return W.zip(
            [
                { name: "[Content_Types].xml", data: types },
                { name: "_rels/.rels", data: `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
                { name: "xl/workbook.xml", data: workbook },
                { name: "xl/_rels/workbook.xml.rels", data: wbRels },
                { name: "xl/styles.xml", data: stylesXml },
                ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.columns, s.rows) })),
            ],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
    }


    root.WorkfolioExcelExport = {
        async buildBlob(data) {
            return buildXlsx(data);
        },
    };
})(window);
