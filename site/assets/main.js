import {
  readSheet,
  missingColumns,
  cleanRows,
  parseDate,
  generate,
} from '../lib/generate-xml.js';

const form = document.querySelector('#conferenceForm');
const input = document.querySelector('#file');
const fileStatus = document.querySelector('#fileStatus');
const fileInfo = document.querySelector('#fileInfo');
const summary = document.querySelector('#summary');
const problems = document.querySelector('#problems');
const problemList = document.querySelector('#problemList');
const warnings = document.querySelector('#warnings');
const warningList = document.querySelector('#warningList');
const output = document.querySelector('#output');
const downloadSection = document.querySelector('#downloadXML');
const downloadButton = document.querySelector('#download');

let papers = []; // the cleaned rows, filled as soon as a good file is chosen
let xml = ''; // the last XML made, for the download button
let xmlFileName = '';

// ---------- 1. File: read and review as soon as it's chosen ----------

input.addEventListener('change', async () => {
  resetFile();
  const file = input.files[0];
  if (!file) return;

  const rows = readSheet(await file.arrayBuffer());
  const problem = reviewFile(rows);

  if (problem) {
    input.setCustomValidity(problem); // blocks Generate until a good file is chosen
    fileStatus.textContent = problem;
    fileStatus.classList.add('problem');
    return;
  }

  papers = cleanRows(rows);
  fileStatus.textContent = `${file.name} looks good.`;
  showFileInfo(rows);
});

// What's wrong with the file, or '' if it's fine.
function reviewFile(rows) {
  if (rows.length === 0) {
    return 'This file has no papers in it.';
  }
  const missing = missingColumns(rows);
  if (missing.length > 0) {
    return `This isn't a Batch Revise export: it's missing ${missing.join(', ')}.`;
  }
  if (!parseDate(rows[0].start_date) || !parseDate(rows[0].end_date)) {
    return 'The first row has no valid start_date or end_date. Check the conference dates in the Digital Library.';
  }
  return '';
}

// A few facts about the file, so it can be checked before generating.
function showFileInfo(rows) {
  const first = rows[0];
  const start = formatDate(parseDate(first.start_date));
  const end = formatDate(parseDate(first.end_date));
  const authors = papers.reduce((total, paper) => total + countAuthors(paper), 0);

  const facts = [
    `${papers.length} papers, ${authors} authors`,
    `Conference: ${start} to ${end} (“${first.conference_dates}”)`,
  ];

  fileInfo.replaceChildren(...facts.map(fact => {
    const li = document.createElement('li');
    li.textContent = fact;
    return li;
  }));
  fileInfo.hidden = false;
}

function resetFile() {
  papers = [];
  input.setCustomValidity('');
  fileStatus.textContent = '';
  fileStatus.classList.remove('problem');
  fileInfo.replaceChildren();
  fileInfo.hidden = true;
  clearResult();
}

// ---------- 2. Conference: read the form ----------

const SETTINGS = [
  'name',
  'acronym',
  'volume_doi',
  'volume_url',
  'issn',
  'series_title',
  'isbn',
  'proceedings_title',
];

function readConference() {
  const conf = {};
  for (const key of SETTINGS) {
    conf[key] = form.elements[key].value;
  }
  return conf;
}

// A series title is needed when there's an ISSN. HTML can't say "required if
// another field is filled", so this marks the field invalid by hand.
function checkSeriesTitle() {
  const issn = form.elements.issn.value.trim();
  const seriesTitle = form.elements.series_title.value.trim();
  form.elements.series_title.setCustomValidity(
    issn && !seriesTitle ? 'A series title is needed when there is an ISSN.' : ''
  );
}

form.elements.issn.addEventListener('input', checkSeriesTitle);
form.elements.series_title.addEventListener('input', checkSeriesTitle);

// ---------- 3. Generate ----------
// Only runs when the browser's checks pass: a good file AND a complete form.

form.addEventListener('submit', e => {
  e.preventDefault(); // stay on the page

  const conf = readConference();
  const mode = form.elements.mode.value; // 'strict' or 'skip'
  const result = generate(papers, conf, mode, input.files[0].name);

  showResult(result);
});

function showResult(result) {
  clearResult();

  if (!result.ok) {
    summary.textContent = 'No XML was made.';
    showList(problems, problemList, result.problems);
    return;
  }

  xml = result.xml;
  xmlFileName = result.fileName;
  summary.textContent = `${result.count} papers · ${result.count} DOIs · ${result.fileName}`;
  showList(warnings, warningList, result.skipped);
  output.textContent = xml;
  downloadSection.hidden = false; // the download and upload steps appear only now
}

// Fills a list with problems and shows its box; leaves the box hidden when there are none.
function showList(box, list, items) {
  list.replaceChildren(...items.map(problem => {
    const li = document.createElement('li');
    li.textContent = problem.row
      ? `Paper ${problem.row} (“${problem.title}”): ${problem.message}`
      : problem.message;
    return li;
  }));
  box.hidden = items.length === 0;
}

function clearResult() {
  xml = '';
  xmlFileName = '';
  summary.textContent = '';
  problems.hidden = true;
  warnings.hidden = true;
  output.textContent = '';
  downloadSection.hidden = true;
}

// ---------- 4. Download ----------

function downloadXml() {
  const blob = new Blob([xml], {type: 'application/xml'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = xmlFileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

downloadButton.addEventListener('click', downloadXml);

// ---------- Small helpers for this page ----------

// {y: 2026, m: 6, d: 8} → '8 June 2026'
function formatDate(date) {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function countAuthors(paper) {
  return Object.keys(paper).filter(key => /^author\d+_lname$/.test(key)).length;
}
