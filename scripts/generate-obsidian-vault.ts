#!/usr/bin/env node
/**
 * Generate an Obsidian-ready graph layer under docs/graph/ from
 * docs/architecture/architecture-map.json.
 *
 * The docs/ directory is the Obsidian vault root. This script emits:
 *   docs/graph/services/<service>.md   one note per DI service, wikilinked
 *                                      to its constructor dependencies
 *   docs/graph/domains/<domain>.md     one hub note per DI registration file
 *   docs/graph/Routes.md               all HTTP routes grouped by source file
 *   docs/graph/Feature Flags.md        the server flag registry
 *   docs/graph/Home.md                 vault entry point, links domains + ADRs
 *
 * It also seeds docs/.obsidian/graph.json (color groups, hide-unresolved)
 * on first run only — an existing .obsidian config is never overwritten.
 *
 * docs/graph/ and docs/.obsidian/ are gitignored: everything here is
 * regenerable. Refresh the map first if services changed:
 *   npm run architecture:map:write && npm run obsidian:vault
 *
 * Usage:
 *   npx tsx scripts/generate-obsidian-vault.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const MAP_PATH = path.join(DOCS_DIR, 'architecture', 'architecture-map.json');
const GRAPH_DIR = path.join(DOCS_DIR, 'graph');
const OBSIDIAN_DIR = path.join(DOCS_DIR, '.obsidian');

interface RouteEntry {
  method: string;
  fullPath: string;
  sourceFile: string;
}

interface FlagEntry {
  name: string;
  envName: string;
  defaultValue: string;
  description: string;
  category: string;
}

interface DependencyEdge {
  from: string;
  to: string;
  file: string;
}

interface ArchitectureMap {
  meta: { project: string; tagline: string };
  routes: RouteEntry[];
  featureFlags: FlagEntry[];
  dependencies: DependencyEdge[];
}

function stripSuffix(value: string, suffix: string): string {
  return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
}

function domainOf(registrationFile: string): string {
  return stripSuffix(path.basename(registrationFile), '.services.ts');
}

// Obsidian resolves wikilinks by bare filename or full vault path — partial
// subpaths like [[services/x]] do not resolve from a vault rooted at docs/.
function serviceLink(name: string): string {
  return `[[graph/services/${name}|${name}]]`;
}

function domainLink(domain: string, label?: string): string {
  return `[[graph/domains/${domain}|${label ?? domain}]]`;
}

function writeNote(relPath: string, body: string): void {
  const filePath = path.join(GRAPH_DIR, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, body, 'utf8');
}

function generateServiceNotes(map: ArchitectureMap): {
  serviceCount: number;
  domains: Map<string, string[]>;
} {
  const dependsOn = new Map<string, DependencyEdge[]>();
  const usedBy = new Map<string, DependencyEdge[]>();
  for (const edge of map.dependencies) {
    dependsOn.set(edge.from, [...(dependsOn.get(edge.from) ?? []), edge]);
    usedBy.set(edge.to, [...(usedBy.get(edge.to) ?? []), edge]);
  }

  const nodes = [...new Set([...dependsOn.keys(), ...usedBy.keys()])].sort();

  // A service's domain is the registration file its constructor edges live
  // in. Leaf dependencies (never a `from`) have no registration of their own.
  const domains = new Map<string, string[]>();
  for (const node of nodes) {
    const outgoing = dependsOn.get(node) ?? [];
    const incoming = (usedBy.get(node) ?? []).slice().sort((a, b) => {
      return a.file.localeCompare(b.file);
    });
    const homeFile = outgoing[0]?.file;
    const domain = homeFile ? domainOf(homeFile) : undefined;
    if (domain) {
      domains.set(domain, [...(domains.get(domain) ?? []), node]);
    }

    const lines: string[] = [
      '---',
      `tags: [service${domain ? `, domain/${domain}` : ', leaf-dependency'}]`,
      '---',
      '',
      `# ${node}`,
      '',
      domain
        ? `Registered in \`${homeFile}\` — see ${domainLink(domain)}.`
        : 'Provided dependency (client, config, or primitive) — not registered via a domain file of its own.',
      '',
    ];
    if (outgoing.length > 0) {
      lines.push('## Depends on', '');
      for (const edge of outgoing.slice().sort((a, b) => {
        return a.to.localeCompare(b.to);
      })) {
        lines.push(`- ${serviceLink(edge.to)}`);
      }
      lines.push('');
    }
    if (incoming.length > 0) {
      lines.push('## Used by', '');
      for (const edge of incoming.slice().sort((a, b) => {
        return a.from.localeCompare(b.from);
      })) {
        lines.push(`- ${serviceLink(edge.from)} (via \`${edge.file}\`)`);
      }
      lines.push('');
    }
    writeNote(path.join('services', `${node}.md`), lines.join('\n'));
  }

  for (const [domain, members] of domains) {
    const lines: string[] = [
      '---',
      'tags: [domain]',
      '---',
      '',
      `# ${domain}.services.ts`,
      '',
      `DI registration domain — \`server/src/config/services/${domain}.services.ts\`.`,
      '',
      '## Services registered here',
      '',
      ...members.sort().map((m) => {
        return `- ${serviceLink(m)}`;
      }),
      '',
    ];
    writeNote(path.join('domains', `${domain}.md`), lines.join('\n'));
  }

  return { serviceCount: nodes.length, domains };
}

function generateRoutesNote(map: ArchitectureMap): void {
  const byFile = new Map<string, RouteEntry[]>();
  for (const route of map.routes) {
    byFile.set(route.sourceFile, [
      ...(byFile.get(route.sourceFile) ?? []),
      route,
    ]);
  }
  const lines: string[] = [
    '# Routes',
    '',
    `${map.routes.length} HTTP routes grouped by source file. Generated from the architecture map — see [[architecture/ROUTE_MAP|ROUTE_MAP]] for the maintained view.`,
    '',
  ];
  for (const [file, routes] of [...byFile.entries()].sort(([a], [b]) => {
    return a.localeCompare(b);
  })) {
    lines.push(`## \`${file}\``, '');
    for (const route of routes) {
      lines.push(`- \`${route.method} ${route.fullPath}\``);
    }
    lines.push('');
  }
  writeNote('Routes.md', lines.join('\n'));
}

function generateFlagsNote(map: ArchitectureMap): void {
  const lines: string[] = [
    '# Feature Flags',
    '',
    'Server flag registry (`server/src/config/feature-flags.ts`). Generated from the architecture map.',
    '',
    '| Env Var | Default | Category | Description |',
    '| --- | --- | --- | --- |',
    ...map.featureFlags.map((flag) => {
      return `| \`${flag.envName}\` | \`${flag.defaultValue}\` | ${flag.category} | ${flag.description} |`;
    }),
    '',
  ];
  writeNote('Feature Flags.md', lines.join('\n'));
}

function listVaultDocs(relDir: string): string[] {
  const dir = path.join(DOCS_DIR, relDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => {
      return f.endsWith('.md');
    })
    .sort();
}

function generateHomeNote(domains: Map<string, string[]>): void {
  const adrs = listVaultDocs('adr');
  const archDocs = listVaultDocs('architecture');
  const lines: string[] = [
    '# Vidra Graph — Home',
    '',
    'Entry point for the docs/ vault. The `graph/` folder is generated —',
    'regenerate after service changes with:',
    '',
    '```bash',
    'npm run architecture:map:write && npm run obsidian:vault',
    '```',
    '',
    '## Service domains (DI registration files)',
    '',
    ...[...domains.keys()].sort().map((d) => {
      return `- ${domainLink(d, `${d}.services.ts`)}`;
    }),
    '',
    '## Indexes',
    '',
    '- [[graph/Routes|Routes]]',
    '- [[graph/Feature Flags|Feature Flags]]',
    '',
    '## Architecture decision records',
    '',
    ...adrs.map((f) => {
      return `- [[adr/${stripSuffix(f, '.md')}]]`;
    }),
    '',
    '## Architecture docs',
    '',
    ...archDocs.map((f) => {
      return `- [[architecture/${stripSuffix(f, '.md')}]]`;
    }),
    '',
  ];
  writeNote('Home.md', lines.join('\n'));
}

/** Seed graph view settings on first run only — never clobber user config. */
function seedObsidianConfig(): boolean {
  const graphJson = path.join(OBSIDIAN_DIR, 'graph.json');
  if (fs.existsSync(graphJson)) return false;
  fs.mkdirSync(OBSIDIAN_DIR, { recursive: true });
  const settings = {
    'collapse-filter': true,
    search: '',
    showTags: false,
    showAttachments: false,
    hideUnresolved: true,
    showOrphans: true,
    'collapse-color-groups': false,
    colorGroups: [
      { query: 'path:adr', color: { a: 1, rgb: 0xc792ea } },
      { query: 'path:graph/domains', color: { a: 1, rgb: 0x89ddff } },
      { query: 'path:graph/services', color: { a: 1, rgb: 0x82aaff } },
      { query: 'path:architecture', color: { a: 1, rgb: 0xc3e88d } },
      { query: 'path:design', color: { a: 1, rgb: 0xf78c6c } },
      { query: 'path:audits', color: { a: 1, rgb: 0xffcb6b } },
    ],
    'collapse-display': true,
    nodeSizeMultiplier: 1.2,
    lineSizeMultiplier: 1,
    centerStrength: 0.4,
    repelStrength: 12,
    linkStrength: 1,
    linkDistance: 200,
    scale: 0.6,
    close: false,
  };
  fs.writeFileSync(graphJson, JSON.stringify(settings, null, 2), 'utf8');
  return true;
}

function main(): void {
  const map = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')) as ArchitectureMap;

  fs.rmSync(GRAPH_DIR, { recursive: true, force: true });
  const { serviceCount, domains } = generateServiceNotes(map);
  generateRoutesNote(map);
  generateFlagsNote(map);
  generateHomeNote(domains);
  const seeded = seedObsidianConfig();

  console.log(
    `docs/graph/ regenerated: ${serviceCount} services, ${domains.size} domains, ` +
      `${map.routes.length} routes, ${map.featureFlags.length} flags.` +
      (seeded ? ' Seeded docs/.obsidian/graph.json.' : '')
  );
  console.log('Open the docs/ folder as an Obsidian vault to view the graph.');
}

main();
