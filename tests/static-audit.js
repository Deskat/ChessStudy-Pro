#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pages = ['index.html', 'pc.html'];
const failures = [];

function fail(page, message) {
  failures.push(page + ': ' + message);
}

for (const page of pages) {
  const file = path.join(root, page);
  if (!fs.existsSync(file)) {
    fail(page, 'file is missing');
    continue;
  }

  const html = fs.readFileSync(file, 'utf8');
  const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) fail(page, 'duplicate HTML id values: ' + duplicates.join(', '));

  const idSet = new Set(ids);
  const referencedIds = [...new Set([...html.matchAll(/\\$\\('([^']+)'\\)/g)].map(match => match[1]))];
  const missingIds = referencedIds.filter(id => !idSet.has(id));
  if (missingIds.length) fail(page, 'JavaScript refers to missing elements: ' + missingIds.join(', '));

  const scripts = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match => !/\\bsrc\\s*=/.test(match[1]));
  if (scripts.length !== 1) {
    fail(page, 'expected one inline application script; found ' + scripts.length);
  }

  scripts.forEach((match, index) => {
    try {
      new vm.Script(match[2], { filename: page + '#inline-script-' + (index + 1) });
    } catch (error) {
      fail(page, 'JavaScript syntax error: ' + error.message);
    }
  });

  const required = [
    ['move counter', 'id="moveCount"'],
    ['move history updates the counter', "$('moveCount').textContent='Всего ходов: '+moveHistory.length;"],
    ['analysis cancellation', 'function cancelAnalysis('],
    ['stale engine reply guard', 'if(!activeSearch)return;'],
    ['visible MultiPV rendering', 'function renderPvLines('],
    ['promotion choice', 'function openPromotionPicker('],
    ['draw detection', 'function isInsufficientMaterial('],
    ['position repetition key', 'function getPositionKey(']
  ];
  for (const [label, token] of required) {
    if (!html.includes(token)) fail(page, 'missing required feature: ' + label);
  }

  if (!html.includes('.board-wrap{width:min(78%,500px);max-width:500px')) {
    fail(page, 'board width rule is missing');
  }
  if (page === 'index.html' &&
      !html.includes('.board-wrap{width:min(78%,500px);max-width:500px;margin-inline:auto}')) {
    fail(page, 'mobile board width override is not constrained');
  }

  const functionNames = [...html.matchAll(/\\bfunction\\s+([A-Za-z_$][\\w$]*)\\s*\\(/g)]
    .map(match => match[1]);
  const duplicateFunctions = [...new Set(functionNames.filter((name, index) => functionNames.indexOf(name) !== index))];
  if (duplicateFunctions.length) fail(page, 'duplicate function declarations: ' + duplicateFunctions.join(', '));
}

const requiredAssets = [
  'pieces/cburnett/wK.svg',
  'pieces/cburnett-v2/wK.svg',
  'recognition/fenshot.bundle.js',
  'recognition/chess-tiles-v2.onnx',
  'engine/stockfish-19-lite-single.js',
  'engine/stockfish-19-single.js'
];
for (const asset of requiredAssets) {
  if (!fs.existsSync(path.join(root, asset))) fail('assets', 'missing local asset: ' + asset);
}

if (failures.length) {
  process.stderr.write('ChessStudy static audit FAILED\\n' + failures.map(item => '- ' + item).join('\\n') + '\\n');
  process.exit(1);
}

process.stdout.write('ChessStudy static audit passed.\\n');
process.stdout.write('Checked: mobile + PC HTML, inline JavaScript syntax, unique IDs, element references, core chess features and local assets.\\n');
