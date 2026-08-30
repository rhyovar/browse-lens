// Template BrowseLens plugin. A plugin is a package whose default export
// is { name, scripts }: scripts is a map of scriptName -> (params) => script,
// where the returned string is exactly what you'd otherwise put directly in
// a browser.run payload's `script` field — same sandbox, same trust boundary.
//
// IMPORTANT: always JSON.stringify params before interpolating them into
// the returned script string. Raw string interpolation both breaks on
// ordinary special characters (quotes, newlines) and lets a caller inject
// arbitrary script text; JSON.stringify avoids both.
export default {
  name: 'example',

  scripts: {
    /** No params: just reads the page title. */
    readTitle: () => 'return await tools.title();',

    /** Fills one field and clicks a button, then returns a snapshot. */
    fillAndSubmit: (params) => `
      await tools.fill(${JSON.stringify(params.selector)}, ${JSON.stringify(params.value)});
      await tools.click(${JSON.stringify(params.submitSelector)});
      return await tools.snapshot();
    `,

    /** Waits for a table to render, then scrapes it. params: { selector, timeoutMs? }. */
    waitAndScrapeTable: (params) => `
      await tools.waitForSelector(${JSON.stringify(params.selector)}, ${JSON.stringify(params.timeoutMs ?? 5000)});
      return await tools.scrapeTable(${JSON.stringify(params.selector)});
    `,

    /** Waits for embedded JSON to render, then extracts it. params: { selector, timeoutMs? }. */
    waitAndExtractJSON: (params) => `
      await tools.waitForSelector(${JSON.stringify(params.selector)}, ${JSON.stringify(params.timeoutMs ?? 5000)});
      return await tools.extractJSON(${JSON.stringify(params.selector)});
    `
  }
};
