slides <- tibble::tibble(
  path = list.files(here_rel("slides"), pattern = "\\.Rmd", full.names = TRUE)
) %>%
  mutate(
    name = tools::file_path_sans_ext(basename(path)),
    sym = syms(janitor::make_clean_names(paste0("slide_rmd_", name))),
    sym_html = syms(janitor::make_clean_names(paste0("slide_html_", name))),
    sym_pdf = syms(janitor::make_clean_names(paste0("slide_pdf_", name))),
    sym_standalone = syms(janitor::make_clean_names(paste0("slide_standalone_", name)))
  )

build_slides <- list(
  tar_eval(
    tar_files_input(target_name, rmd_file),
    values = list(
      target_name = slides$sym,
      rmd_file = slides$path
    )
  ),

  tar_eval(
    tar_target(target_name, render_xaringan(rmd_file), format = "file"),
    values = list(
      target_name = slides$sym_html,
      rmd_file = slides$sym
    )
  ),

  tar_eval(
    tar_target(target_name, xaringan_to_pdf(html_file), format = "file"),
    values = list(
      target_name = slides$sym_pdf,
      html_file = slides$sym_html
    )
  ),

  tar_eval(
    tar_target(target_name, xaringan_standalone(html_file), format = "file"),
    values = list(
      target_name = slides$sym_standalone,
      html_file = slides$sym_html
    )
  )
)


# We need to return the path to the rendered HTML file. In this case,
# rmarkdown::render() *does* return a path, but it returns an absolute path,
# which makes the targets pipeline less portable. So we return our own path to
# the HTML file instead.
render_xaringan <- function(slide_path) {
  # crayon does weird things to R Markdown and xaringan output, so we need to
  # disable it here. This is the same thing that tarchetypes::tar_render() does
  # behind the scenes too.
  withr::local_options(list(crayon.enabled = NULL))
  rmarkdown::render(slide_path, quiet = TRUE)
  return(paste0(tools::file_path_sans_ext(slide_path), ".html"))
}


# Print xaringan HTML slides to PDF through Chrome. This is what
# renderthis::to_pdf() does for simple slides, but renderthis keeps pagedown's
# 30-second timeout, which image-heavy decks (e.g. 02-01) exceed. Return a
# relative path to the PDF to keep targets happy.
#
# Chrome can still fail in the middle of a long pipeline run and leave the
# working directory changed, so restore it and retry once.
xaringan_to_pdf <- function(slide_path) {
  path_sans_ext <- tools::file_path_sans_ext(slide_path)
  pdf_path <- paste0(path_sans_ext, ".pdf")

  # The PDF shows a screenshot of each simulator, and the server that Chrome
  # prints through can't reach simulator/, so print a copy without the live ones
  print_path <- paste0(path_sans_ext, "-print.html")
  html <- as.character(xfun::file_string(slide_path))
  xfun::write_utf8(gsub('&lt;iframe class="sim-live".*?&lt;/iframe&gt;', "", html, perl = TRUE), print_path)
  on.exit(unlink(print_path))

  # Chrome gets its own temp folder, so its leftovers don't pile up in Temp
  chrome_temp <- tempfile("chrome")
  dir.create(chrome_temp)
  on.exit(unlink(chrome_temp, recursive = TRUE), add = TRUE)

  for (attempt in 1:2) {
    done <- withr::with_dir(getwd(), tryCatch({
      withr::with_envvar(
        c(TEMP = chrome_temp, TMP = chrome_temp),
        pagedown::chrome_print(print_path, output = pdf_path, timeout = 300)
      )
      TRUE
    }, error = function(e) {
      if (attempt == 2) stop(e)
      FALSE
    }))
    if (done) break
  }

  return(pdf_path)
}


# Write a single-file copy of a rendered deck to slides/canvas/. A deck normally
# needs the libs/, css/, img/ and *_files/ folders next to it, which Canvas
# can't provide. xaringan's own self_contained option would knit every deck
# again, and it skips <img> tags that don't end in "/>" and video posters, so we
# embed what the finished HTML loads from disk instead.
#
# MathJax and Google Fonts stay remote. MathJax fetches its own parts while it
# runs, so these files still need an internet connection.
xaringan_standalone <- function(slide_path) {
  deck_dir <- dirname(slide_path)
  html <- as.character(xfun::file_string(slide_path))

  # A file on Canvas can't reach the site by a relative path
  html <- gsub('src="../simulator/', paste0('src="', base_url, 'simulator/'), html, fixed = TRUE)

  local_ref <- "(?!https?:|data:|//|#)"
  local_file <- function(ref) file.path(deck_dir, utils::URLdecode(ref))

  # Replace each match of `pattern`, whose first group is a file path, with
  # what `embed` returns for that file
  embed_refs <- function(html, pattern, embed) {
    found <- gregexpr(pattern, html, perl = TRUE)
    regmatches(html, found) <- list(vapply(
      regmatches(html, found)[[1]],
      function(tag) {
        ref <- sub(pattern, "\\1", tag, perl = TRUE)
        if (!file.exists(local_file(ref))) {
          warning(slide_path, " refers to a missing file: ", ref, call. = FALSE)
          return(tag)
        }
        embed(tag, ref)
      },
      character(1), USE.NAMES = FALSE
    ))
    html
  }

  # remark reads the slides with regular expressions and takes minutes on the
  # long strings that embedded images turn into. So the slides only get a short
  # placeholder, and a script at the end of the page swaps the files back in.
  assets <- character()
  as_placeholder <- function(tag, ref) {
    if (!ref %in% names(assets)) {
      assets[[ref]] <<- xfun::base64_uri(local_file(ref))
    }
    sub(ref, paste0("data:,asset-", match(ref, names(assets)) - 1), tag, fixed = TRUE)
  }
  read_asset <- function(ref) as.character(xfun::file_string(local_file(ref)))

  # Images and video come first, while `html` still holds only the slides.
  # Library code contains strings that look like these references.
  media_patterns <- c(
    paste0('(?<!<script )(?:src|poster)="', local_ref, '([^"]+)"'),
    paste0("!\\[[^\\]]*\\]\\(", local_ref, "([^)\\s]+)\\)"),
    paste0("url\\([\"']?", local_ref, "([^)\"']+)[\"']?\\)")
  )
  for (pattern in media_patterns) {
    html <- embed_refs(html, pattern, as_placeholder)
  }

  html <- embed_refs(
    html, paste0('<link[^>]*href="', local_ref, '([^"]+\\.css)"[^>]*>'),
    function(tag, ref) paste0("<style>\n", read_asset(ref), "\n</style>")
  )

  # Stop library code from ending or disturbing its <script> block early
  html <- embed_refs(
    html, paste0('<script src="', local_ref, '([^"]+)"></script>'),
    function(tag, ref) {
      js <- gsub("</script", "<\\/script", read_asset(ref), fixed = TRUE)
      js <- gsub("<!--", "<\\!--", js, fixed = TRUE)
      paste0("<script>\n", js, "\n</script>")
    }
  )

  restore_assets <- paste0(
    '<script>\n(function () {\n',
    '  var assets = ', jsonlite::toJSON(unname(assets)), ';\n',
    '  var attrs = ["src", "poster", "style"];\n',
    '  document.querySelectorAll(attrs.map(function (a) {\n',
    '    return "[" + a + "*=\'data:,asset-\']";\n',
    '  }).join()).forEach(function (el) {\n',
    '    attrs.forEach(function (a) {\n',
    '      var value = el.getAttribute(a);\n',
    '      if (value) el.setAttribute(a, value.replace(/data:,asset-(\\d+)/g, function (m, i) {\n',
    '        return assets[i];\n',
    '      }));\n',
    '    });\n',
    '  });\n',
    '  document.querySelectorAll("video").forEach(function (v) { v.load(); });\n',
    '})();\n</script>\n'
  )
  body_end <- tail(gregexpr("</body>", html, fixed = TRUE)[[1]], 1)
  html <- paste0(
    substr(html, 1, body_end - 1), restore_assets,
    substr(html, body_end, nchar(html))
  )

  out_dir <- file.path(deck_dir, "canvas")
  dir.create(out_dir, showWarnings = FALSE)
  out_path <- file.path(out_dir, basename(slide_path))
  xfun::write_utf8(html, out_path)

  return(out_path)
}
