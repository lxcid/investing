# Portfolio Research Reader

A generic, read-only interface over the evidence-backed portfolio and company
research stored in this repository.

## Product boundary

Investment research is the product. This app is a read-only bridge that helps
the investor navigate, inspect, and understand the repository's evidence and
analysis. Repository files remain authoritative; the app must not introduce a
parallel source of portfolio truth, silently change research, or turn research
signals into portfolio decisions.

The app may index and present Markdown, CSV, JSON, HTML, and PDF artifacts. Any
future write capability must be explicitly scoped, show the exact file change,
run repository validation, and preserve investor decision authority.

The client indexes portfolio records, companies, research notes, structured
financial and market snapshots, evidence inventories, and optional specialist
views. Raffles Medical's dependency-aware insider ownership study is the first
specialist view; it is not the app's organizing model.

## Local use

```bash
moon run portfolio-reader:dev
```

Moon pins Node.js 26 and pnpm for reproducible local execution. The `predev` and
`prebuild` hooks regenerate `app/data/repository.json` from `portfolio/` and
`companies/`. Use `moon run portfolio-reader:sync` to refresh only the reader.

## Validation

```bash
moon run portfolio-reader:typecheck
moon run portfolio-reader:lint
moon run portfolio-reader:test
```
