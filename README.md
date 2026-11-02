# DRS XML Generator

This web app takes in XLS files from the Digital Library and creates an XML file ready for submitting to Crossref to register or update DOI information. The file is processed in the browser and never uploaded anywhere.

## Tech

- Plain HTML, CSS and JavaScript modules. No framework, no build step, no npm.
- Libraries are vendored in `site/vendor/`: SheetJS 0.20.3 (reads the .xls), xmllint-wasm 5.3.0 (schema validation, not wired yet), and the Crossref 5.3.0 schema files.
- The XML logic is in `site/lib/generate-xml.js`, a port of the Python tool's `core.py`. The page logic is in `site/assets/main.js`.
- Only `site/` is published. `samples/` (real exports, Python output) is git-ignored; `tests/fixtures/` has fake files for edge cases.

Run it locally (modules don't load from a double-clicked file):

```bash
python3 -m http.server 8000 -d site
```

Check it against the Python tool: generate from `samples/drs26-subset.xls`, download, then

```bash
diff samples/drs26-subset.python.xml ~/Downloads/<date>-drs2026.xml
```

Only `doi_batch_id` and `timestamp` should differ.

## Using the form

### 1. Get the Batch Revise export

1. Publish the conference's papers in the Digital Library. Unpublished papers aren't in the export.
2. Go to **Configuration** and click the conference's `ir_event_community`.
3. Go to **Manage Events**.
4. Choose **Batch Revise** in the left-hand menu and download the .xls.
5. **Clean the file before uploading.** Keep only the entries for the edition you're working on.

Choose the file in the app. It's read straight away, and a short summary appears under the field: number of papers and authors, conference dates, research papers and editorials. Check those before going on.

### 2. Fill in the conference details

Copy them from the conference spreadsheet (link to add).

- **Volume DOI:** the DOI of the proceedings as a whole, not of a paper.
- **ISSN and ISBN:** DRS conferences have both an ISSN (the "Proceedings of DRS" series) and an ISBN (this edition). Other conferences like NORDES may have an ISSN, and others not. The ISBN is always optional. A series title is needed whenever there's an ISSN.

### 3. Choose what happens with problem rows

- **Stop and list them** is the safe choice: no XML is made until every row is right.
- **Leave them out** builds the XML from the good rows and lists the ones left out.

A paper is a problem row if it has no title, no authors, no web address, no DOI or a malformed one, the volume DOI, or a DOI another paper already uses.

### 4. Generate and check the result

If there are errors, fix them in the spreadsheet you have. You can then upload the spreadsheet to the Digital Library and have them fixed there too. Then export again and start over.

### 5. Download and deposit to Crossref

These steps are also on the page, under the download button.

1. Check the paper count matches the number published.
2. Log in at [doi.crossref.org](https://doi.crossref.org/servlet/useragent) with the DRS account.
3. Upload the XML to the Crossref system.
4. Wait and review the email from Crossref.
5. If records fail, fix them in the spreadsheet and regenerate.

## TO DO

- [x] test xlsx importing and reading
- [ ] test xml validation
- [x] add in html elements for the form processing
- [x] test conversion script
- [x] configure results panel to show errors or issues
- [x] add form validation to the fields
- [ ] deploy to Netlify
