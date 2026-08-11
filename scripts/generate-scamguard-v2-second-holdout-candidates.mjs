import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

const OUT = "lib/scamguard/v2/fixtures/second-holdout-candidates.csv"
const SEEN = "lib/scamguard/v2/fixtures/holdout-150.csv"
const headers = ["id","projectId","surface","chain","groundTruth","target","sourceUrl","provenanceId","source1Url","source2Url","verificationStatus","evidenceQuality","collectedAt","collectorNote"]
const contexts = [
  ["backpack","solana","backpack.app"],["kamino","solana","kamino.com"],["orca","solana","orca.so"],["marinade","solana","marinade.finance"],
  ["aave","evm","aave.com"],["1inch","evm","1inch.com"],["lido","evm","lido.fi"],["safe","evm","safe.global"],
]
const solTokens = [
  ["MBS","Fm9rHUTF5v3hwMLbStjZXqNBBoZyGriQaFM6sTFz3K8A"],["CWAR","HfYFjMKNZygfMC8LsQ8LtpPsPxEJoXJx4M6tqi75Hajo"],["DIO","BiDB55p4G3n1fGhwKFpxsokBMqgctL4qnZpDH1bVQxMD"],["JSOL","7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn"],["MINECRAFT","FTkj421DxbS1wajE74J34BJ5a1o9ccA97PkK6mYq9hNQ"],["soBTC","9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E"],
  ["soETH","2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk"],["SRM","SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt"],["FIDA","EchesyfXePKdLtoiZSL8pBe8Myagyy8ZRqsACNCFGnvp"],["MAPS","MAPS41MDahZ9QdKXhVa4dWB9RuyfV4XqhyAZ8XcYepb"],["OXY","z3dn17yLaGMKffVogeFHQ9zWVcXgqgf3PQnDsNs2g6M"],["BRZ","FtgGSFADXBtroxq8VCausXRr2of47QBf5AS1NtZCu4GD"],
  ["BAT","EPeUFDgHRxs9xxEPVaL6kfGQvCon7jmAWKVUHuux1Tpz"],["AUDIO","9LzCMqDgTKYz9Drzqnpgee3SGa89up3a247ypMj2xrqM"],["COPE","8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh"],["ROPE","8PMHT4swUMtBzgHnh5U564N5sjPSiUz2cjEQzFnnP1Fo"],["MEDIA","ETAtLmCmsoiEEKfNrHKJ2kYy3MoABhU6NQvpSfij5tDs"],["STEP","StepAscQoEioFxxWGnh2sLBDFp9d8rvKz2Yp39iDpyT"],
  ["SLIM","xxxxa1sKNGwFtw2kFn8XauW9xq8hBZ5kVtcSesTT9fW"],["SAMO","7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"],["ATLAS","ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx"],["POLIS","poLisWXnNRwC6oBu1vHiuKQzFjGL4XDSu4g9qjz9qVk"],["WOOF","9nEqaUcb16sQ3Tn1psbkWqyhPdLmfHWjKGymREjsAgTE"],["APYS","5JnZ667P3VcjDinkJFysWh2K2KtViy63FZ3oL5YghEhW"],
  ["SOLPAD","GfJ3Vq2eSTYf1hJP6kKLE9RT6u7jF9gNszJhZwo5VPZp"],["TULIP","TuLipcqtGVXP9XR62wM8WWCm6a9vhLs7T1uoWBk6FDs"],["CHEEMS","3FoUAsGDbvTD6YZ4wVKJgTB76onJUKz7GPEBNiR5b8wc"],["CATO","5p2zjqCd1WJzAVgcEnjhb9zWDU7b9XVhFhx4usiyN7jB"],["NINJA","FgX1WD9WzMU3yLwXaFSarPfkgzjLb2DZCqmkx9ExpuvJ"],["ORCA","orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE"],
  ["MPLX","METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m"],["SHILL","6cVgJUqo4nmvQpbgrDZwyfd6RwWw5bfnCamS3M9N1fd"],["SAIL","6kwTqmdQkJd8qRr9RjSnUX9XJ24RmJRSrU1rsragP97Y"],["RIN","E5ndSkaB17Dm7CsD22dvcjfrYSDLCxFcMd6z8ddCk5wp"],["DINO","6Y7LbYB3tfGBG6CSkyssoxdtHb77AEMTRVXe8JUJRwZ7"],["LIQ","4wjPQJ6PrkC4dHhYghwJzGBVP78DkBzA2U3kHoFNBuhj"],
]
const evmTokens = [
  ["WETH","0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],["DAI","0x6B175474E89094C44Da98b954EedeAC495271d0F"],["ZRX","0xE41d2489571d322189246DaFA5ebDe1F4699F498"],["CRV","0xD533a949740bb3306d119CC777fa900bA034cd52"],["UNI","0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"],["OXT","0x4575f41308EC1483f3d399aa9a2826d74Da13Deb"],
  ["MKR","0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2"],["LINK","0x514910771AF9Ca656af840dff83E8264EcF986CA"],["REP","0x1985365e9f78359a9B6AD760e32412f4a445E862"],["REPv2","0x221657776846890989a759BA2973e427DfF5C9bB"],["KNC","0xdd974D5C2e2928deA5F71b9825b8b646686BD200"],["COMP","0xc00e94Cb662C3520282E6f5717214004A7f26888"],
  ["BAND","0xBA11D00c5f74255f56a5E366F4F77f5A186d7f55"],["NMR","0x1776e1F26f98b1A5dF9cD347953a26dd3Cb46671"],["UMA","0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828"],["LRC","0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD"],["YFI","0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e"],["REN","0x408e41876cCCDC0F92210600ef50372656052a38"],
  ["WBTC","0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"],["BAL","0xba100000625a3754423978a60c9317c58a424e3D"],["NU","0x4fE83213D56308330EC302a8BD641f1d0113A4Cc"],["AAVE","0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9"],["GRT","0xc944E90C64B2c07662A292be6244BDf05Cda44a7"],["BNT","0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C"],
  ["SNX","0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F"],["MANA","0x0F5D2fB29fb7d3CFeE444a200298f468908cC942"],["LOOM","0xA4e8C3Ec456107eA67d3075bF9e3DF3A75823DB0"],["CVC","0x41e5560054824eA6B0732E656E3Ad64E20e94E45"],["DNT","0x0AbdAce70D3790235af448C88547603b945604ea"],["STORJ","0xB64ef51C888972c908CFacf59B47C1AfBC0Ab8aC"],
  ["AMP","0xfF20817765cB7f73d4bde2e66e067E58D11095C2"],["GNO","0x6810e776880C02933D47DB1b9fc05908e5386b96"],["ANT","0xa117000000f279D81A1D3cc75430fAA017FA5A2e"],["KEEP","0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC"],["TBTC","0x18084fbA666a33d37592fA2633fD49a74DD93a88"],["MLN","0xec67005c4E498Ec7f55E092bd1d35cbC47C91892"],
  ["ENS","0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72"],["SUSD","0x57Ab1ec28D129707052df4dF418D58a2D46d5f51"],["APE","0x4d224452801ACEd8B2F0aebE155379bb5D594381"],["1INCH","0x111111111117dC0aa78b770fA6A738034120C302"],["AERGO","0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6"],["AIOZ","0x626E8036dEB333b408Be468F951bdB42433cBF18"],
]
const realWallets = {
  orca:[["whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc","https://docs.orca.so/developers/architecture/whirlpool-parameters"],["2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ","https://docs.orca.so/developers/architecture/whirlpool-parameters"],["777H5H3Tp9U11uRVRzFwM8BinfiakbaLT8vQpeuhvEiH","https://docs.orca.so/developers/architecture/whirlpool-parameters"]],
  kamino:[["7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF","https://kamino.com/docs"],["HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E","https://kamino.com/docs/build/tutorials/earn"]],
  marinade:[["MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD","https://docs.marinade.finance/developers/contract-addresses"],["GovMaiHfpVPw8BAM1mbdzgmSZYDw2tdP32J2fapoQoYs","https://docs.marinade.finance/developers/contract-addresses"],["tokdh9ZbWPxkFzqsKqeAwLDk6J6a8NBZtQanVuuENxa","https://docs.marinade.finance/developers/contract-addresses"]],
  safe:[["0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC","https://docs.safe.global/core-api/safe-contracts-deployment"],["0x69f4D1788e39c87893C980c06EdF4b7f686e2938","https://docs.safe.global/core-api/safe-contracts-deployment"],["0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B","https://docs.safe.global/core-api/safe-contracts-deployment"]],
  lido:[["0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb","https://docs.lido.fi/deployed-contracts/"],["0xDC24316b9AE028F1497c275EB9192a3Ea0f67022","https://docs.lido.fi/deployed-contracts/"]],
}
const reservedSource = "https://www.rfc-editor.org/rfc/rfc2606"
const phishingSource = "https://www.cisa.gov/secure-our-world/recognize-and-report-phishing"
const solTokenSource = "https://github.com/jup-ag/token-list/blob/main/validated-tokens.csv"
const evmTokenSource = "https://github.com/Uniswap/default-token-list/blob/main/src/tokens/mainnet.json"
const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const collectedAt = "2026-08-11T13:45:00+03:00"

function parseSimpleCsv(text) {
  const lines = text.trim().split(/\r?\n/); const h = lines.shift().split(",")
  return lines.filter(Boolean).map((line)=>Object.fromEntries(h.map((k,i)=>[k,line.split(",")[i]??""])))
}
function fp(surface,chain,target){return `${surface}:${chain}:${target.trim().toLowerCase()}`}
function evmAddress(seed){return `0x${createHash("sha256").update(seed).digest("hex").slice(0,40)}`}
function solAddress(seed){const b=createHash("sha256").update(seed).digest();let n=BigInt(`0x${b.toString("hex")}`),s="";while(n){s=base58[Number(n%58n)]+s;n/=58n}return (s||"1").padStart(44,"1").slice(-44)}
function wordAddress(address){return address.toLowerCase().replace(/^0x/,"").padStart(64,"0")}
const maxUint="f".repeat(64)
function csvCell(v){v=String(v??"");return /[",\r\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
function add(rows,data){rows.push(Object.fromEntries(headers.map((h)=>[h,data[h]??""])))}

const seenRows=parseSimpleCsv(await readFile(SEEN,"utf8")); const seen=new Set(seenRows.map((r)=>fp(r.surface,r.chain,r.target)))
const freshSol=solTokens.filter(([,a])=>!seen.has(fp("token","solana",a))).slice(0,24)
const freshEvm=evmTokens.filter(([,a])=>!seen.has(fp("token","evm",a))).slice(0,24)
if(freshSol.length<24||freshEvm.length<24) throw new Error(`Not enough fresh registry tokens: sol=${freshSol.length} evm=${freshEvm.length}`)
const tokenPools={solana:freshSol,evm:freshEvm}; const tokenIndex={solana:0,evm:0}; const rows=[]; let seq=1
for(const [projectId,chain,domain] of contexts){
  const mk=(surface,groundTruth,target,sourceUrl,provenanceId,source1Url,source2Url="",evidenceQuality="high",note="")=>add(rows,{id:`SGV2-HO2-CAND-${String(seq++).padStart(3,"0")}`,projectId,surface,chain,groundTruth,target,sourceUrl,provenanceId,source1Url,source2Url,verificationStatus:"verified",evidenceQuality,collectedAt,collectorNote:note})
  for(let i=0;i<3;i++) mk("url","benign",`https://${domain}/?triproof-holdout=${projectId}-${i}`,"",`${projectId}-official-url-${i}`,`https://${domain}/`,"","high","First-party project domain with inert query marker; negative URL case collected before model evaluation")
  for(let i=0;i<3;i++) mk("url","malicious",`https://${projectId}-wallet-${i}.example/claim?connect=wallet`,"",`${projectId}-controlled-phish-url-${i}`,reservedSource,phishingSource,"medium","Controlled adversarial phishing URL on RFC-reserved .example; not a claim about a live domain; report separately from field cases")
  const pool=tokenPools[chain]
  for(let i=0;i<6;i++){const [symbol,address]=pool[tokenIndex[chain]++];mk("token","benign",address,"",`${projectId}-registry-token-${symbol}-${i}`,chain==="solana"?solTokenSource:evmTokenSource,"","high",`Registry-backed ${symbol} token negative; selected only if absent from seen fixture`)}
  for(let i=0;i<2;i++){
    if(chain==="evm"){
      const to=evmAddress(`${projectId}-benign-token-${i}`), spender=evmAddress(`${projectId}-benign-spender-${i}`)
      const target=JSON.stringify({method:"eth_sendTransaction",params:[{to,data:`0x095ea7b3${wordAddress(spender)}${String(i+1).padStart(64,"0")}`}]})
      mk("transaction","benign",target,`https://${domain}/`,`${projectId}-controlled-benign-evm-tx-${i}`,"https://eips.ethereum.org/EIPS/eip-20","","medium","Controlled limited ERC-20 approval negative with first-party source context; deterministic semantic fixture")
    }else{
      const target=JSON.stringify({kind:"solana_wallet_request",method:"signTransaction",instructions:[{programId:"11111111111111111111111111111111",programLabel:"System Program",type:"transfer",keyCount:2}],fixtureContext:`${projectId}-${i}`,serializedTransaction:`AQ${createHash("sha256").update(`${projectId}-${i}`).digest("hex")}`})
      mk("transaction","benign",target,`https://${domain}/`,`${projectId}-controlled-benign-sol-tx-${i}`,"https://solana.com/docs/core/transactions","","medium","Controlled Solana transfer-signing negative with first-party source context; deterministic semantic fixture")
    }
  }
  for(let i=0;i<6;i++){
    const sourceUrl=`https://${projectId}-sign-${i}.example/claim`
    if(chain==="evm"){
      const to=evmAddress(`${projectId}-mal-token-${i}`),spender=evmAddress(`${projectId}-mal-spender-${i}`)
      const target=JSON.stringify({method:"eth_sendTransaction",params:[{to,data:`0x095ea7b3${wordAddress(spender)}${maxUint}`}]})
      mk("transaction","malicious",target,sourceUrl,`${projectId}-controlled-unlimited-approval-${i}`,"https://eips.ethereum.org/EIPS/eip-20",phishingSource,"medium","Controlled adversarial unlimited ERC-20 approval from RFC-reserved phishing origin; report separately from real-world field cases")
    }else{
      const target=JSON.stringify({transaction:{instructions:[{program:"spl-token",programId:"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",parsed:{type:"approveChecked",info:{delegate:solAddress(`${projectId}-delegate-${i}`),amount:"999999999999999999"}}}]},fixtureContext:`${projectId}-${i}`})
      mk("transaction","malicious",target,sourceUrl,`${projectId}-controlled-sol-delegate-${i}`,"https://solana.com/docs/tokens/basics/approve-delegate",phishingSource,"medium","Controlled adversarial SPL delegate approval from RFC-reserved phishing origin; report separately from real-world field cases")
    }
  }
  const known=realWallets[projectId]??[]
  for(let i=0;i<5;i++){
    const real=known[i]
    const target=real?.[0]??(chain==="evm"?evmAddress(`${projectId}-controlled-wallet-${i}`):solAddress(`${projectId}-controlled-wallet-${i}`))
    const source=real?.[1]??(chain==="evm"?"https://ethereum.org/en/developers/docs/accounts/":"https://solana.com/docs/core/accounts")
    mk("wallet","benign",target,"",`${projectId}-${real?"official":"controlled"}-wallet-${i}`,source,"",real?"high":"medium",real?"First-party documented protocol/account address; negative wallet case":"Controlled format-valid negative wallet/account fixture; not asserted to be an active user account")
  }
}
const fingerprints=new Set(),provenance=new Set();for(const r of rows){const f=fp(r.surface,r.chain,r.target);if(fingerprints.has(f))throw new Error(`Duplicate fingerprint ${f}`);fingerprints.add(f);if(seen.has(f))throw new Error(`Seen target reused ${f}`);if(provenance.has(r.provenanceId))throw new Error(`Duplicate provenance ${r.provenanceId}`);provenance.add(r.provenanceId)}
if(rows.length!==200)throw new Error(`Expected 200 rows, got ${rows.length}`)
const surface=Object.groupBy(rows,(r)=>r.surface),labels=Object.groupBy(rows,(r)=>r.groundTruth)
if(surface.url.length!==48||surface.token.length!==48||surface.transaction.length!==64||surface.wallet.length!==40)throw new Error("Surface balance drifted")
if(labels.benign.length<60||labels.malicious.length<60)throw new Error("Ground-truth minimum drifted")
const text=[headers.join(","),...rows.map((r)=>headers.map((h)=>csvCell(r[h])).join(","))].join("\n")+"\n"
await writeFile(OUT,text)
console.log(JSON.stringify({total:rows.length,surfaces:Object.fromEntries(Object.entries(surface).map(([k,v])=>[k,v.length])),groundTruth:Object.fromEntries(Object.entries(labels).map(([k,v])=>[k,v.length])),transactionSourceContext:surface.transaction.filter((r)=>r.sourceUrl).length/surface.transaction.length,maliciousDualSource:labels.malicious.filter((r)=>r.source2Url).length/labels.malicious.length},null,2))
