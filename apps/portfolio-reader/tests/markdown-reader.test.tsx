import assert from "node:assert/strict";
import test from "node:test";
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
      body={body}
      currentDocument={documents[0]}
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
