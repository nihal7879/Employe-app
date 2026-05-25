/**
 * Google Apps Script: read every DWR email and write its table rows into a new
 * Google Sheet, in the exact column order import-dwr.js expects.
 *
 * HOW TO RUN
 *  1. Go to https://script.google.com  ->  New project.
 *  2. Delete the sample code, paste this whole file, click Save.
 *  3. Select function "exportDWRtoSheet" in the toolbar, click Run.
 *  4. Authorize when asked (it needs Gmail + Sheets access for YOUR account).
 *  5. View -> Logs (or Execution log) shows the new Sheet URL + row count.
 *  6. Open that Sheet, check the data, then File -> Download ->
 *     "Comma-separated values (.csv)". Save it as dwr-data.csv.
 *  7. Run the importer locally:
 *       node backend/scripts/import-dwr.js backend/scripts/dwr-data.csv          (dry run)
 *       node backend/scripts/import-dwr.js backend/scripts/dwr-data.csv --commit (insert)
 *
 * NOTE: Run this in the Gmail account that HAS the DWR mails.
 *  - If it's the SENDER's account, the query 'from:me subject:DWR' is most precise.
 *  - If it's the RECIPIENT's account, change SEARCH to just 'subject:DWR'.
 */
var SEARCH = 'from:me subject:DWR';

function exportDWRtoSheet() {
  var threads = GmailApp.search(SEARCH, 0, 400);
  var data = [[
    'sr_no', 'date', 'from_time', 'to_time', 'project', 'description',
    'assigned_by', 'type', 'status', 'resolved_on', 'comment',
  ]];

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      if ((msg.getSubject() || '').toUpperCase().indexOf('DWR') < 0) return;
      parseRows_(msg.getBody()).forEach(function (cells) {
        while (cells.length < 11) cells.push('');
        data.push(cells.slice(0, 11));
      });
    });
  });

  var ss = SpreadsheetApp.create('DWR Export ' + new Date().toISOString().slice(0, 10));
  ss.getActiveSheet().getRange(1, 1, data.length, 11).setValues(data);
  Logger.log('Rows incl header: ' + data.length + '   Open: ' + ss.getUrl());
}

// Pull <tr> rows from the HTML; keep only data rows (first cell = a number / Sr No).
function parseRows_(html) {
  var out = [];
  var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var tr;
  while ((tr = trRe.exec(html)) !== null) {
    var cells = [];
    var tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    var td;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(cleanCell_(td[1]));
    if (cells.length && /^\d+$/.test(cells[0])) out.push(cells);
  }
  return out;
}

function cleanCell_(s) {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
