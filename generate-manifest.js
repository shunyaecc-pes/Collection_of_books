/**
 * generate-manifest.js
 *
 * Run this locally whenever you add or update books:
 *   node generate-manifest.js
 *
 * It scans the `books/` directory and writes `books.json`,
 * which the web app reads at runtime (no server needed).
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const BOOKS_DIR     = path.resolve(__dirname, 'books');
const OUTPUT_FILE   = path.resolve(__dirname, 'books.json');

/**
 * Recursively scan a directory.
 * A folder containing `book.pdf` is treated as a book leaf node.
 */
function sortNodes(nodes) {
  const priority = { books: 0, articles: 1, papers: 2 };

  return nodes.slice().sort((a, b) => {
    const aName = (a.name || '').toLowerCase();
    const bName = (b.name || '').toLowerCase();

    if (a.kind === 'folder' && b.kind === 'folder') {
      const aPriority = priority[aName] ?? 99;
      const bPriority = priority[bName] ?? 99;
      if (aPriority !== bPriority) return aPriority - bPriority;
    }

    if (a.kind === 'book' && b.kind === 'book') {
      const aIsModern = /modern algebra|modernalgebra/.test(aName);
      const bIsModern = /modern algebra|modernalgebra/.test(bName);
      if (aIsModern !== bIsModern) return aIsModern ? -1 : 1;
    }

    return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
  });
}

function scanNode(absPath, relPath) {
  let entries;
  try {
    entries = fs.readdirSync(absPath, { withFileTypes: true });
  } catch {
    return null;
  }

  const fileNames = entries.filter(e => e.isFile()).map(e => e.name);
  const hasPdf    = fileNames.includes('book.pdf');

  if (hasPdf) {
    // ── Book leaf ──────────────────────────────────────────────────────────
    const descPath = path.join(absPath, 'book_description.json');
    let meta = {};
    if (fs.existsSync(descPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(descPath, 'utf-8'));
      } catch (err) {
        console.warn(`  [!] Could not parse ${descPath}: ${err.message}`);
      }
    }

    const pdfUrl = `books/${relPath}/book.pdf`;
    const node = {
      kind:        'book',
      name:        meta.title  || path.basename(absPath),
      path:        relPath,
      // Relative URL that GitHub Pages can serve directly
      pdfUrl,
      url:         meta.url || pdfUrl,
      title:       meta.title       || path.basename(absPath),
      author:      meta.author      || null,
      description: meta.description || null,
      year:        meta.year        || null,
      tags:        Array.isArray(meta.tags) ? meta.tags : [],
      type:        meta.type        || 'book',
      pages:       meta.pages       || null,
    };

    // Remove null fields to keep JSON lean
    Object.keys(node).forEach(k => node[k] === null && delete node[k]);
    return node;
  }

  // ── Folder node ────────────────────────────────────────────────────────────
  const children = sortNodes(
    entries
      .filter(e => e.isDirectory())
      .map(e => scanNode(
        path.join(absPath, e.name),
        relPath ? `${relPath}/${e.name}` : e.name
      ))
      .filter(Boolean)
  );

  // Skip folders that contain nothing
  if (!children.length) return null;

  return {
    kind:     'folder',
    name:     path.basename(absPath),
    path:     relPath,
    children,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(BOOKS_DIR)) {
  console.error(`\n[error] books/ directory not found at: ${BOOKS_DIR}\n`);
  process.exit(1);
}

console.log('\n📚  Shunya ECC — Generating manifest…\n');

const root     = scanNode(BOOKS_DIR, '');
const tree     = root ? sortNodes(root.children) : [];

// Count helpers
let bookCount   = 0;
let folderCount = 0;
function countNodes(nodes) {
  for (const n of nodes) {
    if (n.kind === 'book')   bookCount++;
    if (n.kind === 'folder') { folderCount++; countNodes(n.children || []); }
  }
}
countNodes(tree);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tree, null, 2), 'utf-8');

console.log(`  ✓  Found ${bookCount} book(s) across ${folderCount} folder(s)`);
console.log(`  ✓  Written → books.json`);
console.log('\n  Commit books.json to publish your changes.\n');
