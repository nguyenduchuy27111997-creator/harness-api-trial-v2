/** Module boundaries, kept in step with docs/design/<M>.md (## Modules) by /design.
 *  Run by scripts/check.sh: `npx depcruise --config .dependency-cruiser.cjs .` */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Modules must form a tree.", from: {}, to: { circular: true } },
    { name: "db-not-routes", severity: "error", comment: "Data access never imports HTTP routes.",
      from: { path: "^src/db/" }, to: { path: "^src/routes/" } },
    { name: "lib-not-routes", severity: "error", comment: "Logic never imports HTTP routes.",
      from: { path: "^src/lib/" }, to: { path: "^src/routes/" } },
    // M1 (docs/design/M1.md, Modules):
    { name: "routes-not-db", severity: "error", comment: "Routes reach data only through src/lib, where every query takes the caller's user id.",
      from: { path: "^src/routes/" }, to: { path: "^src/db/" } },
    { name: "app-not-db", severity: "error", comment: "The app and server entry points reach data only through src/lib.",
      from: { path: "^src/(app|server)\\.ts$" }, to: { path: "^src/db/" } },
    { name: "routes-not-routes", severity: "error", comment: "A route file never imports another route file; shared code goes in src/lib.",
      from: { path: "^src/routes/" }, to: { path: "^src/routes/" } },
    { name: "db-only-env", severity: "error", comment: "src/db imports nothing from src/lib except env.",
      from: { path: "^src/db/" }, to: { path: "^src/lib/", pathNot: "^src/lib/env\\.ts$" } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src/",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
