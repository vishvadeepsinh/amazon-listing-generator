// Main.gs - Entry point for Amazon Listing Generator
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Amazon Listing')
    .addItem('Generate Optimized Listing (Selected Row)', 'startProcess')
    .addItem('Setup API Key', 'setupApiKey')
    .addToUi();
}

function validateSetup(sheets) {
  const ui = SpreadsheetApp.getUi();
  
  // Check if all required sheets exist
  if (!sheets.input || !sheets.output || !sheets.keywords) {
    ui.alert('Error: Required sheets not found. Please ensure you have "Input", "Output", and "Keywords" sheets.');
    return false;
  }

  // Check if API key is set
  const apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) {
    ui.alert('Please set up your Claude API key first using the "Setup API Key" menu option.');
    return false;
  }

  return true;
}

async function startProcess() {
  const sheets = SheetHandler.setupSheets();
  
  if (!validateSetup(sheets)) {
    return;
  }

  const sheet = sheets.input;
  const activeRange = sheet.getActiveRange();
  if (!activeRange) {
    SpreadsheetApp.getUi().alert('Please select a row to process.');
    return;
  }

  const row = activeRange.getRow();
  if (row === 1) { // Assuming row 1 is the header
    SpreadsheetApp.getUi().alert('Please select a valid product row (not the header).');
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const confirmation = ui.alert(
    'Start Processing',
    'Processing will take several minutes with optimization loops. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmation !== ui.Button.YES) {
    return;
  }

  try {
    const product = SheetHandler.getProductData(sheet, row);
    
    SheetHandler.updateStatus(sheet, row, 'Processing');
    
    const result = await ClaudeHandler.processProduct(product, row);
    
    SheetHandler.writeResults(sheets, {
      row: row,
      listing: result.listing,
      keywords_used: result.keyword_tracking
    });
    
    SheetHandler.updateStatus(sheet, row, 'Complete');
    ui.alert('Success', `Processing for row ${row} completed successfully!`, ui.ButtonSet.OK);
    
  } catch (error) {
    console.error('Error processing row ' + row + ':', error);
    SheetHandler.writeError(sheets.output, row, error.message);
    SheetHandler.updateStatus(sheet, row, 'Error');
    ui.alert('Error', 'Error processing row ' + row + ': ' + error.message, ui.ButtonSet.OK);
  }
}

function setupApiKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Setup',
    'Enter your Claude API Key:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const apiKey = response.getResponseText().trim();
    if (!apiKey) {
      ui.alert('Error', 'API Key cannot be empty', ui.ButtonSet.OK);
      return;
    }
    PropertiesService.getScriptProperties().setProperty('CLAUDE_API_KEY', apiKey);
    ui.alert('Success', 'API Key saved successfully!', ui.ButtonSet.OK);
  }
}
