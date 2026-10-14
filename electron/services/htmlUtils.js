import sanitizeHtml from "sanitize-html";
import TurndownService from "turndown";
import { marked } from "marked";

const SANITIZE_OPTIONS = {
  allowedTags: [
    "p",
    "br",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
    "label",
    "input",
    "span",
    "div",
  ],
  allowedAttributes: {
    a: ["href", "rel"],
    ul: ["data-type"],
    li: ["data-type", "data-checked"],
    ol: ["start"],
    input: ["type", "checked", "disabled"],
    code: ["class"],
    pre: ["class"],
  },
  allowedClasses: { code: ["language-*"], pre: ["language-*"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer nofollow",
    }),
  },
  exclusiveFilter: (frame) =>
    frame.tag === "input" && frame.attribs.type !== "checkbox",
};

export function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html ?? ""), SANITIZE_OPTIONS);
}

function decodeBasicEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// Plain-text version used for search and previews.
export function htmlToText(html) {
  const withBreaks = String(html ?? "").replace(
    /<\/(p|div|h[1-6]|li|blockquote|pre|tr)>|<br\s*\/?>|<hr\s*\/?>/gi,
    (m) => `${m}\n`,
  );
  const stripped = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return decodeBasicEntities(stripped)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function createTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  td.keep(["u"]);
  td.addRule("taskItem", {
    filter: (node) =>
      node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
    replacement: (content, node) => {
      const checked = node.getAttribute("data-checked") === "true";
      const clean = content
        .replace(/^\n+/, "")
        .replace(/\n+$/, "")
        .replace(/\n/g, "\n  ");
      return `- [${checked ? "x" : " "}] ${clean}\n`;
    },
  });
  return td;
}

export function htmlToMarkdown(html) {
  return createTurndown().turndown(sanitizeNoteHtml(html)).trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToHtml(text) {
  const lines = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  return lines
    .map((l) => (l.trim() === "" ? "<p></p>" : `<p>${escapeHtml(l)}</p>`))
    .join("");
}

// Markdown -> HTML (sanitised). Markdown task lists become editor checklists.
export function markdownToHtml(md) {
  const raw = marked.parse(String(md ?? ""), {
    async: false,
    gfm: true,
    breaks: false,
  });
  let html = sanitizeNoteHtml(raw);
  html = html.replace(
    /<li><input\s+([^>]*?)type="checkbox"([^>]*?)>\s*([\s\S]*?)<\/li>/g,
    (_m, a, b, body) => {
      const checked = /checked/.test(a + b);
      return `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? " checked" : ""}><span></span></label><div><p>${body.trim()}</p></div></li>`;
    },
  );
  html = html.replace(
    /<ul>(\s*<li data-type="taskItem")/g,
    '<ul data-type="taskList">$1',
  );
  return html;
}

// A complete, script-free HTML document used for PDF export.
export function noteToHtmlDocument(note) {
  const title = escapeHtml(note.title || "Untitled");
  const body = sanitizeNoteHtml(note.content_html);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55;color:#1c1917;margin:0;padding:0}
  h1.note-title{font-size:26px;margin:0 0 16px}
  h1,h2,h3{line-height:1.25}
  pre{background:#f5f5f4;padding:10px;border-radius:6px;white-space:pre-wrap}
  code{background:#f5f5f4;padding:1px 4px;border-radius:4px}
  blockquote{border-left:3px solid #d6d3d1;margin-left:0;padding-left:12px;color:#57534e}
  ul[data-type="taskList"]{list-style:none;padding-left:4px}
  ul[data-type="taskList"] li{display:flex;gap:8px}
  ul[data-type="taskList"] li>div{flex:1}
  li[data-checked="true"]>div{text-decoration:line-through;color:#78716c}
  a{color:#b45309}
</style></head><body><h1 class="note-title">${title}</h1>${body}</body></html>`;
}
