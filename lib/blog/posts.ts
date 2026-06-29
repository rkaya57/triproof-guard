export type BlogPost = {
  slug: string
  title: string
  excerpt: string
  category: string
  date: string
  readTime: string
  tags: string[]
  content: string[]
}

export const blogPosts: BlogPost[] = [
  {
    slug: "what-is-sybil-attack-in-web3-airdrops",
    title: "What Is a Sybil Attack in Web3 Airdrops?",
    excerpt:
      "A practical explanation of how wallet farms abuse reward campaigns and why teams need wallet risk review before distribution.",
    category: "Airdrop Security",
    date: "2026-06-29",
    readTime: "4 min read",
    tags: ["Sybil", "Airdrops", "Wallet Risk"],
    content: [
      "A Sybil attack happens when one actor creates or controls many wallets to appear like many different users. In Web3 campaigns this can distort airdrops, quests, testnets and allowlists.",
      "The problem is not only the number of wallets. The deeper issue is repeated behavior: shared funding sources, similar transaction patterns, very young wallets, low wallet history and coordinated campaign actions.",
      "A good review process should not claim to prove who is human with 100% certainty. It should surface risk signals and help the campaign team separate clean wallets, manual review wallets and rejected wallets.",
      "Tri-Proof Guard focuses on this exact workflow: upload a campaign wallet CSV, generate wallet risk scores, detect suspicious clusters and export cleaner reward decision lists before payouts happen."
    ],
  },
  {
    slug: "how-wallet-clustering-helps-detect-airdrop-farms",
    title: "How Wallet Clustering Helps Detect Airdrop Farms",
    excerpt:
      "Wallet-by-wallet review is not enough. Clustering helps reveal groups of wallets that behave like a coordinated farm.",
    category: "Risk Engine",
    date: "2026-06-29",
    readTime: "5 min read",
    tags: ["Clustering", "Funding Source", "Risk Score"],
    content: [
      "Wallet clustering groups addresses by shared signals. These signals can include funding source, timing, transaction count, contract interaction patterns and campaign behavior.",
      "One suspicious wallet may not prove much. But twenty wallets funded from the same origin, created around the same period and interacting with the same campaign in the same way deserve manual review.",
      "This is why Tri-Proof Guard combines wallet-level scoring with cluster-level review. The output is easier for teams to use because it explains which groups need attention and why.",
      "The end goal is operational: reduce reward leakage, protect real users and give the project team a defensible review trail."
    ],
  },
  {
    slug: "why-web3-campaigns-need-wallet-risk-analysis-before-rewards",
    title: "Why Web3 Campaigns Need Wallet Risk Analysis Before Rewards",
    excerpt:
      "Reward distribution should not be the first time a project looks closely at its participant wallet list.",
    category: "Campaign Operations",
    date: "2026-06-29",
    readTime: "3 min read",
    tags: ["Rewards", "CSV", "Operations"],
    content: [
      "Most Web3 teams collect wallet addresses through forms, quests, community campaigns or testnet participation. The list grows quickly, but quality is not guaranteed.",
      "Before rewards are distributed, teams should run a wallet risk analysis to identify suspicious clusters, low-quality wallets and manual review cases.",
      "The best output is not a vague dashboard. It is an action list: approved wallets, manual review wallets and rejected wallets, supported by clear reasons.",
      "Tri-Proof Guard is built around this campaign workflow so teams can make faster and cleaner reward decisions."
    ],
  },
]

export function getPublishedPosts() {
  return blogPosts
}

export function getPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug) ?? null
}
