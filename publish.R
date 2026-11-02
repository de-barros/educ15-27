# Upload the already-rendered site in _site/ to Netlify through its deploy API.
# Run targets::tar_make() first; this script doesn't render anything.
#
#   Rscript publish.R preview          hidden preview (educ15-2027.netlify.app)
#   Rscript publish.R release --yes    live site (educ15.de-barros.com)
#
# Needs a Netlify personal access token in the NETLIFY_AUTH_TOKEN environment
# variable (Netlify > User settings > Applications > Personal access tokens)

targets <- list(
  # TODO: create the release project when the site goes live, then fill in its id
  preview = list(id = "4c8aa500-e0c8-4b2c-b0a2-4bc3328c5074",
                 url = "https://educ15-2027.netlify.app"),
  release = list(id = NA_character_,
                 url = "https://educ15.de-barros.com")
)

fail <- function(...) {
  message(...)
  quit(status = 1)
}

args <- commandArgs(trailingOnly = TRUE)
mode <- args[1]

if (is.na(mode) || !mode %in% names(targets)) {
  fail("Usage: Rscript publish.R preview | release --yes")
}
if (mode == "release" && !"--yes" %in% args) {
  fail("This replaces the live site at educ15.de-barros.com. ",
       "Run `Rscript publish.R release --yes` to go ahead.")
}
target <- targets[[mode]]
if (is.na(target$id)) {
  fail("No Netlify project id set for '", mode, "' at the top of publish.R")
}
if (Sys.getenv("NETLIFY_AUTH_TOKEN") == "") {
  fail("NETLIFY_AUTH_TOKEN is not set. Create a personal access token in ",
       "Netlify and save it with `setx NETLIFY_AUTH_TOKEN \"...\"`, then ",
       "restart RStudio/the terminal.")
}
if (!file.exists("_quarto.yml")) {
  fail("Run this from the project root")
}
if (!file.exists("_site/index.html")) {
  fail("_site/index.html is missing. Run targets::tar_make() first.")
}

# Manual backup copies of the site (_site-DD, "_site - Copy") sometimes end up
# inside _site/ and would add a gigabyte or more to the upload
backups <- list.files("_site", pattern = "^_site|- Copy", recursive = TRUE,
                      include.dirs = TRUE)
if (length(backups) > 0) {
  fail("Remove these backup copies from _site/ first:\n  ",
       paste(file.path("_site", backups), collapse = "\n  "))
}

site_files <- list.files("_site", recursive = TRUE, all.files = TRUE,
                         full.names = TRUE)
message(sprintf("Publishing %d files (%.0f MB) to %s",
                length(site_files), sum(file.size(site_files)) / 1024^2,
                target$url))

# Netlify reads _headers from the deploy. The preview tells search engines not
# to index it; the live site must never carry that header.
headers_file <- "_site/_headers"
if (mode == "preview") {
  writeLines(c("/*", "  X-Robots-Tag: noindex, nofollow"), headers_file)
} else {
  unlink(headers_file)
}

# `quarto publish netlify` (1.10.19) exits 0 without uploading anything when
# run non-interactively, so this talks to Netlify's deploy API directly
netlify <- function(method, path, body = NULL,
                    type = "application/json") {
  h <- curl::new_handle(customrequest = method)
  curl::handle_setheaders(h,
    Authorization = paste("Bearer", Sys.getenv("NETLIFY_AUTH_TOKEN")),
    `Content-Type` = type)
  if (!is.null(body)) curl::handle_setopt(h, copypostfields = body)
  for (attempt in 1:4) {
    res <- curl::curl_fetch_memory(paste0("https://api.netlify.com/api/v1", path),
                                   handle = h)
    if (res$status_code < 300) {
      return(jsonlite::fromJSON(rawToChar(res$content), simplifyVector = FALSE))
    }
    if (res$status_code != 429 && res$status_code < 500) break
    Sys.sleep(5 * attempt)
  }
  fail(method, " ", path, " failed (", res$status_code, "): ",
       rawToChar(res$content))
}

# Netlify only asks for files whose SHA1 it doesn't already have
rel_paths <- list.files("_site", recursive = TRUE, all.files = TRUE)
shas <- vapply(file.path("_site", rel_paths),
               function(f) as.character(openssl::sha1(file(f))), "")
manifest <- jsonlite::toJSON(
  list(files = as.list(setNames(shas, paste0("/", rel_paths)))),
  auto_unbox = TRUE)
deploy <- netlify("POST", paste0("/sites/", target$id, "/deploys"),
                  charToRaw(manifest))

upload <- which(shas %in% unlist(deploy$required) & !duplicated(shas))
message(sprintf("Uploading %d new or changed files", length(upload)))
for (i in seq_along(upload)) {
  f <- rel_paths[upload[i]]
  escaped <- paste(vapply(strsplit(f, "/")[[1]], curl::curl_escape, ""),
                   collapse = "/")
  netlify("PUT", paste0("/deploys/", deploy$id, "/files/", escaped),
          readBin(file.path("_site", f), "raw", file.size(file.path("_site", f))),
          type = "application/octet-stream")
  if (i %% 50 == 0) message(sprintf("  %d / %d", i, length(upload)))
}
unlink(headers_file)

# Netlify publishes the deploy once it has processed every file
for (i in 1:60) {
  state <- netlify("GET", paste0("/deploys/", deploy$id))$state
  if (state %in% c("ready", "error")) break
  Sys.sleep(5)
}
if (state != "ready") fail("Deploy ", deploy$id, " ended in state '", state, "'")
message("Done: ", target$url)
