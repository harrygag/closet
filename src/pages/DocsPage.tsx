import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Code2,
  Bot,
  Loader2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

/**
 * Docs experience.
 *
 * Sources three markdown files served as static assets out of /public:
 *   - /ARCHITECTURE.md
 *   - /FUNCTIONS.md
 *   - /AGENT.md   (next-manager onboarding — written by the manager agent)
 *
 * They're fetched at runtime (no rebuild needed when the docs agent refreshes
 * the files) and rendered with react-markdown + remark-gfm.
 *
 * Each file is parsed client-side by splitting on top-level `## ` headings.
 * Every `## ` becomes a sidebar entry; the body is everything from that
 * heading until the next `## ` (or EOF).
 */

interface DocSource {
  key: 'architecture' | 'functions' | 'agent';
  label: string;
  url: string;
  icon: typeof BookOpen;
}

const DOC_SOURCES: DocSource[] = [
  { key: 'architecture', label: 'Architecture', url: '/ARCHITECTURE.md', icon: BookOpen },
  { key: 'functions', label: 'Functions', url: '/FUNCTIONS.md', icon: Code2 },
  { key: 'agent', label: 'Agent onboarding', url: '/AGENT.md', icon: Bot },
];

interface DocSection {
  /** Slug like `1-project-overview` — safe for use as an id. */
  id: string;
  /** Display label — heading text minus the leading `## `. */
  title: string;
  /** Raw markdown body, including the original `## heading` line. */
  body: string;
}

interface ParsedDoc {
  /** Markdown preamble before the first `## ` (often the `# Title` + intro). */
  intro: string;
  sections: DocSection[];
}

/** Slugify a heading title for use as an anchor id. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

/** Split markdown into intro + `## ` sections. */
function parseDoc(md: string): ParsedDoc {
  const lines = md.split(/\r?\n/);
  const sections: DocSection[] = [];
  let intro = '';
  let current: { title: string; body: string[] } | null = null;
  const usedIds = new Set<string>();

  const flush = () => {
    if (!current) return;
    let id = slugify(current.title);
    let i = 2;
    while (usedIds.has(id)) {
      id = `${slugify(current.title)}-${i++}`;
    }
    usedIds.add(id);
    sections.push({
      id,
      title: current.title,
      body: current.body.join('\n'),
    });
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) {
        flush();
      } else {
        intro = intro.trimEnd();
      }
      current = { title: h2[1], body: [line] };
    } else if (current) {
      current.body.push(line);
    } else {
      intro += line + '\n';
    }
  }
  flush();

  return { intro: intro.trim(), sections };
}

export function DocsPage() {
  const [activeDoc, setActiveDoc] = useState<DocSource['key']>('architecture');
  const [activeSection, setActiveSection] = useState<string>('__intro__');

  // Cache parsed docs by key.
  const [docs, setDocs] = useState<Record<string, ParsedDoc | null>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  // Fetch all three on mount.
  useEffect(() => {
    let cancelled = false;
    DOC_SOURCES.forEach((src) => {
      setLoading((l) => ({ ...l, [src.key]: true }));
      fetch(src.url, { cache: 'no-cache' })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} — ${src.url} not found`);
          }
          return res.text();
        })
        .then((text) => {
          if (cancelled) return;
          setDocs((d) => ({ ...d, [src.key]: parseDoc(text) }));
          setErrors((e) => ({ ...e, [src.key]: null }));
        })
        .catch((err) => {
          if (cancelled) return;
          setErrors((e) => ({ ...e, [src.key]: err?.message ?? 'Failed to load' }));
          setDocs((d) => ({ ...d, [src.key]: null }));
        })
        .finally(() => {
          if (!cancelled) setLoading((l) => ({ ...l, [src.key]: false }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When switching docs, reset to intro by default.
  useEffect(() => {
    setActiveSection('__intro__');
  }, [activeDoc]);

  const currentDoc = docs[activeDoc];
  const currentError = errors[activeDoc];
  const isLoading = loading[activeDoc];

  const currentBody = useMemo(() => {
    if (!currentDoc) return '';
    if (activeSection === '__intro__') {
      return currentDoc.intro || currentDoc.sections[0]?.body || '';
    }
    const found = currentDoc.sections.find((s) => s.id === activeSection);
    return found?.body ?? currentDoc.intro;
  }, [currentDoc, activeSection]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-blue-900/10 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-5">
          <h1 className="text-3xl font-bold text-white mb-1 flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-blue-400" />
            Project Docs
          </h1>
          <p className="text-gray-400 text-sm">
            Architecture, function reference, and next-agent onboarding — everything needed to come up to speed cold.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Sidebar */}
          <aside className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-3 h-fit md:sticky md:top-4 max-h-[85vh] overflow-y-auto">
            <nav className="space-y-4">
              {DOC_SOURCES.map((src) => {
                const isActiveDoc = activeDoc === src.key;
                const parsed = docs[src.key];
                const err = errors[src.key];
                const ld = loading[src.key];
                return (
                  <div key={src.key}>
                    <button
                      type="button"
                      onClick={() => setActiveDoc(src.key)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                        isActiveDoc
                          ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                          : 'text-gray-300 hover:text-white hover:bg-gray-800/60 border border-transparent'
                      }`}
                    >
                      <src.icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{src.label}</span>
                      {ld && <Loader2 className="h-3 w-3 animate-spin text-gray-500" />}
                    </button>

                    {isActiveDoc && parsed && (
                      <ul className="mt-1 ml-1 border-l border-gray-700/50 pl-2 space-y-0.5">
                        <li>
                          <button
                            type="button"
                            onClick={() => setActiveSection('__intro__')}
                            className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${
                              activeSection === '__intro__'
                                ? 'text-blue-300 bg-blue-500/10'
                                : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
                            }`}
                          >
                            Overview
                          </button>
                        </li>
                        {parsed.sections.map((sec) => {
                          const isActive = activeSection === sec.id;
                          return (
                            <li key={sec.id}>
                              <button
                                type="button"
                                onClick={() => setActiveSection(sec.id)}
                                className={`w-full text-left text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                                  isActive
                                    ? 'text-blue-300 bg-blue-500/10'
                                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/60'
                                }`}
                              >
                                <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60" />
                                <span className="truncate">{sec.title}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {isActiveDoc && err && (
                      <p className="mt-1 ml-1 text-[11px] text-amber-300/80 px-2 py-1">
                        {err}
                      </p>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <main className="bg-gray-900/60 border border-gray-700/50 rounded-xl p-5 md:p-7 min-h-[60vh]">
            {isLoading && !currentDoc && (
              <div className="flex flex-col items-center justify-center text-gray-400 py-20">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <p className="text-sm">Loading docs…</p>
              </div>
            )}
            {currentError && !currentDoc && (
              <div className="bg-amber-900/15 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-amber-200 font-medium text-sm mb-1">Doc not available yet</p>
                  <p className="text-amber-100/70 text-xs">{currentError}</p>
                </div>
              </div>
            )}
            {currentDoc && (
              <article className="text-gray-200 text-[14px] leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {currentBody}
                </ReactMarkdown>
              </article>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Markdown component overrides — manual prose styling, since the project
 * doesn't ship @tailwindcss/typography.
 * ------------------------------------------------------------------------- */

const headingId = (children: ReactNode): string => {
  const text =
    typeof children === 'string'
      ? children
      : Array.isArray(children)
        ? children.map((c) => (typeof c === 'string' ? c : '')).join('')
        : '';
  return slugify(text);
};

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1
      id={headingId(children)}
      className="text-2xl md:text-3xl font-bold text-white mt-2 mb-4 pb-2 border-b border-gray-700/60"
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      id={headingId(children)}
      className="text-xl md:text-2xl font-semibold text-white mt-7 mb-3 pb-1 border-b border-gray-800"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={headingId(children)}
      className="text-lg font-semibold text-blue-200 mt-5 mb-2"
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      id={headingId(children)}
      className="text-base font-semibold text-blue-100 mt-4 mb-1.5"
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-gray-200 my-3 leading-relaxed">{children}</p>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="text-blue-400 hover:text-blue-300 underline decoration-blue-400/40 hover:decoration-blue-300 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="text-white font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="text-gray-100 italic">{children}</em>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside ml-6 my-3 space-y-1.5 text-gray-200 marker:text-gray-500">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside ml-6 my-3 space-y-1.5 text-gray-200 marker:text-gray-500">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  hr: () => <hr className="my-6 border-gray-700/60" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-500/50 bg-blue-500/5 pl-4 pr-3 py-2 my-3 text-gray-100 italic rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // Distinguish inline `code` vs block ```code``` — react-markdown v10 no
    // longer passes the `inline` prop; block code is wrapped in <pre>, so
    // inline = no `language-*` className AND no newline in content.
    const text = String(children ?? '');
    const isBlock = /language-/.test(className ?? '') || text.includes('\n');
    if (isBlock) {
      return (
        <code className={`${className ?? ''} block`}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-800 text-amber-200 px-1.5 py-0.5 rounded text-[12.5px] font-mono border border-gray-700/60">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-950/80 border border-gray-700/60 rounded-lg p-3 my-4 overflow-x-auto text-[12.5px] leading-relaxed text-gray-100 font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="w-full border-collapse text-[13px] text-gray-200">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-800/60">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left font-semibold text-gray-100 px-3 py-2 border border-gray-700/60">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border border-gray-700/40 align-top">{children}</td>
  ),
};
