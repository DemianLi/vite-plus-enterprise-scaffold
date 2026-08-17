<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Commenting Standards

Code explains HOW; comments explain WHY. Write the fewest comments that leave the
intent unambiguous.

Not gated in CI, on purpose: comment quality is not statically verifiable, so it
is enforced at review time.

## Principles

1. Never describe syntax, and never restate what a line literally does.
2. Comment only where the code cannot explain itself: business-rule complexity,
   edge cases, workarounds.
3. Keep comments concise, sharp, and accurate.
4. Prefer renaming a variable or extracting a function over a comment that
   explains messy code.

## Anti-patterns — delete these before rendering

Restating the identifier:

```ts
// Get user balance
function getUserBalance(): Amount {}
```

Translating syntax into prose:

```ts
if (user === null) return; // if user is null, return
```

Boilerplate block headers above self-explanatory functions.

## The only comments worth keeping

- **WHY** — why this algorithm, formula, or business decision, especially a
  counter-intuitive one:
  `// Bitwise shift here because throughput is bottlenecked by hardware constraint #302`
- **WHAT** — API contracts, critical domain knowledge, external dependency
  behaviour:
  `// Third-party payment gateway requires the amount in cents, not dollars.`
- **WARNING / HACK** — workarounds for known bugs:
  `// Workaround for Safari iOS 15 touch bug. Do not remove this empty div.`

## Self-check before output

Re-read every comment you wrote. If a junior developer could infer it from the
code beneath it, delete it.
