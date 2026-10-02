# Test access and diplomacy UI — 2026-10-02

The experimental page uses core-loop-ui.js. Diplomacy messages have no flag/globe prefix; reopening a country's chat rebuilds the visible conversation from diplomacyHistories. Player messages and replies trigger saveGame(), preserving the same history supplied to the model. A reply arriving while another country is selected does not overwrite that country's chat.

The date area shows the game turn and remaining server turns. Supabase guest balances are tracked by auth user ID, not physical device. persistSession restores the same anonymous user across tab closes. Other browser profiles, incognito, or cleared storage can create a new user; the ten-turn quota alone does not prevent repeat trials.

Anonymous sign-ins are now enabled. A real Luna guest request returned HTTP 200 and cost $0.000005 (15 input / 7 output tokens). No further paid inference was used for these UI/quota changes.

Ordinary guests retain 10 turns, 200 text requests, and 20 requests without a reserved turn. A private one-use tester invite raises only its claimed user's total allowance to 100 turns, 1000 requests, and 100 pre-turn requests. Reusing it on the same guest is idempotent; other users cannot claim it. It does not reset spent turns or the cash balance. Invite codes are stored only in a server-only RLS table, never in the repository. Activate under Menu → Подключение ИИ → Код тестировщика.

Apply supabase/tester_trials.sql after mobile_guest.sql. guest-ai validates every POST session itself with auth.getUser and checks is_anonymous; gateway JWT verification remains disabled as before. Redeem invokes a service_role-only RPC. Registered balances are unchanged.

Checks: JavaScript parsing; mocked chat reopening and switching countries during a pending response; SQL transaction with assertions for 100-turn grant, rejected invite reuse by another user, idempotent turn reservation, and request quota. SQL test changes were rolled back. No actual browser/device layout test was available.
