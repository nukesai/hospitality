export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // config-conventional 21.2.2 types:
    // build chore ci docs feat fix perf refactor revert style test
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        "backend",
        "frontend",
        "common",
        "cli",
        "eslint-config",
        "typescript-config",
        "example",
        "repo",
        "ci",
        "deps",
        "release",
      ],
    ],
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 100],
    // Changesets and release tooling generate long body lines; do not fight them.
    "body-max-line-length": [0, "always", Infinity],
    "footer-max-line-length": [0, "always", Infinity],
  },
};
