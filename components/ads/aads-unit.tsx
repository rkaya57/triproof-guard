type AAdsUnitProps = {
  placement: string
  className?: string
}

const AADS_UNIT_ID = "2450625"
const AADS_SIZE = "300x250"

export function AAdsUnit({ placement, className = "" }: AAdsUnitProps) {
  return (
    <aside
      aria-label="Sponsored advertisement"
      data-ad-network="a-ads"
      data-ad-placement={placement}
      className={`hidden w-full justify-center lg:flex ${className}`.trim()}
    >
      <div className="w-fit rounded-2xl border border-border/70 bg-card/45 p-3 shadow-sm">
        <p className="mb-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Sponsored
        </p>
        <div
          id={`aads-frame-${placement}`}
          style={{ width: 300, height: 250, margin: "auto", overflow: "hidden" }}
        >
          <iframe
            data-aa={AADS_UNIT_ID}
            src={`https://ad.a-ads.com/${AADS_UNIT_ID}/?size=${AADS_SIZE}`}
            title="Sponsored advertisement"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            style={{
              border: 0,
              padding: 0,
              width: 300,
              height: 250,
              overflow: "hidden",
              display: "block",
              margin: "auto",
            }}
          />
        </div>
      </div>
    </aside>
  )
}
