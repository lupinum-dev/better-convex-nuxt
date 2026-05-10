#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const rootDir = process.cwd();
const checkMode = process.argv.includes("--check");
const outputPath = resolve(
  rootDir,
  "meta/refactor/sprint1-public-surface-inventory.md",
);

const textExtensions = new Set([
  ".md",
  ".mdc",
  ".ts",
  ".tsx",
  ".mts",
  ".vue",
  ".json",
  ".tpl",
]);
const ignoredDirectories = new Set([
  ".git",
  ".nuxt",
  ".output",
  "coverage",
  "dist",
  "node_modules",
]);

function read(path) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

function walk(directory) {
  const fullDirectory = resolve(rootDir, directory);
  if (!existsSync(fullDirectory)) return [];

  const entries = [];
  for (const entry of readdirSync(fullDirectory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = join(fullDirectory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      entries.push(...walk(relative(rootDir, fullPath)));
      continue;
    }
    entries.push(relative(rootDir, fullPath).replaceAll("\\", "/"));
  }
  return entries.sort((a, b) => a.localeCompare(b));
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractNames(block) {
  const names = [];
  for (const match of block.matchAll(/name:\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1]);
  }
  return unique(names);
}

function extractCallBlock(source, callName) {
  const start = source.indexOf(`${callName}([`);
  if (start === -1) return "";

  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    if (char === ")" || char === "]" || char === "}") depth--;
    if (depth === 0 && char === ")") return source.slice(start, index + 1);
  }
  return "";
}

function extractAliases(source) {
  const aliases = [];
  for (const match of source.matchAll(
    /nuxt\.options\.alias\[['"]([^'"]+)['"]\]/g,
  )) {
    aliases.push(match[1]);
  }
  return unique(aliases);
}

function extractTemplateNames(source) {
  const names = [];
  for (const match of source.matchAll(/template\s*!==\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1]);
  }
  for (const match of source.matchAll(/template\s*===\s*['"]([^'"]+)['"]/g)) {
    names.push(match[1]);
  }
  return unique(names);
}

function extractCliCommands(source) {
  const commands = [];
  for (const match of source.matchAll(
    /^\s+([a-zA-Z][\w-]*):\s*[a-zA-Z]\w*Command,/gm,
  )) {
    commands.push(match[1]);
  }
  return unique(commands);
}

function grepFiles(directories, patterns) {
  const rows = [];
  const files = directories.flatMap(walk);
  for (const file of files) {
    if (file.startsWith("meta/refactor/")) continue;
    if (!textExtensions.has(extname(file))) continue;
    const source = read(file);
    const matched = patterns.filter((pattern) => source.includes(pattern));
    if (matched.length === 0) continue;
    rows.push({ file, matches: matched });
  }
  return rows;
}

function packageDecision(exportKey) {
  const importPath =
    exportKey === "."
      ? "@lupinum/trellis"
      : `@lupinum/trellis/${exportKey.slice(2)}`;
  const decisions = {
    ".": ["keep", "root Nuxt module remains the app entrypoint"],
    "./auth": ["keep", "auth product layer subpath"],
    "./args": [
      "keep",
      "schema/args helper subpath unless merged by Slice 1 decision",
    ],
    "./composables": [
      "keep",
      "client composable subpath unless root-only Nuxt auto-imports replace it",
    ],
    "./functions": ["replace", "hard-cut to @lupinum/trellis/backend"],
    "./bridge": [
      "move/delete",
      "bridge APIs leave core for @lupinum/trellis-bridge",
    ],
    "./feature": ["keep", "feature manifest layer stays in root package"],
    "./eslint": [
      "move/delete",
      "runtime package should not carry tooling unless explicitly retained",
    ],
    "./trusted-forwarding": [
      "replace/restrict",
      "signed helpers only; raw forwarding must not remain broad public API",
    ],
    "./visibility": ["keep", "visibility/capability helpers remain app-facing"],
    "./mcp": ["keep", "MCP product layer subpath"],
    "./type-primitives": [
      "keep",
      "type-only helper surface unless folded into functions/backend",
    ],
    "./server": ["keep", "Nuxt/Nitro server helper subpath"],
    "./testing": [
      "keep",
      "testing helpers stay public but must stop emitting raw forwarding",
    ],
  };
  const [action, note] = decisions[exportKey] ?? [
    "decide",
    "unclassified export",
  ];
  return { importPath, action, note };
}

function mdTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => String(row[index] ?? "").length),
    ),
  );
  const format = (row) =>
    `| ${row.map((cell, index) => String(cell ?? "").padEnd(widths[index])).join(" | ")} |`;
  return [
    format(headers),
    format(widths.map((width) => "-".repeat(width))),
    ...rows.map(format),
  ].join("\n");
}

function checklist(items) {
  if (items.length === 0) return "- none";
  return items.map((item) => `- [ ] ${item}`).join("\n");
}

function bulletList(items) {
  if (items.length === 0) return "- none";
  return items.map((item) => `- ${item}`).join("\n");
}

const packageJson = JSON.parse(read("package.json"));
const packageExports = Object.keys(packageJson.exports).sort((a, b) =>
  a.localeCompare(b),
);
const runtimeBarrels = walk("src/runtime").filter((file) =>
  file.endsWith("/index.ts"),
);

const installerSources = [
  "src/installers/core.ts",
  "src/installers/auth.ts",
  "src/installers/permissions.ts",
  "src/installers/advanced.ts",
]
  .filter((file) => existsSync(resolve(rootDir, file)))
  .map(read)
  .join("\n");

const coreInstaller = read("src/installers/core.ts");
const authInstaller = read("src/installers/auth.ts");
const permissionsInstaller = read("src/installers/permissions.ts");
const mainCli = read("src/cli/main.ts");
const initCommand = read("src/cli/commands/init.ts");
const authComponentDir = resolve(rootDir, "src/runtime/auth/ui");

const autoImports = unique([
  ...extractNames(extractCallBlock(coreInstaller, "addImports")).map(
    (name) => `core:${name}`,
  ),
  ...extractNames(extractCallBlock(authInstaller, "addImports")).map(
    (name) => `auth:${name}`,
  ),
  ...extractNames(extractCallBlock(permissionsInstaller, "addImports")).map(
    (name) => `permissions:${name}`,
  ),
]);
const serverImports = extractNames(
  extractCallBlock(coreInstaller, "addServerImports"),
);
const aliases = extractAliases(installerSources);
const authComponents = existsSync(authComponentDir)
  ? readdirSync(authComponentDir)
      .filter((name) => name.endsWith(".vue"))
      .map((name) => name.replace(/\.vue$/, ""))
      .sort((a, b) => a.localeCompare(b))
  : [];
const cliCommands = extractCliCommands(mainCli);
const initTemplates = extractTemplateNames(initCommand);
const templateFiles = walk("src/cli/templates/init");
const docsMatches = grepFiles(
  ["meta", "apps/docs/content", "src/cli/templates"],
  [
    "tool.fromOperation",
    "_trustedForwardingKey",
    "_trustedForwarding",
    "@lupinum/trellis/bridge",
    "@lupinum/trellis/functions",
    "trellis bridge",
    "--template cms",
  ],
);

const packageRows = packageExports.map((exportKey) => {
  const decision = packageDecision(exportKey);
  return [`\`${decision.importPath}\``, decision.action, decision.note];
});

const runtimeRows = runtimeBarrels.map((file) => {
  const surface = file
    .replace(/^src\/runtime\//, "")
    .replace(/\/index\.ts$/, "");
  const exported = packageExports.includes(`./${surface}`);
  return [
    `\`${surface}\``,
    file,
    exported ? "npm export" : "internal unless promoted",
  ];
});

const generatedRows = [
  ...aliases.map((alias) => [
    `alias`,
    `\`${alias}\``,
    "keep in 1.0 generated contract",
  ]),
  ...autoImports.map((name) => [
    `auto-import`,
    `\`${name.replace(/^[^:]+:/, "")}\``,
    name.split(":")[0],
  ]),
  ...serverImports.map((name) => [
    `server import`,
    `\`${name}\``,
    "core installer",
  ]),
  ...authComponents.map((name) => [
    `auth component`,
    `\`<${name}>\``,
    "auth installer",
  ]),
];

const commandRows = [
  ...cliCommands.map((command) => {
    const action =
      command === "bridge"
        ? "move/delete from root CLI"
        : command === "init"
          ? "keep; fixture-backed only"
          : command === "doctor"
            ? "keep; inventory-backed"
            : command === "add"
              ? "keep; fixture/inventory-backed only"
              : "delete unless Slice 1 adds an owner";
    return [`command`, `\`trellis ${command}\``, action];
  }),
  ...initTemplates.map((template) => {
    const action =
      template === "cms"
        ? "delete from Trellis starter surface"
        : template === "workspace-mcp"
          ? "keep; canonical MCP starter"
          : "keep; fixture-backed";
    return [`init template`, `\`${template}\``, action];
  }),
  ...templateFiles.map((file) => [
    `template source`,
    file,
    "replace with fixture manifest",
  ]),
];

function docsAction(file) {
  if (
    file.startsWith("meta/experiments/") ||
    file === "meta/rfc-forwarding-envelope.md" ||
    file === "meta/trellis-1.0-refactor-plan.md"
  ) {
    return "historical/planning reference allowed";
  }
  if (file.startsWith("meta/adr/")) return "historical ADR reference allowed";
  return "rewrite/delete before 1.0 docs gate";
}

const docsRows = docsMatches.map((row) => [
  row.file,
  row.matches.map((match) => `\`${match}\``).join(", "),
  docsAction(row.file),
]);

const decisions = [
  "`@lupinum/trellis/functions` is replaced by `@lupinum/trellis/backend`; no dual public path in 1.0.",
  "Canonical builder spelling is `query.public`, `query.protected`, `mutation.public`, `mutation.protected`, and `mutation.unsafe`.",
  "`cms` is removed from Trellis beginner starters; Ginko owns CMS setup and Trellis keeps only bridge fixtures/docs for package authors.",
  "`trellis bridge` leaves the root Trellis CLI and moves to bridge-owned tooling with `@lupinum/trellis-bridge`.",
  "`workspace-mcp` is the only 1.0 CLI starter spelling; `workspace --mcp` is deleted rather than kept as an alias.",
  "`tsconfig.types.public.compat.json` and `test:types:public:compat` are deleted or replaced by explicit 1.0 public-surface/migration checks.",
  "`trellis add` remains, but only as a fixture/inventory-backed feature command; old template-backed add slices are replaced with the same fixture discipline as starters.",
];

const requiredProof = [
  "Public-surface snapshot includes npm exports, generated aliases, auto-imports, server imports, auth components, CLI commands, and generated contracts.",
  "Bridge helpers are absent from root/core/functions surfaces.",
  "`tool.fromOperation` is absent from runtime types, docs, templates, doctor, and generated resources.",
  "Raw forwarding fields are absent from production/default validators, test helpers, docs, templates, Ginko bridge paths, and generated bridge files.",
  "Every retained starter is fixture-backed; deleted starters have no CLI path.",
];

const file = [
  "# Sprint 1 Public Surface Inventory",
  "",
  "Status: generated planning artifact",
  "",
  "This file is generated by `node scripts/generate-refactor-surface-inventory.mjs`.",
  "Edit the source script or the 1.0 refactor plan, not this generated output.",
  "",
  "## Package Exports",
  "",
  mdTable(["Import", "Sprint 1 Action", "Reason"], packageRows),
  "",
  "## Runtime Barrels",
  "",
  mdTable(["Surface", "File", "Current Exposure"], runtimeRows),
  "",
  "## Generated Nuxt Surface",
  "",
  mdTable(["Kind", "Name", "Source/Owner"], generatedRows),
  "",
  "## CLI And Starter Surface",
  "",
  mdTable(["Kind", "Name", "Sprint 1 Action"], commandRows),
  "",
  "## Docs/Templates That Still Teach Old Paths",
  "",
  mdTable(["File", "Matched Tokens", "Action"], docsRows),
  "",
  "## Sprint 1 Decisions",
  "",
  bulletList(decisions),
  "",
  "## Required Proof Rows For Slice 1",
  "",
  checklist(requiredProof),
  "",
].join("\n");

if (checkMode) {
  const current = existsSync(outputPath)
    ? readFileSync(outputPath, "utf8")
    : "";
  if (current !== file) {
    console.error(
      "[refactor] Sprint 1 public surface inventory is stale. Run `pnpm run refactor:surface:inventory`.",
    );
    process.exit(1);
  }
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, file);
console.log(`Generated ${relative(rootDir, outputPath)}`);
