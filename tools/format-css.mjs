#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';

function formatCss(source) {
  const output = [];
  let line = '';
  let indent = 0;
  let quote = null;
  let comment = false;
  let pendingSpace = false;

  const emit = (value = line) => {
    const text = value.trim();
    if (text) output.push(`${'  '.repeat(indent)}${text}`);
    line = '';
    pendingSpace = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (comment) {
      line += char;
      if (char === '*' && next === '/') {
        line += next;
        index += 1;
        comment = false;
        emit();
      }
      continue;
    }

    if (quote) {
      line += char;
      if (char === '\\') {
        line += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      emit();
      line = '/*';
      comment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      if (pendingSpace && line) line += ' ';
      pendingSpace = false;
      quote = char;
      line += char;
      continue;
    }
    if (/\s/.test(char)) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && line && !'{;}'.includes(char)) line += ' ';
    pendingSpace = false;

    if (char === '{') {
      emit(`${line.trim()} {`);
      indent += 1;
    } else if (char === ';') {
      line += ';';
      emit();
    } else if (char === '}') {
      emit();
      indent = Math.max(0, indent - 1);
      output.push(`${'  '.repeat(indent)}}`);
      output.push('');
    } else {
      line += char;
    }
  }
  emit();
  return `${output.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/format-css.mjs <file...>');
  process.exit(1);
}

for (const file of files) {
  const source = await readFile(file, 'utf8');
  await writeFile(file, formatCss(source), 'utf8');
}
