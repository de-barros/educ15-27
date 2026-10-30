# Write reference values for the simulator's statistics, so the JavaScript can be
# checked against R. Run from the project root:
# Rscript simulator/tests/make_reference.R

x <- c(12, 15, 9, 14, 11, 18, 7, 13)
y <- c(30, 20, 16, 26, 27, 16, 22, 23)
a <- c(101, 96, 110, 104, 99, 107)
b <- c(92, 105, 88, 97, 100, 94, 90)
g <- list(c(11, 14, 9, 12), c(15, 13, 18, 16), c(10, 8, 12, 9, 11))

one <- t.test(x, mu = 10)
two <- t.test(a, b, var.equal = TRUE)
aov_tab <- anova(lm(val ~ grp, data.frame(val = unlist(g), grp = factor(rep(1:3, lengths(g))))))
fit <- summary(lm(y ~ x))

ref <- list(
  norm = lapply(c(-3.2, -1.96, -0.5, 0, 0.3, 1, 2.58), \(q) list(q = q, p = pnorm(q), d = dnorm(q))),
  normq = lapply(c(0.001, 0.025, 0.2, 0.5, 0.8, 0.975, 0.999), \(p) list(p = p, q = qnorm(p))),
  t = lapply(list(c(-2.5, 3), c(-1, 9), c(0.7, 24), c(2.064, 24), c(1.96, 537), c(5, 1)),
             \(v) list(q = v[1], df = v[2], p = pt(v[1], v[2]), d = dt(v[1], v[2]))),
  tq = lapply(list(c(0.975, 1), c(0.975, 5), c(0.995, 24), c(0.9, 60), c(0.025, 9)),
              \(v) list(p = v[1], df = v[2], q = qt(v[1], v[2]))),
  f = lapply(list(c(1, 2, 12), c(3.66, 2, 616), c(0.5, 2, 3), c(5.99, 1, 6)),
             \(v) list(q = v[1], d1 = v[2], d2 = v[3], p = pf(v[1], v[2], v[3]), d = df(v[1], v[2], v[3]))),
  fq = lapply(list(c(0.95, 2, 12), c(0.95, 2, 616), c(0.99, 3, 20), c(0.95, 1, 6)),
              \(v) list(p = v[1], d1 = v[2], d2 = v[3], q = qf(v[1], v[2], v[3]))),
  data = list(x = x, y = y, a = a, b = b, g = g),
  one = list(t = unname(one$statistic), df = unname(one$parameter), se = one$stderr,
             sd = sd(x), M = mean(x)),
  two = list(t = unname(two$statistic), df = unname(two$parameter), se = two$stderr),
  aov = list(F = aov_tab$`F value`[1], ssb = aov_tab$`Sum Sq`[1], ssw = aov_tab$`Sum Sq`[2],
             dfb = aov_tab$Df[1], dfw = aov_tab$Df[2]),
  reg = list(r = cor(x, y), a = coef(fit)[1, 1], b = coef(fit)[2, 1], seB = coef(fit)[2, 2],
             t = coef(fit)[2, 3], r2 = fit$r.squared, df = fit$df[2]),
  power = lapply(list(c(0.89, 10, 0.05), c(0.89, 15, 0.05), c(0.5, 25, 0.01)), \(v) {
    z <- qnorm(1 - v[3] / 2)
    ncp <- v[1] * sqrt(v[2])
    list(d = v[1], n = v[2], alpha = v[3], two = 1 - pnorm(z - ncp) + pnorm(-z - ncp),
         one = 1 - pnorm(qnorm(1 - v[3]) - ncp))
  })
)

json <- jsonlite::toJSON(ref, auto_unbox = TRUE, digits = 14)
writeLines(c("// Written by make_reference.R. Don't edit by hand.",
             paste0("window.REF = ", json, ";")),
           "simulator/tests/reference.js")
