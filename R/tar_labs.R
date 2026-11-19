# Lab workbooks ----
#
# Each lab's spreadsheet comes ready: the data already loaded, and a sheet
# with labels where students type a few formulas. Files are .xlsx, which
# opens in Excel and in Google Sheets. They're built from the untouched CSVs
# in files/data/mindspark/, so a change there rebuilds them.

lab_about <- function(lab_title, what,
                      renamed = "We kept a few columns and renamed them: student = st_id, math = tot_math, center = ms_center1, grade = st_grade1.") {
  tibble(`About this workbook` = c(
    paste0("EDUC 15, Winter 2027. ", lab_title, "."),
    what,
    renamed,
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

# Students who took both tests, with their two math scores side by side.
# Everyone at endline also has a baseline score
read_both <- function(baseline_file, endline_file) {
  baseline <- read_csv(baseline_file, show_col_types = FALSE)
  endline <- read_csv(endline_file, show_col_types = FALSE)
  both <- inner_join(
    select(baseline, student = st_id, treat, baseline = tot_math),
    select(endline, student = st_id, center = ms_center1, endline = tot_math),
    by = "student"
  )
  stopifnot(nrow(both) == nrow(endline), !anyNA(both$baseline), !anyNA(both$endline), !anyNA(both$treat))
  both
}

# Pads columns of different lengths with blanks, so groups can sit side by side
side_by_side <- function(...) {
  cols <- list(...)
  n <- max(lengths(cols))
  as_tibble(map(cols, ~ c(.x, rep(NA_real_, n - length(.x)))))
}

# A work-sheet column: formulas filled in for students, and blanks where they type.
# Functions newer than Excel 2007 are stored with an _xlfn. prefix, as Excel
# itself saves them. Without it, Excel shows #NAME? until the cell is retyped
formula_col <- function(x) {
  x <- str_replace_all(as.character(x),
                       "(?<![A-Z._])(STDEV\\.S|STDEV\\.P|NORM\\.DIST|NORM\\.INV|T\\.DIST\\.2T|T\\.INV\\.2T|F\\.DIST\\.RT)\\(",
                       "_xlfn.\\1(")
  writexl::xl_formula(x)
}

# Lab 4: σ_M, z for a mean and the four steps, on the boys at baseline
build_lab_04_workbook <- function(baseline_file, path) {
  baseline <- read_csv(baseline_file, show_col_types = FALSE) %>%
    transmute(student = st_id, math = tot_math, center = ms_center1, grade = st_grade1, female = st_female1)
  stopifnot(!anyNA(baseline$math), !anyNA(baseline$female))
  work_sheet <- tibble(
    What = c("μ, all students (AVERAGE)",
             "σ, all students, dividing SS by N (STDEV.P)",
             "n, the boys (COUNTIFS)",
             "M, the boys (AVERAGEIFS)",
             "σ_M = σ / √n",
             "z = (M − μ) / σ_M",
             "p, two tails (NORM.DIST)",
             "Cutoff for α = 0.05, two tails (NORM.INV)"),
    Value = formula_col(c("=AVERAGE(baseline!B:B)", "=STDEV.P(baseline!B:B)", rep(NA, 6)))
  )
  means_sheet <- tibble(n = c(1, 4, 16, 64, 256), `σ_M` = NA_real_)
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      work = work_sheet,
      means = means_sheet,
      baseline = baseline,
      about = lab_about(
        "Lab 4: Sampling distributions and the four steps",
        paste0("The baseline sheet holds all ", nrow(baseline), " Mindspark students at baseline, one row each. ",
               "In the work sheet, rows 2 and 3 are filled in: click a cell to see its formula."),
        "We kept a few columns and renamed them: student = st_id, math = tot_math, center = ms_center1, grade = st_grade1, female = st_female1 (1 for a girl, 0 for a boy)."
      )
    ),
    path
  )
  path
}

# Lab 7: a pooled two-sample t, Mindspark against control, before and after
build_lab_07_workbook <- function(baseline_file, endline_file, path) {
  baseline <- read_csv(baseline_file, show_col_types = FALSE)
  endline <- read_csv(endline_file, show_col_types = FALSE)
  stopifnot(!anyNA(baseline$treat), !anyNA(endline$treat), !anyNA(baseline$tot_math), !anyNA(endline$tot_math))
  round_sheet <- function(d) side_by_side(mindspark = d$tot_math[d$treat == 1], control = d$tot_math[d$treat == 0])
  # Rows 2 to 9 are filled in. Students type rows 10 to 15, and 16 and 17 if they have time
  col <- function(sheet, letter) formula_col(c(
    paste0("=COUNT(", sheet, "!A:A)"), paste0("=AVERAGE(", sheet, "!A:A)"), paste0("=STDEV.S(", sheet, "!A:A)"),
    paste0("=COUNT(", sheet, "!B:B)"), paste0("=AVERAGE(", sheet, "!B:B)"), paste0("=STDEV.S(", sheet, "!B:B)"),
    paste0("=(", letter, "2-1)*", letter, "4^2"), paste0("=(", letter, "5-1)*", letter, "7^2"),
    rep(NA, 8)
  ))
  work_sheet <- tibble(
    What = c("n₁, Mindspark group (COUNT)",
             "M₁, Mindspark group (AVERAGE)",
             "σ̂₁, Mindspark group (STDEV.S)",
             "n₂, control group (COUNT)",
             "M₂, control group (AVERAGE)",
             "σ̂₂, control group (STDEV.S)",
             "SS₁ = (n₁ − 1) × σ̂₁²",
             "SS₂ = (n₂ − 1) × σ̂₂²",
             "σ̂²_p, the pooled variance",
             "σ̂ of the gap, σ̂_(M₁−M₂)",
             "t",
             "df",
             "p, two tails (T.DIST.2T)",
             "g",
             "If you have time: the 95% interval for the gap, lower end",
             "If you have time: the 95% interval for the gap, upper end"),
    Baseline = col("baseline", "B"),
    Endline = col("endline", "C")
  )
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      work = work_sheet,
      baseline = round_sheet(baseline),
      endline = round_sheet(endline),
      about = lab_about(
        "Lab 7: Two samples",
        paste0("The baseline sheet holds the math scores of all ", nrow(baseline), " Mindspark students at baseline, ",
               "and the endline sheet the ", nrow(endline), " at endline. In each, column A is the group the lottery picked ",
               "for the program (treat = 1), and column B is the control group (treat = 0). ",
               "In the work sheet, rows 2 to 9 are filled in: click a cell to see its formula."),
        "We kept the math score (tot_math) and split it by the lottery (treat). The student IDs and the other columns are left out."
      )
    ),
    path
  )
  path
}

# Lab 8: a one-way ANOVA on gains across the three centers, Mindspark students only
build_lab_08_workbook <- function(baseline_file, endline_file, path) {
  both <- read_both(baseline_file, endline_file) %>%
    filter(treat == 1) %>%
    arrange(center, student)
  stopifnot(setequal(unique(both$center), c("Chhatarpur", "Govindpuri", "Tekhand")))
  gain_of <- function(cc) both$endline[both$center == cc] - both$baseline[both$center == cc]
  gains_sheet <- side_by_side(Chhatarpur = gain_of("Chhatarpur"), Govindpuri = gain_of("Govindpuri"),
                              Tekhand = gain_of("Tekhand"))
  students_sheet <- both %>%
    transmute(student, center, baseline, endline,
              gain = formula_col(paste0("=D", row_number() + 1, "-C", row_number() + 1)))
  # Rows 2, 3 and 6 are filled in. Students type rows 4 and 5
  group_col <- function(letter, first) formula_col(c(
    paste0("=COUNT(gains!", letter, ":", letter, ")"),
    paste0("=AVERAGE(gains!", letter, ":", letter, ")"),
    NA, NA,
    if (first) "=AVERAGE(gains!A:C)" else NA
  ))
  groups_sheet <- tibble(
    What = c("n (COUNT)", "M, the mean gain (AVERAGE)", "SS (DEVSQ)", "n × (M − overall mean)²",
             "Overall mean, all three centers"),
    Chhatarpur = group_col("A", TRUE),
    Govindpuri = group_col("B", FALSE),
    Tekhand = group_col("C", FALSE)
  )
  # The df and SS total are filled in. Students type the rest
  table_sheet <- tibble(
    Source = c("Between centers", "Within centers", "Total", "η̂² = SS between / SS total"),
    SS = formula_col(c(NA, NA, "=DEVSQ(gains!A:C)", NA)),
    df = formula_col(c("=3-1", "=SUM(groups!B2:D2)-3", "=COUNT(gains!A:C)-1", NA)),
    MS = formula_col(rep(NA, 4)),
    F = formula_col(rep(NA, 4)),
    p = formula_col(rep(NA, 4))
  )
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      groups = groups_sheet,
      table = table_sheet,
      gains = gains_sheet,
      students = students_sheet,
      about = lab_about(
        "Lab 8: Gains and ANOVA",
        paste0("The students sheet holds the ", nrow(both), " students the lottery picked for Mindspark (treat = 1) ",
               "who took both tests, with their gain: endline minus baseline. The gains sheet holds the same gains, ",
               "one column per center. Cells with a formula are filled in for you: click one to see it."),
        "We kept the math score (tot_math) from both rounds and renamed the columns: student = st_id, center = ms_center1, baseline and endline = tot_math in each round. The gain is computed."
      )
    ),
    path
  )
  path
}

# Lab 9: r, the slope and the intercept for all students with both scores
build_lab_09_workbook <- function(baseline_file, endline_file, path) {
  both <- read_both(baseline_file, endline_file) %>%
    select(student, baseline, endline)
  work_sheet <- tibble(
    What = c("r (CORREL)", "b, the slope (SLOPE)", "a, the intercept (INTERCEPT)", "r²",
             "Ŷ for a baseline score of 15"),
    Value = formula_col(rep(NA, 5))
  )
  fs::dir_create(fs::path_dir(path))
  writexl::write_xlsx(
    list(
      work = work_sheet,
      scores = both,
      about = lab_about(
        "Lab 9: Correlation and regression",
        paste0("The scores sheet holds all ", nrow(both), " Mindspark students who took both tests, one row each: ",
               "their math score at baseline (X) and at endline (Y)."),
        "We kept the math score (tot_math) from both rounds and renamed the columns: student = st_id, baseline and endline = tot_math in each round."
      )
    ),
    path
  )
  path
}
