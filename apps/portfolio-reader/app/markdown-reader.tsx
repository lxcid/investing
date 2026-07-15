"use client";

import type { Blockquote, Link, PhrasingContent, Root } from "mdast";
import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";

export type MarkdownDocument = {
  id: string;
  path: string;
  relativePath: string;
  kind: string;
  title: string;
  summary: string;
  attributes: Record<string, string | number | boolean | string[]>;
  body: string;
};

type MarkdownReaderProps = {
  body: string;
  currentDocument: MarkdownDocument;
  documents: MarkdownDocument[];
  onSelectDocument: (document: MarkdownDocument) => void;
};

const wikiTokenPattern = /(!)?\[\[([^\]\n]+)\]\]/g;
const wikiLinkPrefix = "#vault-link=";
const wikiEmbedPrefix = "#vault-embed=";

function normalizePath(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function stripMarkdownExtension(value: string) {
  return value.replace(/\.md$/i, "");
}

function wikiLabel(target: string) {
  const withoutAnchor = target.split("#", 1)[0];
  return stripMarkdownExtension(withoutAnchor.split("/").at(-1) ?? withoutAnchor);
}

function createWikiLink(rawValue: string, embedded: boolean): Link {
  const separator = rawValue.indexOf("|");
  const target = (separator === -1 ? rawValue : rawValue.slice(0, separator)).trim();
  const alias = separator === -1 ? "" : rawValue.slice(separator + 1).trim();
  const label = alias || wikiLabel(target);

  return {
    type: "link",
    url: `${embedded ? wikiEmbedPrefix : wikiLinkPrefix}${encodeURIComponent(target)}`,
    title: target,
    children: [
      {
        type: "text",
        value: embedded ? `Embedded reference: ${label}` : label,
      },
    ],
  };
}

/** Convert Obsidian wiki syntax in text nodes into ordinary mdast links. */
function remarkWikiLinks() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (index == null || !parent || !node.value.includes("[[")) return;

      const replacements: PhrasingContent[] = [];
      let cursor = 0;
      for (const match of node.value.matchAll(wikiTokenPattern)) {
        const start = match.index;
        if (start > cursor) {
          replacements.push({ type: "text", value: node.value.slice(cursor, start) });
        }
        replacements.push(createWikiLink(match[2], Boolean(match[1])));
        cursor = start + match[0].length;
      }

      if (cursor === 0) return;
      if (cursor < node.value.length) {
        replacements.push({ type: "text", value: node.value.slice(cursor) });
      }

      parent.children.splice(index, 1, ...replacements);
      return index + replacements.length;
    });
  };
}

function setCalloutProperties(node: Blockquote, calloutType: string) {
  node.data = {
    ...node.data,
    hProperties: {
      className: ["research-callout"],
      "data-callout": calloutType.toLowerCase(),
    },
  };
}

/** Preserve the reader's document shell while mdast handles the Markdown body. */
function remarkReaderConventions() {
  return (tree: Root) => {
    const firstNode = tree.children[0];
    if (firstNode?.type === "heading" && firstNode.depth === 1) {
      tree.children.shift();
    }

    visit(tree, "blockquote", (node) => {
      const firstParagraph = node.children[0];
      const firstChild = firstParagraph?.type === "paragraph" ? firstParagraph.children[0] : null;
      if (firstChild?.type !== "text") return;

      const callout = firstChild.value.match(/^\[!([^\]]+)\]\s*/);
      if (!callout) return;
      firstChild.value = firstChild.value.slice(callout[0].length);
      setCalloutProperties(node, callout[1]);
    });
  };
}

function parseWikiHref(href: string | undefined) {
  if (href?.startsWith(wikiLinkPrefix)) {
    return { embedded: false, target: decodeURIComponent(href.slice(wikiLinkPrefix.length)) };
  }
  if (href?.startsWith(wikiEmbedPrefix)) {
    return { embedded: true, target: decodeURIComponent(href.slice(wikiEmbedPrefix.length)) };
  }
  return null;
}

function resolveWikiDocument(
  target: string,
  currentDocument: MarkdownDocument,
  documents: MarkdownDocument[],
) {
  const pathTarget = stripMarkdownExtension(target.split("#", 1)[0].trim());
  if (!pathTarget) return currentDocument;

  const companyRoot = currentDocument.path.slice(0, -currentDocument.relativePath.length);
  const currentDirectory = currentDocument.path.slice(0, currentDocument.path.lastIndexOf("/") + 1);
  const normalizedTarget = normalizePath(pathTarget);
  const candidates = new Set([
    normalizedTarget,
    normalizePath(`${currentDirectory}${normalizedTarget}`),
    normalizePath(`${companyRoot}${normalizedTarget}`),
  ]);

  const exact = documents.find((document) =>
    candidates.has(stripMarkdownExtension(normalizePath(document.path))),
  );
  if (exact) return exact;

  if (!normalizedTarget.includes("/")) {
    const matchingBasenames = documents.filter(
      (document) =>
        stripMarkdownExtension(document.relativePath.split("/").at(-1) ?? "") === normalizedTarget,
    );
    if (matchingBasenames.length === 1) return matchingBasenames[0];
  }

  return null;
}

function headingSlug(value: string) {
  return decodeURIComponent(value)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function MarkdownReader({
  body,
  currentDocument,
  documents,
  onSelectDocument,
}: MarkdownReaderProps) {
  const components = useMemo<Components>(
    () => ({
      a({ children, href }) {
        const wikiLink = parseWikiHref(href);
        if (wikiLink) {
          const linkedDocument = resolveWikiDocument(
            wikiLink.target,
            currentDocument,
            documents,
          );
          if (!linkedDocument) {
            return (
              <span
                className={`wiki-link wiki-link-unresolved${wikiLink.embedded ? " wiki-embed" : ""}`}
                title={`Vault reference: ${wikiLink.target}`}
              >
                {children}
              </span>
            );
          }

          const anchor = wikiLink.target.includes("#")
            ? wikiLink.target.slice(wikiLink.target.indexOf("#") + 1)
            : "";
          return (
            <button
              className={`wiki-link${wikiLink.embedded ? " wiki-embed" : ""}`}
              onClick={() => {
                onSelectDocument(linkedDocument);
                if (anchor) {
                  window.setTimeout(() => {
                    document.getElementById(headingSlug(anchor))?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }, 0);
                }
              }}
              title={`Open ${linkedDocument.title}`}
              type="button"
            >
              {children}
            </button>
          );
        }

        const external = /^https?:\/\//i.test(href ?? "");
        return (
          <a
            href={href}
            rel={external ? "noreferrer" : undefined}
            target={external ? "_blank" : undefined}
          >
            {children}
            {external && <span aria-hidden="true"> ↗</span>}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="markdown-table-wrap">
            <table className="markdown-table">{children}</table>
          </div>
        );
      },
    }),
    [currentDocument, documents, onSelectDocument],
  );

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeSlug]}
        remarkPlugins={[remarkGfm, remarkReaderConventions, remarkWikiLinks]}
        skipHtml
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
