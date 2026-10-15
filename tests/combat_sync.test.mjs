import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SpellRegistry } from '../js/engine/spell_registry.js';
import { GameState } from '../js/engine/state.js';
import { CombatController, getResolveButtonLabel } from '../js/engine/combat_controller.js';

const spellsData = JSON.parse(fs.readFileSync(new URL('../data/spells.json', import.meta.url), 'utf8'));
const classesData = JSON.parse(fs.readFileSync(new URL('../data/classes.json', import.meta.url), 'utf8'));
const relicAdventure = JSON.parse(fs.readFileSync(new URL('../data/adventure_goblin_relic.json', import.meta.url), 'utf8'));

SpellRegistry.init(spellsData, classesData);

function createTestState() {
  const spec = JSON.parse(JSON.stringify(relicAdventure));
  const classes = JSON.parse(JSON.stringify(classesData));
  return new GameState(spec, classes);
}

function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('1. SNAPSHOT TIMING: Monsters alive until their own killing event beat', async () => {
  const origDocument = globalThis.document;
  const origTimeout = globalThis.setTimeout;
  const origRandom = Math.random;

  try {
    globalThis.document = { getElementById: () => null };
    globalThis.setTimeout = (fn) => { fn(); };

    let targetSeed = null;
    let targetKilledMobId = null;
    let targetKillEventIdx = -1;
    let targetFirstHitIdx = -1;

    // Search seeds for a round where a monster dies on an event AFTER at least one earlier MONSTER_HIT
    for (let seed = 1; seed <= 50; seed++) {
      Math.random = mulberry32(seed);
      const probeState = createTestState();
      probeState.startEncounter('enc_ruins_threshold');
      probeState.combat.enemies[0].hp = 1;
      probeState.combat.enemies[1].hp = 1;

      const sim = probeState.resolveCombatRound();
      let firstHit = -1;
      let killHit = -1;
      let killedId = null;

      sim.events.forEach((evt, idx) => {
        if (evt.eventType === 'MONSTER_HIT') {
          if (firstHit === -1 && !evt.isDead) firstHit = idx + 1;
          if (firstHit !== -1 && evt.isDead && killHit === -1) {
            killHit = idx + 1;
            killedId = evt.targetInstanceId;
          }
        }
      });

      if (firstHit !== -1 && killHit !== -1 && killHit > firstHit) {
        targetSeed = seed;
        targetFirstHitIdx = firstHit;
        targetKillEventIdx = killHit;
        targetKilledMobId = killedId;
        break;
      }
    }

    assert.ok(targetSeed !== null, 'FAIL: Could not find a seed where a monster dies after an earlier hit (no vacuous pass)');

    // Now run the actual CombatController replay on that seed
    Math.random = mulberry32(targetSeed);
    const state = createTestState();
    state.startEncounter('enc_ruins_threshold');
    state.combat.enemies[0].hp = 1;
    state.combat.enemies[1].hp = 1;

    let eventCounter = 0;
    const renderCalls = [];
    const renderer3D = {
      renderEncounterMonsters: (enemies) => {
        renderCalls.push({
          eventIndex: eventCounter,
          enemies: enemies.map(e => ({ ...e }))
        });
      },
      shakeMonsterModel: () => {},
      clearEncounterMonsters: () => {}
    };

    const ctl = new CombatController(state, renderer3D, {
      log: () => { eventCounter++; },
      playSFX: () => {},
      flashHeroCard: () => {},
      updateHUD: () => {},
      applyVisualCombatHp: () => {},
      showCombatFloatingCue: () => {},
      onCombatEnd: () => {}
    });

    await ctl.resolveCombatRoundSequence();

    // Verify renders:
    // 1) Any render call BEFORE the killing event must NOT show target monster at hp 0
    const rendersBeforeKill = renderCalls.filter(r => r.eventIndex < targetKillEventIdx);
    assert.ok(rendersBeforeKill.length > 0, 'Must have at least one render before killing event');
    for (const r of rendersBeforeKill) {
      const mob = r.enemies.find(m => m.instanceId === targetKilledMobId);
      if (mob) {
        assert.ok(mob.hp > 0, `Mob ${targetKilledMobId} showed hp <= 0 before killing event (at event ${r.eventIndex})`);
      }
    }

    // 2) The render call during/after the killing event must show target monster at hp 0
    const rendersAtKill = renderCalls.filter(r => r.eventIndex === targetKillEventIdx);
    assert.ok(rendersAtKill.length > 0, 'Must have a render at the killing event');
    for (const r of rendersAtKill) {
      const mob = r.enemies.find(m => m.instanceId === targetKilledMobId);
      assert.ok(mob, `Mob ${targetKilledMobId} should be present in render during killing event`);
      assert.strictEqual(mob.hp, 0, `Mob ${targetKilledMobId} must show hp: 0 at the killing event`);
    }
  } finally {
    globalThis.document = origDocument;
    globalThis.setTimeout = origTimeout;
    Math.random = origRandom;
  }
});

test('2. RE-ENTRANCY: Concurrent resolveCombatRoundSequence calls resolve exactly once', async () => {
  const origDocument = globalThis.document;
  const origTimeout = globalThis.setTimeout;

  try {
    globalThis.document = { getElementById: () => null };
    const delays = [];
    globalThis.setTimeout = (fn, ms) => { delays.push(ms); fn(); };

    const state = createTestState();
    state.startEncounter('enc_ruins_threshold');

    let resolveCalls = 0;
    const origResolve = state.resolveCombatRound.bind(state);
    state.resolveCombatRound = () => {
      resolveCalls++;
      return origResolve();
    };

    let awardCalls = 0;
    const origAward = state.awardQuestXP.bind(state);
    state.awardQuestXP = (xp) => {
      awardCalls++;
      return origAward(xp);
    };

    const initialRound = state.combat.round;

    const ctl = new CombatController(state, null, {
      log: () => {},
      playSFX: () => {},
      flashHeroCard: () => {},
      updateHUD: () => {},
      applyVisualCombatHp: () => {},
      showCombatFloatingCue: () => {},
      onCombatEnd: () => {}
    });

    // Call twice concurrently without awaiting between them
    const p1 = ctl.resolveCombatRoundSequence();
    const p2 = ctl.resolveCombatRoundSequence();
    await Promise.all([p1, p2]);

    assert.strictEqual(resolveCalls, 1, 'resolveCombatRound must be called exactly once');
    assert.ok(awardCalls <= 1, 'awardQuestXP must be called at most once');
    const finalRound = state.combat.active ? state.combat.round : (initialRound + 1);
    assert.ok(finalRound - initialRound <= 1, 'Combat round must advance by at most 1');
  } finally {
    globalThis.document = origDocument;
    globalThis.setTimeout = origTimeout;
  }
});

test('3. FAST-FORWARD: Re-entrant resolve click switches delays to 120ms', async () => {
  const origDocument = globalThis.document;
  const origTimeout = globalThis.setTimeout;

  try {
    globalThis.document = { getElementById: () => null };
    const delays = [];
    globalThis.setTimeout = (fn, ms) => { delays.push(ms); fn(); };

    const state = createTestState();
    state.startEncounter('enc_ruins_threshold');

    const ctl = new CombatController(state, null, {
      log: () => {},
      playSFX: () => {},
      flashHeroCard: () => {},
      updateHUD: () => {},
      applyVisualCombatHp: () => {},
      showCombatFloatingCue: () => {},
      onCombatEnd: () => {}
    });

    const p1 = ctl.resolveCombatRoundSequence();
    const p2 = ctl.resolveCombatRoundSequence();
    await Promise.all([p1, p2]);

    assert.ok(delays.length > 1, 'Must have multiple delay beats');
    assert.strictEqual(delays[0], 1150, 'First beat must use full delay 1150ms');
    for (let i = 1; i < delays.length; i++) {
      assert.strictEqual(delays[i], 120, `Beat ${i} must use fast-forward delay 120ms`);
    }
  } finally {
    globalThis.document = origDocument;
    globalThis.setTimeout = origTimeout;
  }
});

test('4. ERROR RESILIENCE: Replay error still commits results, resets phase and fastForward', async () => {
  const origDocument = globalThis.document;
  const origTimeout = globalThis.setTimeout;

  try {
    globalThis.document = { getElementById: () => null };
    globalThis.setTimeout = (fn) => { fn(); };

    const state = createTestState();
    state.startEncounter('enc_ruins_threshold');

    let commitCalled = false;
    let committedMobHp = null;
    const origCommit = state.commitCombatRoundResults.bind(state);
    state.commitCombatRoundResults = (mobHp, heroHp, victory, totalXp) => {
      commitCalled = true;
      committedMobHp = mobHp;
      return origCommit(mobHp, heroHp, victory, totalXp);
    };

    let callCount = 0;
    const ctl = new CombatController(state, null, {
      log: () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Simulated callback failure during replay');
        }
      },
      playSFX: () => {},
      flashHeroCard: () => {},
      updateHUD: () => {},
      applyVisualCombatHp: () => {},
      showCombatFloatingCue: () => {},
      onCombatEnd: () => {}
    });

    // Suppress expected console.error during test
    const origError = console.error;
    console.error = () => {};
    try {
      await ctl.resolveCombatRoundSequence();
    } finally {
      console.error = origError;
    }

    assert.strictEqual(commitCalled, true, 'commitCombatRoundResults must be called even when replay callback throws');
    assert.ok(committedMobHp !== null, 'Committed HP data must be passed to commit');
    assert.strictEqual(state.combat.phase, 'PLANNING', 'combat.phase must reset to PLANNING');
    assert.strictEqual(state.combat.fastForward, false, 'combat.fastForward must reset to false');
  } finally {
    globalThis.document = origDocument;
    globalThis.setTimeout = origTimeout;
  }
});

test('5. BUTTON LABELS & PHASE GUARD: getResolveButtonLabel returns proper state text', () => {
  assert.strictEqual(
    getResolveButtonLabel({ phase: 'PLANNING', round: 2 }),
    '🔥 RESOLVE ROUND 2'
  );
  assert.strictEqual(
    getResolveButtonLabel({ phase: 'RESOLVING', fastForward: false, resolveProgress: 45 }),
    '⏳ RESOLVING 45% [Click ⏩ to Skip]'
  );
  assert.strictEqual(
    getResolveButtonLabel({ phase: 'RESOLVING', fastForward: true, resolveProgress: 75 }),
    '⚡ FAST-FORWARDING... 75%'
  );
  assert.strictEqual(
    getResolveButtonLabel(null),
    '🔥 RESOLVE ROUND 1'
  );
});
