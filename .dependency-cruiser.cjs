/** Module boundaries, kept in step with docs/design/<M>.md (## Modules) by /design.
 *  Run by scripts/check.sh: `npx depcruise --config .dependency-cruiser.cjs .` */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", comment: "Modules must form a tree.", from: {}, to: { circular: true } },
    { name: "db-not-routes", severity: "error", comment: "Data access never imports HTTP routes.",
      from: { path: "^src/db/" }, to: { path: "^src/routes/" } },
    { name: "lib-not-routes", severity: "error", comment: "Logic never imports HTTP routes.",
      from: { path: "^src/lib/" }, to: { path: "^src/routes/" } },
    // /design adds one rule per import the design forbids.
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    includeOnly: "^src/",
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
