import {read, utils, SSF} from '../vendor/xlsx/xlsx.mjs';
import {text, escapeXml, pad, indent, stamp} from './helper.mjs';

// ---------- Reading ----------

// python: load_excel_records
// One object per paper, keyed by column name: row.title, row.doi, row.author1_lname …
// Empty rows (the export has 2,436 at the end) are dropped.
export function readSheet(data) {
  const workbook = read(data, {type: 'array', cellDates: false});
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json(sheet, {raw: true, defval: ''});

  return rows.filter(row =>
    Object.values(row).some(cell => String(cell).trim() !== '')
  );
}

// ---------- Cleaning ----------

const PAPER_COLUMNS = ['title', 'doi', 'calc_url', 'start_date', 'end_date', 'conference_dates'];
const REQUIRED_COLUMNS = ['title', 'doi', 'calc_url', 'start_date', 'end_date', 'author1_lname'];

// Columns a Batch Revise export must have. Returns the ones this file is missing.
export function missingColumns(rows) {
  const columns = Object.keys(rows[0] ?? {});
  return REQUIRED_COLUMNS.filter(column => !columns.includes(column));
}

// Keep only what the XML needs: the paper columns, and each author up to the first blank surname.
export function cleanRows(rows) {
  return rows.map(row => {
    const clean = {};
    for (const column of PAPER_COLUMNS) {
      clean[column] = row[column] ?? '';
    }
    for (let n = 1; text(row[`author${n}_lname`]) !== ''; n++) {
      clean[`author${n}_fname`] = row[`author${n}_fname`] ?? '';
      clean[`author${n}_lname`] = row[`author${n}_lname`];
      clean[`author${n}_institution`] = row[`author${n}_institution`] ?? '';
    }
    return clean;
  });
}

// ---------- Dates ----------

// python: parse_date
// Excel date number (46181.375) or text ('2026-06-08 09:00') → {y: 2026, m: 6, d: 8}, or null.
export function parseDate(value) {
  if (typeof value === 'number') {
    const date = SSF.parse_date_code(value);
    return {y: date.y, m: date.m, d: date.d};
  }
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text(value));
  if (!match) return null;
  return {y: Number(match[1]), m: Number(match[2]), d: Number(match[3])};
}

// ---------- Checks ----------
// A problem is {row, title, message}. `row` is the paper's position (1 = first paper),
// `title` helps people find it; both are left out for problems with the conference details.

// python: validate_conference_config
const REQUIRED_SETTINGS = {
  name: 'Conference name',
  acronym: 'Acronym',
  volume_doi: 'Volume DOI',
  volume_url: 'Volume URL',
};
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
const URL_PATTERN = /^(https?|ftp):\/\/\S+$/i;

export function checkConfig(conf) {
  const problems = [];

  for (const [key, label] of Object.entries(REQUIRED_SETTINGS)) {
    if (!text(conf[key])) problems.push({message: `${label} is missing.`});
  }
  if (text(conf.issn) && !text(conf.series_title)) {
    problems.push({message: 'A series title is needed when there is an ISSN.'});
  }
  if (text(conf.volume_doi) && !DOI_PATTERN.test(text(conf.volume_doi))) {
    problems.push({message: `The volume DOI "${conf.volume_doi}" should look like 10.21606/…`});
  }
  if (text(conf.volume_url) && !URL_PATTERN.test(text(conf.volume_url))) {
    problems.push({message: `The volume URL "${conf.volume_url}" should start with https://`});
  }

  return problems;
}

// python: require_field + check_duplicate_dois
export function checkRows(papers, conf) {
  const good = [];
  const bad = [];
  const seen = new Map(); // DOI (lowercase) → number of the paper that used it first
  const volumeDoi = text(conf.volume_doi).toLowerCase();

  papers.forEach((paper, i) => {
    const row = i + 1;
    const doi = text(paper.doi);
    const key = doi.toLowerCase();
    const problems = [];

    if (!text(paper.title)) problems.push('has no title');
    if (!text(paper.author1_lname)) problems.push('has no authors');
    if (!text(paper.calc_url)) problems.push('has no web address (calc_url)');

    if (!doi) {
      problems.push('has no DOI');
    } else if (!DOI_PATTERN.test(doi)) {
      problems.push(`has a DOI that doesn't look right: ${doi}`);
    } else if (key === volumeDoi) {
      problems.push(`uses the volume DOI ${doi}`);
    } else if (seen.has(key)) {
      problems.push(`uses the same DOI as paper ${seen.get(key)}: ${doi}`);
    } else {
      seen.set(key, row);
    }

    if (problems.length > 0) {
      bad.push({row, title: text(paper.title) || 'untitled', message: problems.join('; ')});
    } else {
      good.push(paper);
    }
  });

  return {good, bad};
}

// ---------- Building the XML ----------

export function doiDataLines(doi, url) {
  return [
    '<doi_data>',
    `<doi>${escapeXml(text(doi))}</doi>`,
    `<resource>${escapeXml(text(url))}</resource>`,
    '</doi_data>',
  ];
}

export function dateLines(date) {
  return [
    '<publication_date media_type="online">',
    `<month>${pad(date.m)}</month>`,
    `<day>${pad(date.d)}</day>`,
    `<year>${date.y}</year>`,
    '</publication_date>',
  ];
}

export function authorsOf(row) {
  const authors = [];
  for (let n = 1; text(row[`author${n}_lname`]) !== ''; n++) {
    authors.push({
      fname: text(row[`author${n}_fname`]),
      lname: text(row[`author${n}_lname`]),
      institution: text(row[`author${n}_institution`]),
    });
  }
  return authors;
}

export function contributorsLines(row) {
  const lines = ['<contributors>'];

  authorsOf(row).forEach((author, i) => {
    const sequence = i === 0 ? 'first' : 'additional';
    lines.push(`<person_name sequence="${sequence}" contributor_role="author">`);
    if (author.fname) lines.push(`<given_name>${escapeXml(author.fname)}</given_name>`);
    lines.push(`<surname>${escapeXml(author.lname)}</surname>`);
    if (author.institution) {
      lines.push(
        '<affiliations>',
        '<institution>',
        `<institution_name>${escapeXml(author.institution)}</institution_name>`,
        '</institution>',
        '</affiliations>'
      );
    }
    lines.push('</person_name>');
  });

  lines.push('</contributors>');
  return lines;
}

// ---------- One paper ----------

export function paperLines(row, start) {
  return [
    '<conference_paper language="en" publication_type="full_text">',
    ...contributorsLines(row),
    '<titles>',
    `<title>${escapeXml(text(row.title))}</title>`,
    '</titles>',
    ...dateLines(start),
    ...doiDataLines(row.doi, row.calc_url),
    '</conference_paper>',
  ];
}

export function conferenceLines(conf, firstRow, start, end) {
  const name = text(conf.name);
  const issn = text(conf.issn);
  const isbn = text(conf.isbn);
  const dateAttributes =
    `start_day="${pad(start.d)}" end_day="${pad(end.d)}" ` +
    `start_month="${pad(start.m)}" end_month="${pad(end.m)}" ` +
    `start_year="${start.y}" end_year="${end.y}"`;

  const lines = [
    '<event_metadata>',
    `<conference_name>${escapeXml(name)}</conference_name>`,
    `<conference_acronym>${escapeXml(text(conf.acronym))}</conference_acronym>`,
    `<conference_date ${dateAttributes}>${escapeXml(String(firstRow.conference_dates ?? ''))}</conference_date>`,
    '</event_metadata>',
  ];

  if (issn) {
    lines.push(
      '<proceedings_series_metadata>',
      '<series_metadata>',
      '<titles>',
      `<title>${escapeXml(text(conf.series_title))}</title>`,
      '</titles>',
      `<issn>${escapeXml(issn)}</issn>`,
      '</series_metadata>'
    );
  } else {
    lines.push('<proceedings_metadata language="en">');
  }

  lines.push(
    `<proceedings_title>${escapeXml(text(conf.proceedings_title) || name)}</proceedings_title>`,
    '<publisher>',
    '<publisher_name>Design Research Society</publisher_name>',
    '</publisher>',
    ...dateLines(start),
    isbn ? `<isbn>${escapeXml(isbn)}</isbn>` : '<noisbn reason="simple_series"/>',
    ...doiDataLines(conf.volume_doi, conf.volume_url),
    issn ? '</proceedings_series_metadata>' : '</proceedings_metadata>'
  );

  return lines;
}

export function headLines(fileName, now) {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const batchId = `${baseName}-${stamp(now).slice(2)}`;

  return [
    '<head>',
    `<doi_batch_id>${escapeXml(batchId)}</doi_batch_id>`,
    `<timestamp>${stamp(now)}0000</timestamp>`,
    '<depositor>',
    '<depositor_name>desres:desres</depositor_name>',
    '<email_address>dl@designresearchsociety.org</email_address>',
    '</depositor>',
    '<registrant>Digital Library</registrant>',
    '</head>',
  ];
}

// ---------- Everything ----------

const ROOT =
  '<doi_batch xmlns="http://www.crossref.org/schema/5.3.0"' +
  ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
  ' xmlns:jats="http://www.ncbi.nlm.nih.gov/JATS1"' +
  ' xmlns:fr="http://www.crossref.org/fundref.xsd"' +
  ' xmlns:mml="http://www.w3.org/1998/Math/MathML"' +
  ' version="5.3.0"' +
  ' xsi:schemaLocation="http://www.crossref.org/schema/5.3.0 https://www.crossref.org/schemas/crossref5.3.0.xsd">';

export function buildXml(rows, conf, fileName, now = new Date()) {
  const firstRow = rows[0];
  const start = parseDate(firstRow.start_date);
  const end = parseDate(firstRow.end_date);

  const lines = [
    ROOT,
    ...headLines(fileName, now),
    '<body>',
    '<conference>',
    ...conferenceLines(conf, firstRow, start, end),
    ...rows.flatMap(row => paperLines(row, start)),
    '</conference>',
    '</body>',
    '</doi_batch>',
  ];

  return "<?xml version='1.0' encoding='UTF-8'?>\n" + indent(lines).join('\n') + '\n';
}

// python: save_xml, the file name part → '20261102-drs2026.xml'
export function outputFileName(conf, now = new Date()) {
  return `${stamp(now).slice(0, 8)}-${text(conf.acronym).toLowerCase()}.xml`;
}

// ---------- Everything ----------

// The whole run. mode is 'strict' (any bad row → no XML) or 'skip' (leave bad rows out).
// Returns {ok: true, xml, fileName, count, skipped} or {ok: false, problems}.
export function generate(papers, conf, mode, fileName, now = new Date()) {
  // Problems with the conference details always stop the run.
  const confProblems = checkConfig(conf);
  if (confProblems.length > 0) {
    return {ok: false, problems: confProblems};
  }

  // Problems with rows stop it in strict mode; in skip mode those rows are left out.
  const {good, bad} = checkRows(papers, conf);
  if (good.length === 0 || (mode === 'strict' && bad.length > 0)) {
    return {ok: false, problems: bad};
  }

  return {
    ok: true,
    xml: buildXml(good, conf, fileName, now),
    fileName: outputFileName(conf, now),
    count: good.length,
    skipped: bad,
  };
}
