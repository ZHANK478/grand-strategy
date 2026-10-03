# Executive orders experiment: 3 October 2026

The player controls executive decisions and attempts, not every result. History supplies starting conditions. Historical biography is not a ban on an appointment, and a procedure does not need its own button.

Current update:
- Gregorian day/month/year, real seven-day weeks, leap years. Month skips preserve the day where possible. Economy still settles on monthly boundaries.
- Saved executive processes: general implementation of existing validated effects, referendum, recruitment. An accepted process is `in_progress`; effects apply at the deadline after current resource/institution checks.
- Referendum minimum 21 days, organisation charge 10% of monthly income. Support is estimated from class loyalty (70%) and stability (30%), with ±10 points of turnout/campaign uncertainty; this is a prototype formula, not historical polling. Majority does not remove institutional resistance to changing the regime.
- Recruitment minimum 90 days, initial charge 0.002 per recruit, population cap and reservations across concurrent recruitment. Training is an aggregate prototype; no staged manpower or supply system yet. Failed preparation consumes its organisation spending.
- Public statements are registered separately from material state. A claimed supernatural status cannot create powers.
- AI interprets free text into a constrained plan and suggested process duration. Engine owns dates, resources, voting, authority, actual changes and rollback.
- After simulation a separate newsroom request writes up to eight short articles using only confirmed source facts. It cannot submit effects. Every article has collapsed execution details; the first domestic article includes the period's decision audit. Remaining minor notices go into that archive.
- Newsroom has bounded inputs, max 3200 output/reasoning tokens, no automatic paid retries. Its failure leaves the completed simulation intact and shows factual notices. This is an additional request per turn, not an extra reserved game turn.
- Editorial factuality is prompted and structural IDs validated; semantic hallucinations remain possible in prose. Prose never modifies state.
- Physical actions beyond the current effect vocabulary are still a prototype limitation, explicitly deferred rather than called historically impossible. Processes do not yet implement arbitrary covert operations, campaign choices, individual minister competence, or full political coalitions.
- Existing economy formulas have not been redesigned in this update.

Validation: 105 assertions across eight suites, executed against actual production JS in an isolated V8 DOM/storage harness; no real browser layout verification. Includes two live Luna replies as replay fixtures. Three authorised live requests this update cost $0.00287675; first newsroom attempt exhausted its 1800-token reasoning/output budget, fixed to 3200. Session allowance: 12/20 attempts used, 8 remaining (two earlier timed-out attempts counted conservatively).

Rollback: previous experiment commit `998dee7e190a1500f258d469256296fa58abec02`. Stable `core-loop.html` unchanged.
