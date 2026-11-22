# Archive: 38. Realism audit: what still imitates, after §18 (continued)

The closed items of [`docs/plan/38-realism-audit-2.md`](../38-realism-audit-2.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 38w. Classic Light Show as a real dish (2026-11-21)

- ~~**38w-1. Classic laid as oil cells in a coloured water on the lamp**~~ shipped
  (`npm run classicdish`; the story in `docs/plan-shipped.md`).
- ~~**38w-10. Evolve at full speed never moves a dial faster than the slow-change rule**~~
  shipped (S; Medium). Classic's new settings drew particleMix 0.69 to 0.50 over a 5.4 s glide,
  5.3 % of its travel a second (`npm run slowevolve`, red on 917). A move's step is now capped
  to what its glide may cover (DIAL_RATE_MAX, 4 %/s at the smoothstep's peak): 3.99 %/s after.
