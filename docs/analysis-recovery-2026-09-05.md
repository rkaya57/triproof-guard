# Analysis continuation reliability

This change builds on product-readiness PR #135 and fixes gaps in the existing worker continuation flow.

- Global worker calls can continue draining active work after their two-batch limit, without bootstrapping the production validation dataset again.
- Continuation POSTs use authenticated `defer=true` requests. The endpoint acknowledges with HTTP 202 before `after` runs the worker, so the preceding invocation does not wait for another full batch execution. The caller limits acknowledgement waiting to ten seconds.
- Bootstrap calls that exhaust their processing budget consider remaining work for continuation rather than relying exclusively on the next scheduled call.
- Worker queue snapshots exclude terminal analyses; historical reporting defaults remain unchanged.
- Duplicate invocations that did not acquire the analysis lock do not dispatch another successor.
- Analysis-scoped recover-only calls attempt finalization after stale batch recovery, including when the last batch exhausted its retry allowance.

Authentication, existing lease fencing and retry limits are retained. HTTP 202 acknowledges scheduling; it does not mean the analysis completed.

## Validation

`npm run test:analysis-recovery` covers draining multiple invocations, live versus expired processing, empty queues, global/scoped continuation URLs, duplicate-lock suppression and unique lease tokens. It is included in product-readiness CI. These are policy-level unit tests, not a forced-termination test against a hosted worker.

## Operational limits and next work

`after` is bounded by the hosting platform's function lifetime. A hard termination or failed HTTP handoff can still require the existing authorized recovery endpoint or scheduled worker invocation. The repository's daily cron schedule is unchanged. Reliable recovery within minutes requires a separately configured frequent scheduler or durable queue, followed by interruption testing on a non-production database and provider fixture. Do not interpret these changes as an exactly-once processing guarantee or a production recovery SLA.

Before production rollout, validate authenticated deferred acknowledgements, kill a worker after it claims a batch, verify its lease expires and is recovered, and confirm that the expired worker cannot overwrite the new owner's result. No production worker calls or database writes were performed for this implementation.
