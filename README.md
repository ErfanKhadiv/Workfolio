# Workfolio

A free, browser-based resume builder. Fill in a form, pick one of **five templates**, restyle it live, and download a PDF.
Built with **vanilla JavaScript, HTML and CSS** - no frameworks, no build step, no backend.

> Your data never leaves your browser. Everything is stored in `localStorage`.

## Features

**Content**
- Personal info, links (LinkedIn, GitHub, portfolio), summary and optional profile photo
- Repeatable sections: education (GPA, details), experience (achievement bullets), projects, skills, languages (with certificate such as IELTS), certifications and awards
- Interests, with validation and inline error messages
- Autosaved draft that survives reloads (and migrates data saved by older versions)

**Design**
- 5 templates: Classic (ATS-friendly), Sidebar, Banner, Minimal, Executive
- Live template previews that use *your* data
- Accent color picker, font choice, skill style (bars / stars / tags), spacing and paper size (A4 / US Letter)
- Show / hide and re-order any section; hide photo or age
- Page counter that tells you when the resume spills onto a second page

**Services**
- Resume-strength score with concrete tips
- Download PDF (html2pdf.js) or print
- Plain-text export for application forms and ATS
- JSON export / import for backups and moving between devices
- One-click sample data to explore the templates

**Quality**
- All user text is inserted with `textContent` (no HTML injection) and links are restricted to `http(s)`
- Responsive, keyboard-accessible, labelled form fields

## Run it locally

No install needed. Serve the folder (recommended, because browsers treat `file://` storage differently):

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Project structure

```
Workfolio/
├── index.html              # landing page + form + template picker
├── resume.html             # resume viewer with the design panel and exports
└── assets/
    ├── css/
    │   ├── style.css       # landing page / form
    │   ├── viewer.css      # design panel layout and print rules
    │   └── resume.css      # the resume itself: shared base + 5 templates
    ├── js/
    │   ├── core.js         # data model, migration, sample data, score, text export
    │   ├── render.js       # builds the resume DOM from the data
    │   ├── index.js        # form logic, validation, autosave, previews
    │   └── viewer.js       # design panel, PDF / print / export
    └── imgs/
```

## How it works

1. `index.js` collects the form into one JSON object (`core.js` normalises and saves it).
2. `resume.html` loads it, `render.js` builds the resume, and `viewer.js` applies design changes live.
3. A template is just a CSS block (`.tpl-N` in `resume.css`), so adding one needs no extra JavaScript.

## Tech

JavaScript (ES2020) - HTML5 - CSS3 - [Font Awesome Free](https://fontawesome.com) - [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) - Google Fonts (Inter, Lora, Poppins)

## Author

**Erfan Khadiv** - [GitHub](https://github.com/ErfanKhadiv) - [LinkedIn](https://www.linkedin.com/in/erfan-khadiv-777a66279/)

## License

[MIT](LICENSE)
