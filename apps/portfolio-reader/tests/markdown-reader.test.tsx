import assert from "node:assert/strict";
import test from "node:test";
import { slug } from "github-slugger";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MarkdownReader,
  type MarkdownDocument,
} from "../app/markdown-reader";

const companyPath = "vault/companies/SGX/TEST_Example";
const documents: MarkdownDocument[] = [
  {
    id: "index",
    path: `${companyPath}/index.md`,
    relativePath: "index.md",
    kind: "Company overview",
    title: "Example company",
    summary: "Fixture",
    attributes: {},
    body: "",
  },
  {
    id: "questions",
    path: `${companyPath}/questions.md`,
    relativePath: "questions.md",
    kind: "Research note",
    title: "Research questions",
    summary: "Fixture",
    attributes: {},
    body: "# Research questions\n\n## Open\n\nQuestion",
  },
];

test("renders GFM and Obsidian wiki syntax through the Markdown component", () => {
  const body = `# Example company

## Evidence table

| Status | Evidence |
|---|---|
| **Open** | ~~stale~~ |

- [x] Parsed with GFM

> [!note] Tracking status
> No portfolio action has been recorded.

Read [[questions#Open|the open questions]] and ![[questions#Open]].
Source: [[sources/report.pdf#page=4|Annual report, p. 4]].
[External source](https://example.com/report)

<script>alert("unsafe")</script>`;

  const html = renderToStaticMarkup(
    <MarkdownReader
      currentDocument={{ ...documents[0], body }}
      documents={documents}
      onSelectDocument={() => {}}
    />,
  );

  assert.doesNotMatch(html, /<h1/);
  assert.match(html, /<h2 id="evidence-table">Evidence table<\/h2>/);
  assert.match(html, /class="markdown-table-wrap"/);
  assert.match(html, /<strong>Open<\/strong>/);
  assert.match(html, /<del>stale<\/del>/);
  assert.match(html, /type="checkbox"[^>]*checked=""/);
  assert.match(html, /class="research-callout" data-callout="note"/);
  assert.match(html, /class="wiki-link"[^>]*>the open questions<\/button>/);
  assert.match(html, /class="wiki-link wiki-embed"[^>]*>Embedded reference: questions<\/button>/);
  assert.match(html, /class="wiki-link wiki-link-unresolved"[^>]*>Annual report, p\. 4<\/span>/);
  assert.match(html, /href="https:\/\/example\.com\/report" rel="noreferrer" target="_blank"/);
  assert.doesNotMatch(html, /unsafe|script|alert/);
});

test("preserves wiki aliases inside repository-shaped GFM tables", () => {
  const body = `# Source register

| Source | Date | Purpose | External link | SHA-256 |
|---|---|---|---|---|
| [[sources/annual-reports/fy2025.pdf|FY2025 annual report]] | 2026-04-01 | Audited financials and governance | [Company IR](https://example.com/fy2025.pdf) | \`4b605a53886d6f33\` |

Literal syntax: \`[[target|alias]]\`.`;
  const sourceDocument = {
    ...documents[0],
    body,
    id: "sources",
    path: `${companyPath}/sources.md`,
    relativePath: "sources.md",
    title: "Source register",
  };

  const html = renderToStaticMarkup(
    <MarkdownReader
      currentDocument={sourceDocument}
      documents={[sourceDocument, documents[1]]}
      onSelectDocument={() => {}}
    />,
  );
  const tableRow = html.match(/<tbody><tr>([\s\S]*?)<\/tr><\/tbody>/)?.[1];

  assert.ok(tableRow);
  assert.equal(tableRow.match(/<td>/g)?.length, 5);
  assert.match(tableRow, />FY2025 annual report<\/span>/);
  assert.match(tableRow, /2026-04-01/);
  assert.match(tableRow, /4b605a53886d6f33/);
  assert.match(html, /<code>\[\[target\|alias\]\]<\/code>/);
});

test("uses github-slugger semantics and labels anchor-only wiki links", () => {
  const body = `## Cash / debt

## A_B

## 100%

[[#Open]] [[#Cash / debt]] [[#A_B]] [[#100%]]`;
  const html = renderToStaticMarkup(
    <MarkdownReader
      currentDocument={{ ...documents[0], body }}
      documents={documents}
      onSelectDocument={() => {}}
    />,
  );

  assert.equal(slug("Cash / debt"), "cash--debt");
  assert.equal(slug("A_B"), "a_b");
  assert.equal(slug("100%"), "100");
  assert.match(html, /<h2 id="cash--debt">Cash \/ debt<\/h2>/);
  assert.match(html, /<h2 id="a_b">A_B<\/h2>/);
  assert.match(html, /<h2 id="100">100%<\/h2>/);
  assert.match(html, />Open<\/button>/);
});
