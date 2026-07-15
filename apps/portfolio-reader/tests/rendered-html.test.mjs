import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
    const profileUrl = new URL(`../dist/client${summary.profileUrl}`, import.meta.url);
    assert.ok(summary.profileUrl.startsWith(`${chunkBase}/`));
    const profileMatch = summary.profileUrl
      .slice(chunkBase.length + 1)
      .match(/^profile\.([a-f0-9]{16})\.json$/);
    assert.ok(profileMatch, `Expected a content-addressed profile URL for ${summary.path}`);

    const profileText = await readFile(profileUrl, "utf8");
    const profile = JSON.parse(profileText);
    assert.equal(
      profileMatch[1],
      createHash("sha256").update(profileText).digest("hex").slice(0, 16),
    );
    assert.equal(profile.path, summary.path);
    assert.equal(profile.documents.length, summary.documentCount);
    assert.equal(profile.sources.length, summary.sourceCount);

    if (summary.ownershipUrl) {
      assert.ok(summary.ownershipUrl.startsWith(`${chunkBase}/`));
      const ownershipMatch = summary.ownershipUrl
        .slice(chunkBase.length + 1)
        .match(/^ownership\.([a-f0-9]{16})\.json$/);
      assert.ok(ownershipMatch, `Expected a content-addressed ownership URL for ${summary.path}`);
      const ownershipText = await readFile(
        new URL(`../dist/client${summary.ownershipUrl}`, import.meta.url),
        "utf8",
      );
      const ownership = JSON.parse(ownershipText);
      assert.equal(
        ownershipMatch[1],
        createHash("sha256").update(ownershipText).digest("hex").slice(0, 16),
      );
      assert.ok(Array.isArray(ownership.nodes));
      assert.ok(Array.isArray(ownership.edges));
      assert.ok(Array.isArray(ownership.groupSeries));
    }
  }));

  await assert.rejects(access(new URL("../app/data/repository.json", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("serves content-addressed research chunks as immutable assets", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("chunk-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const chunkPath =
    "/research-data/companies/SGX/EXAMPLE_Company/profile.0123456789abcdef.json";
  let assetRequested = false;

  const response = await worker.fetch(
    new Request(`http://localhost${chunkPath}`),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequested = true;
          assert.equal(new URL(request.url).pathname, chunkPath);
          return new Response("{}", {
            headers: {
              "cache-control": "public, max-age=0, must-revalidate",
              "content-type": "application/json",
            },
          });
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(assetRequested, true);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31556952, immutable");
  assert.equal(await response.text(), "{}");
});
