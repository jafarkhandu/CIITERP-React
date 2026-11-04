#!/usr/bin/env node
/**
 * Angular component CSS is "emulated-encapsulated": it only affects that one component.
 * Plain CSS in React is global, so generic class names (.form-group, .page-header ...)
 * from different screens would collide.
 *
 * This script converts an Angular component stylesheet into a scoped one:
 *
 *   node scripts/scope-css.mjs <input.css> <scopeClass> [output.css]
 *
 *  - every selector is prefixed with `.scopeClass `
 *  - :host                  -> .scopeClass
 *  - :host-context(X) .a    -> X .scopeClass .a
 *  - ::ng-deep              -> removed
 *  - @keyframes names       -> prefixed with scopeClass (and animation refs rewritten)
 *
 * In the React component, wrap the screen in <div className="ciit-host scopeClass">.
 */
import fs from 'node:fs';
import postcss from 'postcss';

const [, , input, scope, output] = process.argv;
if (!input || !scope) {
  console.error('Usage: node scripts/scope-css.mjs <input.css> <scopeClass> [output.css]');
  process.exit(1);
}

const S = `.${scope}`;
const css = fs.readFileSync(input, 'utf8');
const root = postcss.parse(css);

// collect keyframe names so they can be namespaced
const kf = new Set();
root.walkAtRules(/keyframes$/i, (r) => kf.add(r.params.trim()));

function scopeSelector(sel) {
  let s = sel.trim().replace(/::ng-deep/g, '').trim();
  if (!s) return s;

  // :host-context(X) rest  ->  X .scope rest
  const ctx = s.match(/^:host-context\((.+?)\)\s*(.*)$/);
  if (ctx) {
    const [, x, rest] = ctx;
    return `${x} ${S}${rest ? ' ' + rest : ''}`;
  }
  // :host(.x) rest -> .scope.x rest
  const hostArg = s.match(/^:host\((.+?)\)\s*(.*)$/);
  if (hostArg) {
    const [, x, rest] = hostArg;
    return `${S}${x}${rest ? ' ' + rest : ''}`;
  }
  if (s.startsWith(':host')) return s.replace(/^:host/, S);

  // theme selectors that live outside the component: [data-theme=dark] .a -> [data-theme=dark] .scope .a
  const theme = s.match(/^((?:html|body|:root)?\[data-[^\]]+\](?:\.[\w-]+)*)\s+(.*)$/);
  if (theme) return `${theme[1]} ${S} ${theme[2]}`;

  if (/^(html|body|:root)$/.test(s)) {
    console.warn(`  ! global selector "${s}" kept as-is in ${input} (move it to src/styles.css if needed)`);
    return s;
  }
  return `${S} ${s}`;
}

root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
  rule.selectors = rule.selectors.map(scopeSelector);
});

root.walkAtRules(/keyframes$/i, (r) => {
  r.params = `${scope}-${r.params.trim()}`;
});
root.walkDecls(/^animation(-name)?$/i, (d) => {
  for (const name of kf) {
    d.value = d.value.replace(new RegExp(`(^|[\\s,])${name}(?=[\\s,;]|$)`, 'g'), `$1${scope}-${name}`);
  }
});

const out = root.toString();
if (output) fs.writeFileSync(output, out);
else process.stdout.write(out);
