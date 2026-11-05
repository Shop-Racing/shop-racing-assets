const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = JSON.parse(read('scripts/sources.json'));
const css = 'const ARCHIVE_CSS = ' + JSON.stringify(read('src/ui/styles.css')) + ';';
const body = [css, ...files.map(p => '// Source: ' + p + '\n' + read(p))].join('\n');
const result = '/* GENERATED FILE — edit src/, then run npm run build. */\n(function () {\n  \'use strict\';\n' + body + '\n})();\n';
new vm.Script(result, {filename:'archives.js'});
if (process.argv.includes('--check')) {
  if (read('archives.js') !== result) throw new Error('archives.js est périmé : npm run build');
  console.log('Build synchronisé.');
} else {
  fs.writeFileSync(path.join(root, 'archives.js'), result);
  console.log('archives.js généré depuis ' + files.length + ' fichiers sources.');
}
