import { readFile, writeFile } from "node:fs/promises"

const FILE = "lib/scamguard/v2/fixtures/second-holdout-candidates.csv"
const officialTargets = {
  aave: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fa4E2",
  "1inch": "0x111111125421cA6dc452d289314280a0f8842A65",
  lido: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
  safe: "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC",
}
const officialSources = {
  aave: "https://aave.com/docs/resources/addresses",
  "1inch": "https://business.1inch.com/portal/documentation/contracts/",
  lido: "https://docs.lido.fi/deployed-contracts/",
  safe: "https://docs.safe.global/core-api/safe-contracts-deployment",
}

function parseRows(text) {
  const rows=[]; let row=[],cell="",quoted=false
  for(let i=0;i<text.length;i++){
    const c=text[i]
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;continue}
    if(c===","&&!quoted){row.push(cell);cell="";continue}
    if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell="";continue}
    cell+=c
  }
  if(cell.length||row.length){row.push(cell);if(row.some(Boolean))rows.push(row)}
  return rows
}
function escape(v){v=String(v??"");return /[",\r\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
const table=parseRows(await readFile(FILE,"utf8"));const headers=table.shift();const ix=Object.fromEntries(headers.map((h,i)=>[h,i]))
let changed=0
for(const row of table){
  if(row[ix.chain]!=="evm"||row[ix.surface]!=="transaction"||row[ix.groundTruth]!=="benign"||!row[ix.provenanceId].includes("controlled-benign-evm-tx"))continue
  const project=row[ix.projectId],to=officialTargets[project]
  if(!to)continue
  row[ix.target]=JSON.stringify({method:"eth_sendTransaction",params:[{to,data:"0x",value:"0x0"}]})
  row[ix.source1Url]=officialSources[project]
  row[ix.collectorNote]="Controlled benign no-value call to a first-party documented protocol contract from the official project origin; deterministic semantic negative"
  changed++
}
await writeFile(FILE,[headers.map(escape).join(","),...table.map((r)=>r.map(escape).join(","))].join("\n")+"\n")
console.log(JSON.stringify({changed},null,2))
if(changed!==8)throw new Error(`Expected to refine 8 EVM benign transaction cases, changed ${changed}`)
