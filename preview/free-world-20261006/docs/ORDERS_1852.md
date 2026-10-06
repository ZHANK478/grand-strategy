## Open administrative work and political attention — 3 October 2026

This update uses the same rules for all player countries and custom scenarios. No country, commission name, historical minister or mission destination is hardcoded.

### Generic executive work
Validated administration effects create/update/close saved initiatives:
- organization: commission or administrative body;
- assignment: report, investigation or ministerial plan;
- mission: an assignment with a real foreign-country destination;
- programme: preparation of an executive programme.

Each initiative stores mandate, executor, deadline, own country, optional destination, setup cost, monthly funding, spent funds, phase and documents. It is a persistent world object, not a map decoration or a public statement. Missions are remembered by the receiving government's actor without inventing consent.

Work reaches awaiting_report on its calendar deadline. A bounded additional AI call batches up to three due documents, using actual economic snapshots and relevant foreign-country data. Documents contain analysis and up to three proposed orders; they never apply policy. The UI in Orders → Дела и документы displays full saved documents and buttons that queue ordinary orders. A fourth due document waits for the next turn. Failed report generation keeps the initiative pending and does not undo simulation or trigger an automatic retry in the same turn.

Monthly funding is debited from the initiative's own treasury. Work pauses and deadlines move when funding is absent. Completed assignments/missions stop recurring charges; organizations/programmes remain established until closed. Updating a mandate restarts work with a seven-day default if no new deadline is supplied.

The planner now receives explicit tax rates, treasury, debt, spending and a monthly forecast even before the first budget settlement. Relative instructions such as halving the bourgeois tax are computed from those facts, not rejected for lacking an explicit number. A harmless sole administration:{initiatives:...} response wrapper is canonicalized; extra nested effects remain invalid.

Limits: administrative work supports analysis, institutions, missions and recommendations, not automatic land confiscation, foreign consent or arbitrary unmodelled economic effects. New organizations are not yet individual staff simulations. Minister chat remains advisory; the new queue and document approval live in the orders panel.

### Political relevance
Current GDP determines economic weight and a dynamically recomputed GDP rank. Tiers use ratios to scenario maximum GDP: great >=25%, regional >=6%, otherwise small. These describe the game's current data, not a newly calibrated historical GDP series.

Attention score:
- economic weight: 45 × sqrt(GDP / scenario maximum);
- shared border: +45, identified from shared province vertices;
- other geographic proximity: up to +25 from representative boundary-point distance;
- existing war: +80;
- treaty: +25;
- own active mission to the country: +35;
- recent direct diplomacy: +20;
- current foreign-government issue: +15.

Relevant-country selection reserves nearby/involved states and major economies within a bounded context. The actor planner and autonomous foreign selection use this policy, not income-only ranking or a fixed list of powers. Geographic sampling and shared-vertex detection are approximations; ownership changes invalidate geographic data.

Foreign paper stories use political weight plus event importance. Similar reactions are grouped; long lists retain up to three prominent entries, including the economically strongest participant, while lesser entries remain in collapsed details. Engine war/treaty notices retain actor identities and editorial importance. Completed reports outrank obsolete “work just started” notices.

### Validation / budget / rollback
180 assertions executed against actual production JS in an isolated V8 DOM/storage harness, including saved initiatives, funding, role/resource validation, duplicate IDs, full document display, approval queue, relative-tax calculations, generic Prussian/French live replies, synthetic GDP/geography/ownership/ranking fixtures, and old regressions. Actual browser/device layout was not inspected.

This task received its own 20-request test allowance. Used 10 successful paid requests, total $0.011751; 10 remaining for this task. Tests covered plan interpretation, first-turn missing economic context, ministerial reports, France/Prussia, and ranked newspaper rendering. No server secret was retrieved or published. No extra autonomous per-country AI requests were introduced; due-document batches are additional to the usual plan and newspaper requests.

Rollback point: experiment commit c52e939d348620792900518fec0d6a03ba3b6e3d; main commit 020b16f28241af5fa77cd8cb975574d0c62c2c98. Stable core-loop page unchanged.

---

## Active participants and expressive newspaper — 3 October 2026

Every country receives persistent actor records from its actual institutions/classes, not a list of named historical exceptions. Cabinet, military, parliament (where present), clergy and classes have interests, influence, grievance, recent memory, demands and action dates. Foreign governments use their scenario agenda.

Confirmed executive outcomes (including started recruitment and completed processes) drive actor responses. Receipt IDs prevent duplicate reactions. Taxes can provoke demands or support; social spending affects the relevant group's position; political changes put institutions on notice; major recruitment/war decisions prompt up to three relevant governments to request explanations. Relations and actor concerns are saved.

Bounded actions:
- Petitions create persistent demands; improved conditions can resolve them.
- Support can change class/military/parliament support by one point.
- Parliamentary obstruction needs actual parliament, grievance >=30 and support <55; support declines by two.
- Protests need class grievance >=40 and loyalty <45; stability declines by one.
- Foreign governments can propose talks (+1 relation), denounce (-2), fund an additional social programme from a positive budget, or pay for 5000 recruits. Foreign recruitment spends its own 10 units, checks population, and trains for 90 days.
- Cooldown: 21 days for domestic actor actions, 45 for government actions; at most one concurrent foreign recruitment per country.
- Weekly autonomous decisions examine domestic actors, up to three relevant governments and two rotating foreign governments. No per-country AI call. Existing monthly economy/diplomacy still runs.
- Optional actor_intents are proposed in the existing AI plan; strict IDs/actions and current engine preconditions are checked. Invalid role or insufficient grounds cannot bypass rules.
- Scenario autonomousWorld:false suppresses the new foreign autonomy; existing foreign training still completes.

Newspaper prioritises actual participant actions, groups similar reactions into a single story, and writes up to three domestic and three foreign articles of 65–100 words. Editorial language is encouraged; invented quotes, protests, outcomes and state changes are prohibited. Mechanical details remain collapsed. Max 4200 output/reasoning tokens (a ceiling, not a fixed usage). Context is bounded. This does not eliminate semantic hallucination in prose; it never grants the writer state mutation.

Limitations: actors are aggregate interest groups, not full individual personalities; grief thresholds and effects are prototype balance. No detailed coalition negotiations, strike economy, diplomatic ultimatum deadlines or arbitrary minister competence yet. Existing scenario colonial owners are still treated according to the current country model, not a new dependency/sovereignty system. Geographic relevance uses the existing approximate country-centroid heuristic. DOM tests mock geography; no real-device visual verification claimed.

Validation: 134 assertions, actual production JS in an isolated V8 DOM/storage harness; includes generic French/UK reaction checks, cooldowns, resource ownership, training, persistence, rollback, strict actor intent validation, and two new live Luna replies as replay fixtures.
This update's two authorised live calls: plan 5250 input / 341 output, $0.000826675; newspaper 2068 input / 1916 output (1082 reasoning), $0.001216425. Total $0.0020431. Session test allowance: 14/20 attempts used; 6 remain.
Rollback point before this update: experiment commit 358cb33d8b75904e8b3492623d07627f7817fa94. Stable core-loop page unchanged.

---

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
