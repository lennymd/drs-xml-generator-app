console.log('ready');

// import {read, utils} from '../vendor/xlsx/xlsx.mjs';
import {read, utils, SSF} from '../vendor/xlsx/xlsx.mjs';

const input = document.querySelector('#file');
const output = document.querySelector('#output');

async function handleFileAsync(e) {
  const file = e.target.files[0];
  const data = await file.arrayBuffer();
  const workbook = read(data, {type: 'array', cellDates: false});

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet, {header: 1, raw: true, defval: ''});
  const [headers, ...body] = rows;
  const papers = body.filter(row =>
    row.some(cell => String(cell).trim() !== '')
  );

  console.log(headers);
  console.log(papers[0]);
  output.textContent = `${papers.length} papers, ${headers.length} columns`;
}

input.addEventListener('change', handleFileAsync);

console.log(SSF.parse_date_code(46181.375));
