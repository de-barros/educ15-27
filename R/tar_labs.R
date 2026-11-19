# Lab workbooks ----
#
# Each lab's spreadsheet comes ready: the data already loaded, and a sheet
# with labels where students type a few formulas. Files are .xlsx, which
# opens in Excel and in Google Sheets. They're built from the untouched CSVs
# in files/data/mindspark/, so a change there rebuilds them.

lab_about <- function(lab_title, what) {
  tibble(`About this workbook` = c(
    paste0("EDUC 15, Winter 2027. ", lab_title, "."),
    what,
    "We kept a few columns and renamed them: student = st_id, math = tot_math, center = ms_center1, grade = st_grade1.",
    "",
    "Data: Muralidharan, Karthik, Abhijeet Singh, and Alejandro J. Ganimian. 2019. \"Replication Data for: Disrupting Education? Experimental Evidence on Technology-Aided Instruction in India.\" Version 2. Nashville, TN: American Economic Association. Distributed by ICPSR. https://doi.org/10.3886/E113192V2",
    "License: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Copyright 2019 American Economic Association. Provided as-is, with no warranty.",
    "All the data and the codebook: https://educ15.de-barros.com/resource/data.html"
  ))
}

read_round <- function(file) {
  read_csv(file, show_col_types = FALSE) %>%
    transmute(student = st_id, math = tot_math, center = ms_center1, grade = st_grade1)
}

# Lab 1: a grouped frequency table and a column chart of the endline scores
build_lab_01_workbook <- function(endline_file, path) {
  endline <- read_round(endline_file)
  lows <- seq(0, 30, 5)
  table_sheet <- tibble(
    Interval = paste0(lows, "–", lows + 4),
    From = lows,
    To = lows + 4,
    f = NA_real_
  )
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      table = table_sheet,
      data = endline,
      about = lab_about("Lab 1: Meet the data",
                        paste0("The data sheet holds all ", nrow(endline),
                               " Mindspark students at endline, one row each."))
    ),
    path
  )
  path
}

# Lab 2: M, the SD both ways, and one student's z-score in each round
build_lab_02_workbook <- function(baseline_file, endline_file, path, student_id) {
  baseline <- read_round(baseline_file)
  endline <- read_round(endline_file)
  b <- baseline$math[baseline$student == student_id]
  e <- endline$math[endline$student == student_id]
  stopifnot(length(b) == 1, length(e) == 1)
  work_sheet <- tibble(
    What = c("n (COUNT)",
             "Mean M (AVERAGE)",
             "σ̂ (STDEV.S, dividing SS by n − 1)",
             "SD dividing SS by n (STDEV.P)",
             paste0("Student ", student_id, ": score"),
             paste0("Student ", student_id, ": z-score")),
    Baseline = c(NA, NA, NA, NA, b, NA),
    Endline = c(NA, NA, NA, NA, e, NA)
  )
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      work = work_sheet,
      baseline = baseline,
      endline = endline,
      about = lab_about("Lab 2: Mean, SD and z-scores",
                        paste0("The baseline sheet holds all ", nrow(baseline),
                               " Mindspark students at baseline, and the endline sheet the ",
                               nrow(endline), " at endline, one row each."))
    ),
    path
  )
  path
}
