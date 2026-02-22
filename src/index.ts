import manifest from "../manifest.json";
import example from "../example.md" with { type: "text" };
import { marked, type Token, type Tokens } from "marked";
import yaml from "js-yaml";

// --- CLI flags ---

const args = process.argv.slice(2);

if (args.includes("--manifest")) {
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.exit(0);
}

if (args.includes("--version")) {
  process.stdout.write((manifest as any).version + "\n");
  process.exit(0);
}

if (args.includes("--example")) {
  process.stdout.write(example);
  process.exit(0);
}

// --- Default mode: stdin Markdown → stdout Typst ---

const input = await Bun.stdin.text();
const { frontmatter, body } = splitFrontmatter(input);

interface FrontmatterData {
  title?: string;
  [key: string]: unknown;
}

let meta: FrontmatterData = {};
if (frontmatter) {
  meta = (yaml.load(frontmatter) as FrontmatterData) ?? {};
}

let output = "";

// Page setup
output += '#set page(paper: "a4")\n';
output += '#set text(font: "SimSun", size: 12pt, lang: "zh")\n';
output += '#set par(leading: 1.5em, first-line-indent: 2em)\n';
output += "\n";

// Title from frontmatter
if (meta.title) {
  output += `#let title = "${meta.title}"\n`;
  output += "\n";
  output += `#align(center, text(size: 22pt, weight: "bold")[${meta.title}])\n`;
  output += "#v(1em)\n";
  output += "\n";
}

// Parse and convert markdown body
const tokens = marked.lexer(body);
output += renderTokens(tokens);

process.stdout.write(output);

// --- Helper functions ---

function splitFrontmatter(text: string): {
  frontmatter: string | null;
  body: string;
} {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: null, body: text };
  }

  const rest = text.startsWith("---\r\n") ? text.slice(5) : text.slice(4);
  const idx = rest.indexOf("\n---");
  if (idx < 0) {
    return { frontmatter: null, body: text };
  }

  const fm = rest.slice(0, idx);
  let bodyStart = idx + 4; // skip "\n---"
  if (bodyStart < rest.length && rest[bodyStart] === "\n") {
    bodyStart++;
  } else if (bodyStart < rest.length && rest[bodyStart] === "\r") {
    bodyStart++;
    if (bodyStart < rest.length && rest[bodyStart] === "\n") {
      bodyStart++;
    }
  }

  return { frontmatter: fm, body: rest.slice(bodyStart) };
}

function renderTokens(tokens: Token[]): string {
  let result = "";

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const t = token as Tokens.Heading;
        result += `#heading(level: ${t.depth})[${renderInline(t.tokens)}]\n\n`;
        break;
      }

      case "paragraph": {
        const t = token as Tokens.Paragraph;
        result += `${renderInline(t.tokens)}\n\n`;
        break;
      }

      case "list": {
        const t = token as Tokens.List;
        for (const item of t.items) {
          const content = renderListItem(item);
          result += `- ${content}\n`;
        }
        result += "\n";
        break;
      }

      case "code": {
        const t = token as Tokens.Code;
        const content = t.text.replace(/\n$/, "");
        result += `\`\`\`\n${content}\n\`\`\`\n\n`;
        break;
      }

      case "hr":
        result += "#line(length: 100%)\n\n";
        break;

      case "space":
        break;

      default:
        if ("text" in token) {
          result += `${(token as { text: string }).text}\n\n`;
        }
        break;
    }
  }

  return result;
}

function renderListItem(item: Tokens.ListItem): string {
  let content = "";
  for (const t of item.tokens) {
    if (t.type === "text" && "tokens" in t && t.tokens) {
      content += renderInline(t.tokens);
    } else if (t.type === "paragraph" && "tokens" in t && t.tokens) {
      content += renderInline((t as Tokens.Paragraph).tokens);
    } else if ("text" in t) {
      content += (t as { text: string }).text;
    }
  }
  return content;
}

function renderInline(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  let result = "";

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        result += (token as Tokens.Text).text;
        break;

      case "strong": {
        const t = token as Tokens.Strong;
        result += `#strong[${renderInline(t.tokens)}]`;
        break;
      }

      case "em": {
        const t = token as Tokens.Em;
        result += `#emph[${renderInline(t.tokens)}]`;
        break;
      }

      case "codespan": {
        const t = token as Tokens.Codespan;
        result += `#raw("${t.text}")`;
        break;
      }

      case "br":
        result += "\n";
        break;

      default:
        if ("text" in token) {
          result += (token as { text: string }).text;
        }
        break;
    }
  }

  return result;
}
