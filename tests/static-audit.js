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
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicates.length) fail(page, 'duplicate HTML id values: ' + duplicates.join(', '));

  const idSet = new Set(ids);
  const referencedIds = [...new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]))];
  const missingIds = referencedIds.filter(id => !idSet.has(id));
  if (missingIds.length) fail(page, 'JavaScript refers to missing elements: ' + missingIds.join(', '));

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/.test(match[1]));
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

  const mateHelpers = html.match(/function formatRussianMoveCount\(count\)\{[\s\S]*?\n\}\nfunction mateAnnouncement\(mateScore,sideToMove\)\{[\s\S]*?\n\}/);
  if (!mateHelpers) {
    fail(page, 'mate announcement helpers could not be isolated for unit checks');
  } else {
    try {
      const context = {};
      vm.runInNewContext(mateHelpers[0] + "\nthis.__mateCases = [" +
        "mateAnnouncement(3, 'w'), mateAnnouncement(-1, 'w'), " +
        "mateAnnouncement(21, 'b'), mateAnnouncement(14, 'w')" +
        "];", context);
      const expected = [
        'Мат чёрным: через 3 хода',
        'Мат белым: через 1 ход',
        'Мат белым: через 21 ход',
        'Мат чёрным: через 14 ходов'
      ];
      if (JSON.stringify(context.__mateCases) !== JSON.stringify(expected)) {
        fail(page, 'mate side or Russian move-count formatting is incorrect');
      }
    } catch (error) {
      fail(page, 'mate announcement unit check failed: ' + error.message);
    }
  }

  const required = [
    ['move counter', 'id="moveCount"'],
    ['move history updates the counter', "$('moveCount').textContent='Всего ходов: '+moveHistory.length;"],
    ['analysis cancellation', 'function cancelAnalysis('],
    ['stale engine reply guard', 'if(!activeSearch)return;'],
    ['visible MultiPV rendering', 'function renderPvLines('],
    ['promotion choice', 'function openPromotionPicker('],
    ['draw detection', 'function isInsufficientMaterial('],
    ['position repetition key', 'function getPositionKey('],
    ['mate distance display', 'id="mateDistance"'],
    ['mate score conversion', 'function mateAnnouncement('],
    ['minimum 20-ply analysis', "depth:Math.max(20,Number($('depthSelect').value)||20)"],
    ['compact variation output', "return 'Вариант '+n+(item.score?' ('+item.score+')':'');"],
    ['recommended queen promotion', "kind==='q'?' recommended'"]
  ];
  for (const [label, token] of required) {
    if (!html.includes(token)) fail(page, 'missing required feature: ' + label);
  }

  if (!html.includes('.mate-distance{')) fail(page, 'mate distance style is missing');
  if (html.includes('.sq.promotion-capture-target') || html.includes('getPromotionCaptureTargets')) {
    fail(page, 'promotion capture highlighting must be fully removed');
  }
  if (!html.includes('.promotion-choice.recommended{')) fail(page, 'recommended promotion choice highlight is missing');

  if (!html.includes('.board-wrap{width:min(78%,500px);max-width:500px')) {
    fail(page, 'board width rule is missing');
  }
  if (page === 'index.html' &&
      !html.includes('.board-wrap{width:min(78%,500px);max-width:500px;margin-inline:auto}')) {
    fail(page, 'mobile board width override is not constrained');
  }

  const pvRenderer = html.match(/function renderPvLines\(\)\{[\s\S]*?\n\}/);
  if (!pvRenderer) {
    fail(page, 'PV renderer could not be isolated for unit checks');
  } else {
    try {
      const output = { textContent: '', hidden: false };
      const context = {
        pvLines: {
          1: { score: '-0.10', pv: 'g8f6 d2d4 e7e6 c2c4 f8e7 g1f3 e8g8 b2b3 b7b6 b1c3' },
          2: { score: '-0.11', pv: 'e7e6 c2c4 f8e7 b1c3 d7d5 g1f3 g8f6 d2d4 e8g8' }
        },
        $: () => output
      };
      vm.runInNewContext(pvRenderer[0], context);
      vm.runInNewContext('renderPvLines();', context);
      const expected = 'Вариант 1 (-0.10)\nВариант 2 (-0.11)';
      if (output.textContent !== expected || /[a-h][1-8][a-h][1-8]/.test(output.textContent)) {
        fail(page, 'PV display must show variant evaluations without move sequences');
      }
    } catch (error) {
      fail(page, 'compact PV rendering unit check failed: ' + error.message);
    }
  }

  const functionNames = [...html.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)]
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
  process.stderr.write('ChessStudy static audit FAILED\n' + failures.map(item => '- ' + item).join('\n') + '\n');
  process.exit(1);
}

process.stdout.write('ChessStudy static audit passed.\n');
process.stdout.write('Checked: mobile + PC HTML, inline JavaScript syntax, unique IDs, element references, core chess features and local assets.\n');
