'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const errors = [];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'coverage'].includes(entry.name)) continue;
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(name); else files.push(name);
  }
}
walk(root);
for (const file of files) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  try {
    if (file.endsWith('.js')) new vm.Script(source, { filename: relative });
    if (file.endsWith('.json')) JSON.parse(source);
    if (file.endsWith('.wxml')) {
      for (const match of source.matchAll(/{{([\s\S]*?)}}/g)) new vm.Script('(' + match[1] + ')');
      let page;
      const script = file.replace(/\.wxml$/, '.js');
      vm.runInNewContext(fs.readFileSync(script, 'utf8'), { require: () => ({}), Page: value => { page = value; }, wx: {} });
      if (!page) throw new Error('Page() definition missing');
      for (const match of source.matchAll(/(?:bind|catch)(?::)?(?:tap|input|change|submit|confirm|blur|focus)="([a-zA-Z_$][\w$]*)"/g)) {
        if (typeof page[match[1]] !== 'function') throw new Error('Missing event handler: ' + match[1]);
      }
    }
  } catch (error) { errors.push(relative + ': ' + error.message); }
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'));
for (const page of manifest.pages) for (const extension of ['js', 'json', 'wxml', 'wxss']) {
  if (!fs.existsSync(path.join(root, 'miniprogram', page + '.' + extension))) errors.push('Missing page file: ' + page + '.' + extension);
}
const actions = new Set([...fs.readFileSync(path.join(root, 'cloudfunctions/campus/service.js'), 'utf8').matchAll(/async '([^']+)'/g)].map(match => match[1]));
for (const file of files.filter(p => p.includes(path.sep + 'miniprogram' + path.sep) && p.endsWith('.js'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:api\.call|invoke)\('([^']+)'/g)) {
    if (!actions.has(match[1])) errors.push('Unknown API action in ' + path.relative(root, file) + ': ' + match[1]);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Project checks passed: JavaScript, JSON, page files, WXML expressions, handlers and API action names.');
