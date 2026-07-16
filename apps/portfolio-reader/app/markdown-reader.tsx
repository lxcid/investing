"use client";

import {
  type WikiEmbed,
  type WikiLink,
  type WikiReference,
  wikilinkHandlers,
} from "@lxcid/remark-wikilink";
import remarkGfmWithWikilink from "@lxcid/remark-wikilink/gfm";
import { slug } from "github-slugger";
import type { Blockquote, Root } from "mdast";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSlug from "rehype-slug";
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
  currentDocument: MarkdownDocument;
  documents: MarkdownDocument[];
  onSelectDocument: (document: MarkdownDocument) => void;
};

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
  const [withoutAnchor, anchor = ""] = target.split("#", 2);
  const pathLabel = stripMarkdownExtension(
    withoutAnchor.split("/").at(-1) ?? withoutAnchor,
  );
  return pathLabel || anchor || target;
}

/** Preserve the reader's preferred labels after the wiki parser builds mdast. */
function remarkReaderWikiPresentation() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "wikiLink" && node.type !== "wikiEmbed") return;
      const wikiNode = node as WikiLink | WikiEmbed;
      const label = wikiNode.alias || wikiLabel(wikiNode.target);
      wikiNode.alias =
        wikiNode.type === "wikiEmbed" ? `Embedded reference: ${label}` : label;
    });
  };
}

function wikiUrlResolver({ target, embed }: WikiReference) {
  return `${embed ? wikiEmbedPrefix : wikiLinkPrefix}${encodeURIComponent(target)}`;
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

export function MarkdownReader({
  currentDocument,
  documents,
  onSelectDocument,
}: MarkdownReaderProps) {
  const components: Components = {
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
        const anchorId = anchor ? slug(anchor) : "";
        return (
          <button
            className={`wiki-link${wikiLink.embedded ? " wiki-embed" : ""}`}
            onClick={() => {
              onSelectDocument(linkedDocument);
              if (anchorId) {
                window.setTimeout(() => {
                  document.getElementById(anchorId)?.scrollIntoView({
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
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown
        components={components}
        rehypePlugins={[rehypeSlug]}
        remarkRehypeOptions={{
          handlers: wikilinkHandlers({ resolveHref: wikiUrlResolver }),
        }}
        remarkPlugins={[
          remarkGfmWithWikilink,
          remarkReaderConventions,
          remarkReaderWikiPresentation,
        ]}
        skipHtml
      >
        {currentDocument.body}
      </ReactMarkdown>
    </div>
  );
}
