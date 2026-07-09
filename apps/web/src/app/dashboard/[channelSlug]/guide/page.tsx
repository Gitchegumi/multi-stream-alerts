import fs from 'node:fs';
import path from 'node:path';
import { notFound, redirect } from 'next/navigation';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';
import { dashboardShellClass, dashboardTitleClass } from '@/components/layout-styles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const guideOrder = [
  'index',
  'user-guide/getting-started',
  'user-guide/dashboard',
  'user-guide/canvases',
  'user-guide/alerts',
  'user-guide/browser-sources',
  'user-guide/assets',
  'user-guide/account-settings',
  'user-guide/troubleshooting',
  'developer-guide/architecture',
  'developer-guide/local-development',
  'developer-guide/deployment',
  'developer-guide/environment-variables',
  'developer-guide/auth',
  'developer-guide/database',
  'developer-guide/overlays-and-canvases',
  'developer-guide/webhooks',
  'developer-guide/contributing',
  'releases',
  'security-scans',
  'audit/per-workspace-credentials',
];

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'code'; text: string };

type GuideDoc = {
  slug: string;
  title: string;
  blocks: MarkdownBlock[];
};

export default async function GuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ channelSlug: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const session = await requireDashboardSession();
  const { channelSlug } = await params;
  const { doc } = await searchParams;

  const channel = await prisma.channel.findUnique({ where: { slug: channelSlug } });
  if (!channel) notFound();

  const canView = await canViewChannel(session.user.id, session.user.role, channel.id);
  if (!canView) redirect('/dashboard?error=forbidden');

  const docs = readGuideDocs();
  const activeDoc = docs.find((item) => item.slug === (doc ?? guideOrder[0])) ?? docs[0];
  if (!activeDoc) {
    return (
      <main className={dashboardShellClass}>
        <section className="panel">
          <h1 className={dashboardTitleClass}>Guide</h1>
          <p className="muted">No documentation files are available in this build.</p>
        </section>
      </main>
    );
  }

  return (
    <main className={dashboardShellClass}>
      <section className="grid grid-cols-[minmax(210px,260px)_minmax(0,1fr)] items-start gap-4 max-[900px]:grid-cols-1 max-[900px]:items-stretch">
        <aside
          className="sticky top-[73px] grid min-w-0 gap-1 rounded-lg border border-line bg-panel p-2.5 shadow-brand"
          aria-label="Guide sections"
        >
          {docs.map((item) => (
            <a
              className={`rounded-md px-3 py-2.5 font-bold no-underline ${
                item.slug === activeDoc.slug
                  ? 'bg-surface-hover text-accent'
                  : 'text-muted hover:bg-surface-hover hover:text-accent'
              }`}
              href={`/dashboard/${encodeURIComponent(channel.slug)}/guide?doc=${encodeURIComponent(item.slug)}`}
              key={item.slug}
            >
              {item.title}
            </a>
          ))}
        </aside>
        <article className="grid min-w-0 gap-3.5 rounded-lg border border-line bg-panel p-6 shadow-brand">
          {activeDoc.blocks.map((block, index) => (
            <MarkdownBlockView
              block={block}
              channelSlug={channel.slug}
              docs={docs}
              key={`${block.type}-${index}`}
            />
          ))}
        </article>
      </section>
    </main>
  );
}

function readGuideDocs(): GuideDoc[] {
  const docsDir = resolveDocsDir();
  if (!docsDir) return [];

  const docs = readMarkdownFiles(docsDir);
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const orderedDocs = guideOrder.flatMap((slug) => bySlug.get(slug) ?? []);
  const orderedSlugs = new Set(orderedDocs.map((doc) => doc.slug));
  const remainingDocs = docs
    .filter((doc) => !orderedSlugs.has(doc.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return [...orderedDocs, ...remainingDocs];
}

function resolveDocsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'docs'),
    path.resolve(process.cwd(), '..', 'docs'),
    path.resolve(process.cwd(), '..', '..', 'docs'),
    path.resolve(process.cwd(), '..', '..', '..', 'docs'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function readMarkdownFiles(docsDir: string): GuideDoc[] {
  return collectMarkdownFiles(docsDir)
    .map((filePath) => {
      const relativePath = path.relative(docsDir, filePath);
      const slug = relativePath.replace(/\\/g, '/').replace(/\.md$/, '');
      const source = fs.readFileSync(filePath, 'utf8');
      const blocks = parseMarkdown(source);
      const title =
        blocks.find(
          (block): block is Extract<MarkdownBlock, { type: 'heading' }> =>
            block.type === 'heading' && block.level === 1,
        )?.text ?? titleFromSlug(slug);
      return { slug, title, blocks };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function collectMarkdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const marker = heading[1] ?? '#';
      blocks.push({
        type: 'heading',
        level: marker.length as 1 | 2 | 3,
        text: heading[2] ?? '',
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !/^(#{1,3})\s+/.test(lines[index] ?? '') &&
      !/^[-*]\s+/.test(lines[index] ?? '') &&
      !/^\d+\.\s+/.test(lines[index] ?? '') &&
      !(lines[index] ?? '').startsWith('```')
    ) {
      paragraph.push((lines[index] ?? '').trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function MarkdownBlockView({
  block,
  channelSlug,
  docs,
}: {
  block: MarkdownBlock;
  channelSlug: string;
  docs: GuideDoc[];
}) {
  if (block.type === 'heading') {
    if (block.level === 1) return <h1 className={dashboardTitleClass}>{block.text}</h1>;
    if (block.level === 2) return <h2 className="m-0 mt-2.5 text-[22px]">{block.text}</h2>;
    return <h3 className="m-0 mt-2 text-lg">{block.text}</h3>;
  }

  if (block.type === 'paragraph') {
    return (
      <p className="m-0 leading-[1.65] text-platinum">
        {renderInlineMarkdown(block.text, channelSlug, docs)}
      </p>
    );
  }

  if (block.type === 'code') {
    return (
      <pre className="overflow-auto rounded-lg border border-line bg-[#121317] p-3.5 text-soft-white">
        {block.text}
      </pre>
    );
  }

  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List>
      {block.items.map((item) => (
        <li className="leading-[1.65] text-platinum" key={item}>
          {renderInlineMarkdown(item, channelSlug, docs)}
        </li>
      ))}
    </List>
  );
}

function renderInlineMarkdown(text: string, channelSlug: string, docs: GuideDoc[]) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          className="rounded-[5px] border border-line bg-panel-soft px-[5px] py-0.5 text-soft-white"
          key={index}
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = guideHref(link[2] ?? '', channelSlug, docs);
      return (
        <a className="text-accent" href={href} key={index}>
          {link[1]}
        </a>
      );
    }

    return part;
  });
}

function guideHref(href: string, channelSlug: string, docs: GuideDoc[]) {
  if (/^https?:\/\//.test(href)) return href;
  const slug = href.replace(/^\.\//, '').replace(/\.md$/, '').replace(/\\/g, '/');
  if (slug && docs.some((doc) => doc.slug === slug)) {
    return `/dashboard/${encodeURIComponent(channelSlug)}/guide?doc=${encodeURIComponent(slug)}`;
  }
  const basename = slug.split('/').at(-1);
  const basenameMatch = docs.find((doc) => doc.slug.split('/').at(-1) === basename);
  if (basenameMatch) {
    return `/dashboard/${encodeURIComponent(channelSlug)}/guide?doc=${encodeURIComponent(
      basenameMatch.slug,
    )}`;
  }
  return href;
}

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
