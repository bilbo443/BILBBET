const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=['js/ecl-draw.js','js/ecl-sheet-model.js','sheets/owner-wrapper.gs'];
const text='/* Bilbbet ECL sheet installer. Paste this complete file into a NEW bound Apps Script file. Run BILBBET_ECL_INSTALL once. */\n'+files.map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n');
fs.writeFileSync(path.join(__dirname,'BilbbetEcl.gs.txt'),text);
console.log('Built sheets/BilbbetEcl.gs.txt');
