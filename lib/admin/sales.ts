import { db } from "@/lib/db/prisma"

export type AdminSalesOverview = {
  totalSales: number
  totalRevenueUsdc: number
  revenueLast30DaysUsdc: number
  salesLast30Days: number
  activeSubscriptions: number
  averageOrderValueUsdc: number
  recentSales: Array<{
    id: string
    plan: string
    amountUsdc: number
    provider: string
    network: string
    createdAt: Date
    customerName: string
    customerEmail: string
  }>
  planBreakdown: Array<{
    plan: string
    sales: number
    revenueUsdc: number
  }>
}

export async function getAdminSalesOverview(): Promise<AdminSalesOverview> {
  const now = new Date()
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [verifiedPayments, recentSales, activeSubscriptions] = await Promise.all([
    db.paymentTransaction.findMany({
      where: { status: "verified" },
      select: { amountUsdc: true, plan: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.paymentTransaction.findMany({
      where: { status: "verified" },
      select: {
        id: true,
        plan: true,
        amountUsdc: true,
        provider: true,
        network: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.subscription.count({
      where: { status: "ACTIVE" },
    }),
  ])

  const totalRevenueUsdc = verifiedPayments.reduce((sum, payment) => sum + Number(payment.amountUsdc), 0)
  const paymentsLast30Days = verifiedPayments.filter((payment) => payment.createdAt >= last30Days)
  const revenueLast30DaysUsdc = paymentsLast30Days.reduce((sum, payment) => sum + Number(payment.amountUsdc), 0)

  const grouped = new Map<string, { sales: number; revenueUsdc: number }>()
  for (const payment of verifiedPayments) {
    const current = grouped.get(payment.plan) ?? { sales: 0, revenueUsdc: 0 }
    current.sales += 1
    current.revenueUsdc += Number(payment.amountUsdc)
    grouped.set(payment.plan, current)
  }

  return {
    totalSales: verifiedPayments.length,
    totalRevenueUsdc,
    revenueLast30DaysUsdc,
    salesLast30Days: paymentsLast30Days.length,
    activeSubscriptions,
    averageOrderValueUsdc: verifiedPayments.length ? totalRevenueUsdc / verifiedPayments.length : 0,
    recentSales: recentSales.map((payment) => ({
      id: payment.id,
      plan: payment.plan,
      amountUsdc: Number(payment.amountUsdc),
      provider: payment.provider,
      network: payment.network,
      createdAt: payment.createdAt,
      customerName: payment.user.name,
      customerEmail: payment.user.email,
    })),
    planBreakdown: Array.from(grouped.entries())
      .map(([plan, value]) => ({ plan, ...value }))
      .sort((a, b) => b.revenueUsdc - a.revenueUsdc),
  }
}
