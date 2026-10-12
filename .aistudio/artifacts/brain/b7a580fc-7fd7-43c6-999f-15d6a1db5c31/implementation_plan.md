# Implementation Plan - Combat Resolution & Action Synchronization Assessment

## 1. Assessment of Combat Resolution Code & Action Queue (`CombatEngine`)

Our technical review of `js/engine/combat/combat_engine.js` and `js/engine/combat/combat_actions.js` reveals the following architectural safeguards for combat synchronization:

- **Live Enemy Filtering (`livingMobs`)**: At the beginning of each queued action iteration in `resolveCombatRound`, `livingMobs` is dynamically re-computed:
  ```js
  const livingMobs = state.combat.enemies.filter(e => simMobHp[e.instanceId] > 0 && !e.fled && !e.surrendered);
  if (livingMobs.length === 0) break;
  ```
  If all monsters are slain mid-round, the loop breaks immediately, preventing any lingering hero actions from executing against dead targets.

- **Dynamic Target Redirection**: When a hero's queued command specifies a target monster that has already been slain by a faster action earlier in the same round:
  ```js
  let target = livingMobs.find(e => e.instanceId === command.targetInstanceId) || livingMobs[0];
  if (!target) break;
  ```
  The engine automatically redirects the attack to the next available living enemy (`livingMobs[0]`), ensuring zero wasted actions or errors.

- **Phase-Tier Sorting**: Actions are ordered by initiative/phase tier (Backstab/Instant [Tier 0/1] -> Melee/Spell [Tier 2] -> Slow [Tier 3]), ensuring faster combatants strike first.

## 2. Recommended Verification & Enhancements (Optional)

While the synchronization and redirection logic is robust and prevents attacks on dead enemies, we can optionally enhance the combat log messaging when a target is redirected mid-round so players have clear narrative feedback (e.g., *"Target slain! Redirecting attack to [New Target]"*).

## 3. Verification Plan

1. Run unit/integration checks on combat round resolution using Node scripts.
2. Simulate combat scenarios where multiple heroes target a single low-HP monster to verify graceful target redirection and loop termination.
