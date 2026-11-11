/* Bound Google Sheets installer. No network, accounts, bets or database access. */
var BILBBET_ECL_CONFIG={tab:'ECL',output:'AM65:AS89',modelTab:'_BilbbetEclModel',marker:'BILBBET ECL SHEET v1',blocks:{A:'U9:Y12',B:'Z9:AD12',C:'AE9:AI12'}};
function BILBBET_ECL_MENU(){
  SpreadsheetApp.getUi().createMenu('Bilbbet ECL')
    .addItem('Import current calculator data','BILBBET_ECL_IMPORT_DIALOG')
    .addItem('Recalculate odds','BILBBET_ECL_REFRESH')
    .addToUi();
}
function bilbbetEclSheet_(){
  var sheet=SpreadsheetApp.getActive().getSheetByName(BILBBET_ECL_CONFIG.tab);
  if(!sheet)throw Error('Missing ECL tab. Update BILBBET_ECL_CONFIG.tab to its exact name.');
  return sheet;
}
function bilbbetEclAssertOwned_(sheet){
  var range=sheet.getRange(BILBBET_ECL_CONFIG.output);
  var named=SpreadsheetApp.getActive().getRangeByName('BILBBET_ECL_ODDS');
  if(!named||named.getSheet().getSheetId()!==sheet.getSheetId()||named.getA1Notation()!==range.getA1Notation()||range.getCell(1,1).getNote()!==BILBBET_ECL_CONFIG.marker)throw Error('Run BILBBET_ECL_INSTALL first. Output range is not owned by this installer.');
  return range;
}
function BILBBET_ECL_INSTALL(){
  var lock=LockService.getDocumentLock();lock.waitLock(30000);
  try{
    var book=SpreadsheetApp.getActive(),sheet=bilbbetEclSheet_();
    if(sheet.getMaxRows()<89)sheet.insertRowsAfter(sheet.getMaxRows(),89-sheet.getMaxRows());
    if(sheet.getMaxColumns()<45)sheet.insertColumnsAfter(sheet.getMaxColumns(),45-sheet.getMaxColumns());
    var range=sheet.getRange(BILBBET_ECL_CONFIG.output),named=book.getRangeByName('BILBBET_ECL_ODDS');
    if(!named){
      if(range.getMergedRanges().length||range.getValues().flat().some(v=>v!=='')||range.getFormulas().flat().some(Boolean)||range.getNotes().flat().some(Boolean))throw Error('AM65:AS89 contains content or merged cells. Nothing was overwritten. Choose an empty output range.');
      book.setNamedRange('BILBBET_ECL_ODDS',range);
      range.getCell(1,1).setNote(BILBBET_ECL_CONFIG.marker);
    }
    bilbbetEclAssertOwned_(sheet);
    var model=book.getSheetByName(BILBBET_ECL_CONFIG.modelTab);
    if(model&&model.getRange('A1').getValue()!==BILBBET_ECL_CONFIG.marker)throw Error('Model tab name is already in use. Rename the existing tab before installing.');
    if(!model){model=book.insertSheet(BILBBET_ECL_CONFIG.modelTab);model.getRange('A1').setValue(BILBBET_ECL_CONFIG.marker);model.hideSheet();}
    var handlers=['BILBBET_ECL_EDIT','BILBBET_ECL_MENU'];
    var existing=ScriptApp.getProjectTriggers();
    if(!existing.some(t=>t.getHandlerFunction()===handlers[0]))ScriptApp.newTrigger(handlers[0]).forSpreadsheet(book).onEdit().create();
    if(!existing.some(t=>t.getHandlerFunction()===handlers[1]))ScriptApp.newTrigger(handlers[1]).forSpreadsheet(book).onOpen().create();
    BILBBET_ECL_MENU();
    bilbbetEclRender_(sheet,null,'Import current calculator data from the Bilbbet ECL page.');
  }finally{lock.releaseLock();}
}
function BILBBET_ECL_IMPORT_DIALOG(){
  var html='<p>Download current ECL calculator data from Bilbbet, then select that JSON file.</p><input type="file" id="file" accept=".json,application/json"><p id="status"></p><script>document.getElementById("file").onchange=function(){var f=this.files[0];if(!f)return;document.getElementById("status").textContent="Importing…";var r=new FileReader();r.onload=function(){google.script.run.withSuccessHandler(function(message){document.getElementById("status").textContent=message;}).withFailureHandler(function(error){document.getElementById("status").textContent=error.message;}).BILBBET_ECL_IMPORT_JSON(r.result);};r.readAsText(f);};</script>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(240),'Import Bilbbet calculator data');
}
function BILBBET_ECL_IMPORT_JSON(text){
  if(typeof text!=='string'||text.length>2000000)throw Error('Choose the calculator JSON download (maximum 2 MB).');
  var snapshot=JSON.parse(text);BilbbetEclSheet.validate(snapshot);
  var digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(snapshot.model),Utilities.Charset.UTF_8).map(b=>(b+256).toString(16).slice(-2)).join('');
  if(digest!==snapshot.fingerprint)throw Error('Calculator checksum differs. Download the file again.');
  BilbbetEclSheet.resolver(snapshot.model);
  var lock=LockService.getDocumentLock();lock.waitLock(30000);
  try{
    var sheet=bilbbetEclSheet_();bilbbetEclAssertOwned_(sheet);
    var model=SpreadsheetApp.getActive().getSheetByName(BILBBET_ECL_CONFIG.modelTab);
    if(!model||model.getRange('A1').getValue()!==BILBBET_ECL_CONFIG.marker)throw Error('Run the installer first.');
    var chunks=[];for(var i=0;i<text.length;i+=8000)chunks.push([text.slice(i,i+8000)]);
    if(model.getMaxRows()<chunks.length+1)model.insertRowsAfter(model.getMaxRows(),chunks.length+1-model.getMaxRows());
    model.getRange(2,1,chunks.length,1).setNumberFormat('@').setValues(chunks);
    model.getRange('B1').setValue(chunks.length);
    model.hideSheet();bilbbetEclRefreshUnlocked_(sheet);
    return 'Imported '+snapshot.exported_at_utc+'. Complete groups now update as names are entered.';
  }finally{lock.releaseLock();}
}
function BILBBET_ECL_EDIT(event){
  if(!event||!event.range||event.range.getSheet().getName()!==BILBBET_ECL_CONFIG.tab)return;
  var r=event.range;if(r.getLastRow()<9||r.getRow()>12||r.getLastColumn()<21||r.getColumn()>35)return;
  BILBBET_ECL_REFRESH();
}
function BILBBET_ECL_REFRESH(){
  var lock=LockService.getDocumentLock();lock.waitLock(30000);
  try{bilbbetEclRefreshUnlocked_(bilbbetEclSheet_());}finally{lock.releaseLock();}
}
function bilbbetEclRefreshUnlocked_(sheet){
  bilbbetEclAssertOwned_(sheet);
  try{
    var model=SpreadsheetApp.getActive().getSheetByName(BILBBET_ECL_CONFIG.modelTab);
    if(!model||model.getRange('A1').getValue()!==BILBBET_ECL_CONFIG.marker)throw Error('Install and import calculator data first.');
    var count=Number(model.getRange('B1').getValue());if(!Number.isInteger(count)||count<1||count>250)throw Error('Import current calculator data first.');
    var snapshot=JSON.parse(model.getRange(2,1,count,1).getValues().flat().join(''));
    var m=BilbbetEclSheet.validate(snapshot),blocks={};
    for(var g of ['A','B','C'])blocks[g]=sheet.getRange(BILBBET_ECL_CONFIG.blocks[g]).getValues();
    var groups=BilbbetEclSheet.readDraw(m,blocks),rows={};
    for(var g of ['A','B','C'])rows[g]=BilbbetEclSheet.project(m,groups,g);
    bilbbetEclRender_(sheet,{snapshot:snapshot,groups:groups,rows:rows});
  }catch(error){bilbbetEclRender_(sheet,null,'Odds unavailable: '+error.message);}
}
function bilbbetEclRender_(sheet,result,error){
  var range=bilbbetEclAssertOwned_(sheet);
  // Only this named, marked panel is ever cleared. Draw cells are read-only.
  range.breakApart().clearContent().setBackground('#101827').setFontColor('#ffffff').setFontFamily('Arial').setFontSize(11).setVerticalAlignment('middle');
  var matrix=Array.from({length:25},()=>Array(7).fill(''));
  matrix[0][0]='BILBBET ECL GROUP ODDS';
  matrix[1][0]=result?'Model downloaded: '+result.snapshot.exported_at_utc:'Awaiting valid calculator data / draw';
  matrix[2][0]=error||'Three matchdays · top two qualify · 5% price margin';
  for(var j=0;j<3;j++){
    var g=['A','B','C'][j],offset=4+j*7,rows=result?.rows[g]||[];
    matrix[offset][0]='GROUP '+g+(rows.length?'':' — awaiting four valid teams');
    matrix[offset+1][0]='TEAM';matrix[offset+1][3]='WIN GROUP';matrix[offset+1][5]='QUALIFY TOP 2';
    for(var i=0;i<4;i++){
      var row=rows[i];matrix[offset+2+i][0]=row?row.name:'';
      matrix[offset+2+i][3]=row?(row.winOdds??'Suspended'):'';
      matrix[offset+2+i][5]=row?(row.qualifyOdds??'Suspended'):'';
    }
  }
  matrix[24][0]='Forecasts only. No groups or betting markets are published by this sheet.';
  range.setValues(matrix);range.getCell(1,1).setNote(BILBBET_ECL_CONFIG.marker);
  for(var index of [0,1,2,24,4,11,18])range.offset(index,0,1,7).merge().setWrap(true);
  for(var j=0;j<3;j++){
    var offset=5+j*7;
    for(var i=offset;i<offset+5;i++){
      range.offset(i,0,1,3).merge().setWrap(true);
      range.offset(i,3,1,2).merge().setHorizontalAlignment('center').setNumberFormat('0.00');
      range.offset(i,5,1,2).merge().setHorizontalAlignment('center').setNumberFormat('0.00');
    }
    range.offset(offset-1,0,1,7).setBackground('#ffdd00').setFontColor('#111111').setFontWeight('bold');
    range.offset(offset,0,1,7).setFontWeight('bold');
  }
  range.getCell(1,1).setFontSize(15).setFontWeight('bold');
  sheet.setRowHeights(65,25,34);
  if(error)range.offset(2,0,1,7).setFontColor('#ffbb80');
}
