# EDUC 15 course site and slides (2027)

Undergraduate *Statistics for Education Research* at UC Irvine, taught by Andreas (Andy) de Barros. Built on the EDUC 265 setup: a Quarto website built by {targets} (`targets::tar_make()`, renders into `_site/`) with {renv}, and xaringan slides.

**If `HANDOVER.md` exists, read it first.** It's a local, git-ignored file with the project status, the course history and the open decisions. We're working through this over several days, slowly, one piece at a time: check in before starting a big piece of work.

## Rules

- **Student records stay out of everything.** The old course folder holds grades, rosters, attendance, graded exams and evaluations. Don't open them, and never copy anything from them into this repo, a deck, or a chat. If a file turns out to contain student names, stop reading it and say so. `.claude/settings.local.json` blocks the known locations, but only for the Read tool.
- **Textbook figures and other third-party images are fine on slides, with a citation.** Andy has permission to use them. Cite the source on every slide that uses one. No permission check is needed. Keep the photos, comics, cartoons and illustrations from the 2024 decks: never swap one for a drawing or text to avoid using it. Only graphs of data or formulas get remade in ggplot.
- **Other publisher material stays out of the repo and the website.** Cengage test banks, instructor manuals and publisher slides don't go in tracked files or on the site. Prior instructors' materials are for reference: don't republish them.
- **Slides go on the website and on Canvas.** Each topic page embeds its deck, as on Andrew Heiss's course sites. The user also uploads the single-file HTML (the accessible version) and PDF (for printing) to Canvas. So everything in a deck is public: no exam material or solutions. All decks are released at once, not one by one.
- **The Mindspark data is public, under its own license.** `files/data/mindspark/` holds the class data, unchanged and untrimmed, and decks and labs read it from there. It's CC BY 4.0, not the site's CC BY-NC, so keep its `README.txt` with it, keep the credit and the exception in the footer, and don't put non-commercial terms on it. If you change the data, say so in that README.
- **Canvas holds what can't be public or only works there.** Cengage MindTap works only through Canvas. Grades, solutions and any book chapters stay on Canvas too.
- **`slides/` is tracked, and the repo goes public at release.** Rendered decks are tracked too (`slides/*.html`, `slides/*.pdf`, `slides/canvas/`, `slides/libs/`, `slides/*_files/`), so commit them after a rebuild. `slides/old-pptx/` stays git-ignored: the original PowerPoints can hold images nobody has checked. Don't delete anything in `slides/` without asking.
- **Accessibility is required, not optional:** WCAG 2.1 AA for the site and every deck. See below.
- **Leave `educ265-27` alone.** It's a read-only reference here, and it has uncommitted work.
- **Don't publish without being asked.** Don't change DNS (the user does that at IONOS) or create Netlify projects without asking.

## Building

Run commands from the project root. Outside RStudio, set `RSTUDIO_PANDOC="C:/Program Files/Quarto/bin/tools"` first.

- `targets::tar_make()` builds everything: each `slides/*.Rmd` to HTML, PDF (Chrome) and a single-file copy in `slides/canvas/` (for Canvas), then `files/schedule.ics` from `data/schedule.csv`, the README, and the site.
- `tar_make(names = ...)` runs in a separate process, so write target names literally, not through a variable.
- {targets} doesn't track `slides/css` or `html/custom.scss`. After a CSS-only change, run `tar_invalidate("slide_pdf_XX")` and re-render.
- A PDF target is also skipped when only figures changed: it watches the HTML file only. Invalidate it the same way.
- The renv "out-of-sync" message is expected. `renv.lock` is the EDUC 265 lockfile, so it lists packages this course doesn't use yet. **Don't run a bare `renv::snapshot()` yet:** real decks don't exist, so it would drop packages they'll need. Add a package with `renv::install()` and `renv::record()`.
- `publish.R` uploads `_site/` through Netlify's deploy API. Its project ids are still `NA`, so it stops with a message. Don't use `quarto publish netlify`: Quarto 1.10.19 exits 0 without uploading. It needs `NETLIFY_AUTH_TOKEN`, a Windows user environment variable the user has set. Never ask for it, print it, or put it on a command line.

## Writing decks

`slides/00-template.Rmd` shows the setup: YAML header, chunk options, title slide, section slides, math, and a plot. Delete it once real decks exist. The best examples of finished decks are `..\educ265-27\slides\05-01.Rmd`, `06-01.Rmd` and `10-01.Rmd`.

- **Rhythm:** each 80-minute session runs about 20 minutes of talk then about 6 of doing, three times. The doing is ungraded: predict it, try it (alone, then a neighbor, then vote), or play it (a quick Jeopardy category by poll). Plan about one real poll per session, because the user has to create those, and use hands or a neighbor for the rest. Nothing scored happens in lecture.
- **Canvas:** slides are 1210 × 681 px. Under a title there's about 495 px of usable height, or about 450 px with a source line. Size images with max-height classes, not fixed pixels.
- **Images** live in `slides/img/` and sit in `.picture[![alt](img/name.png)]`, or `.picture-small[...]` beside other content. Both classes are in each deck's end chunk.
- **Moving images** start paused, with a Play button, because WCAG 2.2.2 requires a way to stop them. See the Datasaurus in `11-correlation.Rmd`.
- **Theme classes:** `title title-N`, `section-title section-title-N`, `box-N`, `box-inv-N` (with `.medium`, `.small`, `.sp-after-half`), `.pull-left`, `.pull-right`, `.sr-only`. N runs from 1 to 8.
- **Custom CSS** goes in a `{css}` chunk at the *end* of the Rmd. Any output before the first slide's `class:` line makes remark print the properties as text.
- **Two-line titles** use a `.long-title` class, defined in that end chunk. See `06-01.Rmd`.
- **Plots:** `dev = "ragg_png"`, so Fira Sans Condensed renders on Windows.
- **Math size:** keep `includes: in_header: "css/mathjax.html"` in the YAML header. Without it, math shrinks to half size in embedded frames and small windows.
- **Math in markdown:** display math containing `}_` goes in raw HTML, `<div class="math-display">\[...\]</div>`, because remark reads `_..._` as emphasis. Inline `$..$` inside a one-line `.box[...]` doesn't render: use the multi-line box form or Unicode. Raw HTML needs `\(..\)` delimiters.
- **Speaker notes** go after `???` on a slide.
- **Live polls** use the `.poll-slide` and `.poll-answer` pattern in `06-01.Rmd`, which keeps answers out of the printed PDF. Poll Everywhere has two ids per poll; the button uses the presenter id. Students respond at PollEv.com/adb.
- **After editing a deck, check every slide, the title slide included.** Rendering without an error doesn't mean the slide looks right.

## The simulator

`simulator/` is the course's own interactive tool, in plain JavaScript with no build step and no dependencies. Students use it at `resource/simulator.qmd`, and slides embed it. It replaces the rpsychologist.com screenshots from 2024, because those pages can't be embedded. Keep crediting Kristoffer Magnusson.

- **On a slide:** add `css/simulator.css` to the deck's `css` list, `source(here::here("R", "slide-things.R"))` in a setup chunk, then call `sim_frame(alt = "...", step = 2, n = 10, draws = 551)` in a chunk with `results="asis"`. See the end of `slides/00-template.Rmd`. The "Copy a link to this view" button gives the parameters for any view.
- **Printing:** `sim_frame()` also screenshots the preset in a light theme for the PDF, into `slides/img/sim/`. Delete those files after changing the tool, or the PDF keeps old screenshots.
- **Canvas:** the single-file deck loads the simulator from the live site, so it needs the site deployed and an internet connection.
- **Tests:** open `simulator/tests/index.html` through a local server. `simulator/tests/make_reference.R` writes the R values they check against. Run the tests after any change to `stats.js` or `engine.js`.
- **Animation:** the buttons play it, on the `#c-fx` layer over the panels. `?draws=` presets and `prefers-reduced-motion` skip it. A browser tab that isn't in front barely runs `requestAnimationFrame`, so test frames directly with `SimBlueprint.fxStep(time)`.
- **Rebuilding:** {targets} doesn't track `simulator/`. After changing it, run `tar_invalidate("site")`.

## Accessibility

UC requires WCAG 2.1 AA for all course materials already, regardless of the federal deadline (April 26, 2027).

- Every deck has `lang: "en"`. Every plot chunk has `fig.alt`. Every `![]()` has alt text. Background-image slides get `.sr-only[...]` text after them.
- Colors are already adjusted in the theme. Plot colors need to pass too: gold is #b18323 with white text, and the darker theme slots are #ab892b and #538ba2. Colored math terms need at least 4.6:1 contrast.
- Audit with axe-core 4.10.2 in the browser against a local `python -m http.server`. Audit decks slide by slide with `slideshow.gotoSlide`, and `fetch(..., {cache: "reload"})` first, or you'll audit stale CSS.
- Slide math in PDFs has no semantics, which is why the HTML is the accessible version.
