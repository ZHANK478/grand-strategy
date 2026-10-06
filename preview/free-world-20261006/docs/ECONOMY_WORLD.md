# Economy and demography experiment

Entry: economy-world.html. Branch: experiment/economy-world.
The political-world entry and its saves are preserved. Start a fresh party for economic testing.

## Accounting
People are stored in thousands. GDP and productive capital are million reference currency units at scenario starting prices. GDP is annual real production. Budget flows are monthly million current reference units. Treasury, debt, compensation and arrears are stocks in the same currency. The price index converts production/incomes to current money; household real income is deflated.

Every elapsed day accrues revenue, contractual expenditure, production, prices and population using 365.2425 days/year. Calendar boundaries close ledgers; they do not grant another month's money. GDP and population are distributed back to owned provinces. Loan principal is financing, not GDP or tax revenue.

Taxes are collected from five disjoint household groups. Income shares are normalized and distinct from population shares. Scenario economySeed.groups may supply labels and population shares; absent data uses an explicitly approximate urbanization-based initialization. No special order execution exceptions for countries or historical persons.

Zero taxes do not zero administrative expense. Borrowing and monetary finance are disabled until authorized. An unpaid budget creates arrears, poorer delivery, discontent and institutional disruption. Automatic authorized borrowing has a limit. Printing is an explicit policy and affects prices; debt alone does not cause inflation.

## Policy interface
Typed economic_policy operations:
- ownership: sector agriculture/industry/resources/services; target state share 0..1; compensation boolean; days 1..3650.
- coordination: market/regulated/planned; days.
- tax: group noble/burgher/commons/peasants/middle; target 0..100; days.
- spending: education/welfare/infrastructure; target monthly units; days.
- tariff: target percent.
- financing: automaticBorrowing and monetaryFinancing booleans.

Compensation is paid up front; insufficient money blocks compensated transfer. Ownership changes gradually and does not manufacture output. Enterprise profit, rather than enterprise gross sales, enters the budget. Coordination is independent of ownership. Programs are serialized inside country state, update orders on completion, and survive save/load. Recruitments gradually deliver prepared soldiers during the existing recruitment process.

The political planner receives compact economic facts and these typed instructions in the existing single turn request. It selects policy and expresses participants' interests; the engine owns numerical outcomes. No extra recurring paid economic call.

## Interface
Overview, Budget, Population, Production. First-turn budget forecast exists before advancing time. The budget separates projected monthly figures and calendar-to-date accounting. A pointer-equipped laptop has a wider economy pane; mobile retains the existing compact side panel. HUD adds population and GDP/person.

## Validation
34 accounting/schema/UI checks; 36 checks across 15 simulated turns for France, Prussia, Britain; 9 checks replaying the real Luna response plus progressive recruitment. The existing 169 political checks run unchanged in CI.
Live allowance: 2 of 20 calls used, total $0.00546935. One retry was required by a test harness callback mistake; both calls counted. No paid calls in CI.

## Limits and next balancing work
This is a first integrated economic simulation, not a historical economic reconstruction.
Only nine 1852 country profiles currently contain explicit economic seeds; remaining countries still use the legacy fallback. GDP rankings outside these profiles require historical data calibration.
Five household groups start with approximate income weights; detailed wages, returns and class mobility remain simplified.
Four sectors have aggregate investment/capital dynamics, not individual factories or detailed commodity chains.
Imports and tariff yield are aggregate approximations, not bilateral traded goods.
No detailed age pyramid, employment matching, maturity schedules for bonds, banking system, exchange rates, or war supply routes.
Real-device visual verification has not been performed in this tool environment.
