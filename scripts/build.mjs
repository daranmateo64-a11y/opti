// Arma una sola página (dist/opti-vidrio.html) con el HTML, el CSS y el JS embebidos,
// lista para publicar en claude.ai y abrir desde el teléfono.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const title = html.match(/<title>(.*?)<\/title>/)[1];
const body = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/\s*<script[^>]*src="src\/app\.js"[^>]*><\/script>/, '');

// Los módulos se concatenan en orden de dependencia, sin import/export.
const js = ['src/optimizer.js', 'src/stock.js', 'src/app.js']
  .map((p) => read(p).replace(/^import .*;\n/gm, '').replace(/^export /gm, ''))
  .join('\n');

const out = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${read('styles.css')}
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/opti-vidrio.html'), out);
console.log('dist/opti-vidrio.html');
