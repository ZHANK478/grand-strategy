# Coastal landings and compound constitutional mandates — v17

A free-text transport mandate is one dated operation: gather an existing army and a reachable fleet at the source harbour, load actual transport capacity, sail, fight or unload at the destination, return for additional waves when necessary. Ships and troops never appear from narrative text. A coastal province is a valid landing target without a named port. Internal beachheads do not create map icons. Explicit armed invasion starts war upon arrival; preparation alone does not.

The planner receives coastal province IDs, owners, sea areas and geographic coordinates as well as available troops and ongoing transports. This supports custom scenarios and region names without a list of country-specific command exceptions. The existing naval executor still handles building, patrols, escorts, blockade, upkeep, supply, straits and combat. New transport stages require no additional model request.

Initial scenario hull totals are split among distant existing naval bases. Untouched original seeded fleets in older saves are repaired conservatively; issued fleet movements, new construction and other player deployments are preserved. Unreachable transport routes remain a real restriction, but the coast of a large basin no longer inherits a far-away strait merely because its centre happens to be closer.

A compound constitutional mandate may create a chamber and specify its initial composition, franchise and election term. Creation plus immediate election is valid; subsequent votes use eligible social groups and actual faction organization rather than a guaranteed future result. Annual elections use a one-year term, not an immediate election every time the interpreter reads the mandate. New faction names are scenario-independent. Existing seats cannot be overwritten by an ordinary decree.

The production save containing the quoted Ottoman order recorded the actual error “Выборы требуют представительного органа”; it was an execution-validation dependency bug, not historical opposition or a lack of parliamentary mechanics. The fix validates creation before its dependent election and applies the whole checked political packet.

Technical processing errors belong in the retryable order status, outside the newspaper; old saved error articles are also filtered. A diplomatic proposal and its delivery notice share one story. Newspaper coverage, archives and background literary editing remain.

## Free verification

- `node tests/amphibious-government.test.mjs`: compound mandates, real hull/troop conservation, multi-wave loading, reload mid-transit, coastal defense, hostile straits, actual invasion, cancellation and newspaper grouping.
- Existing economic, military, political, maritime, causal and institutional integration suites.
- `node tests/browser-startup.test.mjs`: desktop and Android-sized touch Chromium; exact parliamentary mandate through the real turn flow and a 50,000-soldier maritime transfer through an ordinary month turn, with recorded provider replies.
- Published Pages smoke check with external AI calls blocked.

No paid provider requests are used by these tests. Recorded replies verify execution and integration, not the probability that a live model will interpret every new phrasing correctly.
