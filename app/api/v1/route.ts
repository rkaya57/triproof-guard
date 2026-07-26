import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({
    name: "Tri-Proof Guard API",
    version: "v1.9",
    auth: "Dashboard session or API key header.",
    endpoints: {
      createAnalysis: {
        method: "POST",
        path: "/api/v1/analyze",
        body: {
          chain: "Solana",
          wallets: ["walletAddress1", "walletAddress2"],
          campaignType: "Airdrop",
          projectName: "Solana Campaign Audit",
          riskPolicy: "balanced",
          analysisMode: "onchain",
          campaignContracts: ["optionalCampaignProgramId"],
          notes: "optional campaign context"
        }
      },
      getAnalysis: {
        method: "GET",
        path: "/api/v1/analysis/ANALYSIS_ID"
      },
      scamGuardScan: {
        method: "POST",
        path: "/api/v1/scamguard/scan",
        body: {
          type: "transaction",
          value: "approve delegate, set authority, close account",
          walletAddress: "optionalConnectedWallet"
        }
      }
    },
    riskPolicies: ["conservative", "balanced", "strict"],
    publicDemo: {
      sampleReport: "/demo/report",
      datasetCsv: "/demo/tri-proof-public-demo-wallets.csv",
      sampleReportJson: "/demo/tri-proof-sample-report.json"
    }
  })
}
