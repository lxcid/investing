import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the portfolio research reader", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Portfolio Research Reader<\/title>/i);
  assert.match(html, /Read the evidence\./);
  assert.match(html, /Research by business, not by screen\./);
  assert.doesNotMatch(html, /Loading the vault index/);
  assert.match(html, /Portfolio Reader/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships a small index with lazy company and ownership chunks", async () => {
  const dataRoot = new URL("../dist/client/research-data/", import.meta.url);
  const indexText = await readFile(new URL("index.json", dataRoot), "utf8");

  const index = JSON.parse(indexText);
  assert.equal(index.meta.title, "Portfolio Research Reader");
  assert.equal(index.portfolio.mandate.status, "working");
  assert.ok(index.companies.length > 0);

  await Promise.all(index.companies.map(async (summary) => {
    assert.match(summary.path, /^vault\/companies\/[^/]+\/[^/]+_[^/]+$/);
    assert.equal("documents" in summary, false);
    assert.equal("financials" in summary, false);
    assert.equal("ownership" in summary, false);

    const [, , exchange, directory] = summary.path.split("/");
    const chunkBase = `/research-data/companies/${encodeURIComponent(exchange)}/${encodeURIComponent(directory)}`;
    assert.equal(summary.profileUrl, `${chunkBase}/profile.json`);
    if (summary.ownershipUrl !== null) {
      assert.equal(summary.ownershipUrl, `${chunkBase}/ownership.json`);
    }

    const profile = JSON.parse(await readFile(
      new URL(`../dist/client${summary.profileUrl}`, import.meta.url),
      "utf8",
    ));
    assert.equal(profile.path, summary.path);
    assert.equal(profile.documents.length, summary.documentCount);
    assert.equal(profile.sources.length, summary.sourceCount);

    if (summary.ownershipUrl) {
      const ownership = JSON.parse(await readFile(
        new URL(`../dist/client${summary.ownershipUrl}`, import.meta.url),
        "utf8",
      ));
      assert.ok(Array.isArray(ownership.nodes));
      assert.ok(Array.isArray(ownership.edges));
      assert.ok(Array.isArray(ownership.groupSeries));
    }
  }));

  await assert.rejects(access(new URL("../app/data/repository.json", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
