import fs from 'node:fs';
import path from 'node:path';
import { notFound, redirect } from 'next/navigation';
import { canViewChannel, prisma } from '@multi-stream-alerts/database';
import { requireDashboardSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const guideOrder = [
  'getting-started',
  'dashboard',
  'canvases',
  'alerts',
  'browser-sources',
  'assets',
  'account-settings',
  'troubleshooting',
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
      <main className="dashboard-shell">
        <section className="panel">
          <h1 className="dashboard-title">Guide</h1>
          <p className="muted">No user guide documents are available in this build.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <section className="guide-layout">
        <aside className="guide-tabs" aria-label="Guide sections">
          {docs.map((item) => (
            <a
              className={`guide-tab${item.slug === activeDoc.slug ? ' guide-tab-active' : ''}`}
              href={`/dashboard/${encodeURIComponent(channel.slug)}/guide?doc=${encodeURIComponent(item.slug)}`}
              key={item.slug}
            >
              {item.title}
            </a>
          ))}
        </aside>
        <article className="guide-document">
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

  return guideOrder.flatMap((slug) => {
    const filePath = path.join(docsDir, `${slug}.md`);
    if (!fs.existsSync(filePath)) return [];
    const source = fs.readFileSync(filePath, 'utf8');
    const blocks = parseMarkdown(source);
    const title =
      blocks.find(
        (block): block is Extract<MarkdownBlock, { type: 'heading' }> =>
          block.type === 'heading' && block.level === 1,
      )?.text ?? titleFromSlug(slug);
    return [{ slug, title, blocks }];
  });
}

function resolveDocsDir() {
  const candidates = [
    path.resolve(process.cwd(), 'docs', 'user-guide'),
    path.resolve(process.cwd(), '..', '..', 'docs', 'user-guide'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
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
    if (block.level === 1) return <h1 className="dashboard-title">{block.text}</h1>;
    if (block.level === 2) return <h2>{block.text}</h2>;
    return <h3>{block.text}</h3>;
  }

  if (block.type === 'paragraph') {
    return <p>{renderInlineMarkdown(block.text, channelSlug, docs)}</p>;
  }

  if (block.type === 'code') {
    return <pre>{block.text}</pre>;
  }

  const List = block.ordered ? 'ol' : 'ul';
  return (
    <List>
      {block.items.map((item) => (
        <li key={item}>{renderInlineMarkdown(item, channelSlug, docs)}</li>
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
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = guideHref(link[2] ?? '', channelSlug, docs);
      return (
        <a href={href} key={index}>
          {link[1]}
        </a>
      );
    }

    return part;
  });
}

function guideHref(href: string, channelSlug: string, docs: GuideDoc[]) {
  if (/^https?:\/\//.test(href)) return href;
  const slug = href.split('/').at(-1)?.replace(/\.md$/, '');
  if (slug && docs.some((doc) => doc.slug === slug)) {
    return `/dashboard/${encodeURIComponent(channelSlug)}/guide?doc=${encodeURIComponent(slug)}`;
  }
  return href;
}

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
