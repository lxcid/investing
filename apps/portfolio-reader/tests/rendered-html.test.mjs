import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("../", import.meta.url);

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
  assert.match(html, /Reading the vault/);
  assert.match(html, /Loading the vault index/);
  assert.match(html, /Portfolio Reader/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships a small index with lazy company and ownership chunks", async () => {
  const dataRoot = new URL("../dist/client/research-data/", import.meta.url);
  const companyRoot = new URL(
    "companies/SGX/BSL_Raffles-Medical-Group/",
    dataRoot,
  );
  const [indexText, profileText, ownershipText, page, packageJson] = await Promise.all([
    readFile(new URL("index.json", dataRoot), "utf8"),
    readFile(new URL("profile.json", companyRoot), "utf8"),
    readFile(new URL("ownership.json", companyRoot), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  const index = JSON.parse(indexText);
  const profile = JSON.parse(profileText);
  const ownership = JSON.parse(ownershipText);
  assert.equal(index.meta.title, "Portfolio Research Reader");
  assert.equal(index.portfolio.mandate.status, "working");
  assert.equal(index.companies.length, 1);
  assert.equal(index.companies[0].metadata.ticker, "BSL");
  assert.equal(index.companies[0].documentCount, 9);
  assert.equal(index.companies[0].sourceCount, 15);
  assert.equal("documents" in index.companies[0], false);
  assert.equal("financials" in index.companies[0], false);
  assert.equal("ownership" in index.companies[0], false);
  assert.equal(profile.documents.length, 9);
  assert.equal(profile.sources.length, 15);
  assert.equal(profile.financials.period_end, "2025-12-31");
  assert.equal(ownership.nodes.length, 16);
  assert.equal(ownership.edges.length, 19);
  assert.ok(indexText.length < profileText.length);
  assert.ok(indexText.length < ownershipText.length);
  assert.match(page, /PortfolioView/);
  assert.match(page, /CompanyView/);
  assert.match(page, /\/research-data\/index\.json/);
  assert.match(page, /companyCache/);
  assert.match(page, /holding_component_id/);
  assert.match(packageJson, /"sync:data"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/data/repository.json", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("node_modules/react-loading-skeleton", appRoot)));
});
