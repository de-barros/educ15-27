# Helpers for showing slides and the simulator. slide_buttons(), slide_frame() and
# slide_tabs() come from Andrew Heiss's course sites, by way of EDUC 265.

slide_buttons <- function(slide_id) {
  glue::glue('<p class="buttons"><a class="btn btn-danger" target="_blank" href="{slide_id}.html"><i class="fa-solid fa-arrow-up-right-from-square"></i> View all slides in new window</a> <a class="btn btn-danger" target="_blank" href="{slide_id}.pdf" role="button"><i class="fa-solid fa-file-pdf"></i> Download PDF of all slides</a></p>')
}

slide_frame <- function(slide_url, title = "Lecture slides") {
  glue::glue(
    '<div class="ratio ratio-16x9">\n',
    '<iframe src="{slide_url}" title="{title}" loading="lazy"></iframe>\n',
    '</div>'
  )
}

# Build the query string for a simulator preset
sim_query <- function(...) {
  args <- list(...)
  paste(names(args), vapply(args, as.character, character(1)), sep = "=", collapse = "&")
}

# Run Chrome with its own temp folder, so its leftovers don't pile up in Temp
with_chrome_temp <- function(code) {
  temp <- tempfile("chrome")
  dir.create(temp)
  on.exit(unlink(temp, recursive = TRUE))
  withr::with_envvar(c(TEMP = temp, TMP = temp), code)
}

# Screenshot the simulator in its light theme, for the printed PDF. The file name
# comes from the preset, so a preset is only captured once.
sim_snapshot <- function(query) {
  file <- paste0(substr(rlang::hash(query), 1, 12), ".png")
  out <- here::here("slides", "img", "sim", file)
  if (!file.exists(out)) {
    dir.create(dirname(out), recursive = TRUE, showWarnings = FALSE)
    url <- paste0(
      "file:///", here::here("simulator", "index.html"),
      "?", query, "&theme=light&print=1"
    )
    with_chrome_temp(pagedown::chrome_print(
      url, output = out, format = "png", wait = 2, timeout = 60, verbose = 0,
      extra_args = c("--window-size=1180,600", "--hide-scrollbars",
                     "--allow-file-access-from-files", "--disable-gpu")
    ))
  }
  file.path("img", "sim", file)
}

# Put a live simulator on a slide, opened at a preset, for example
# sim_frame(alt = "...", step = 2, n = 10, draws = 551). Use it in a chunk with
# results="asis". The printed PDF shows a screenshot of the same preset instead.
sim_frame <- function(alt, ..., height = 545) {
  query <- sim_query(ui = "slide", ...)
  image <- sim_snapshot(query)
  cat(glue::glue(
    '<div class="sim-slide" style="height: {height}px;">\n',
    '<iframe class="sim-live" src="../simulator/index.html?{query}" title="{alt}" loading="lazy"></iframe>\n',
    '<img class="sim-static" src="{image}" alt="{alt}">\n',
    '</div>\n'
  ))
}
