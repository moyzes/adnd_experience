import { CombatCalculator } from './combat_calculator.js';
import { CombatActions } from './combat_actions.js';

/**
 * CombatEngine coordinates high-level combat flow, turn management, action queuing,
 * morale evaluations, victory/wipe conditions, and surrender interactions.
 */
export class CombatEngine {
  /**
   * Initializes and starts a combat encounter from an encounter specification.
   */
  static startEncounter(state, encounterId) {
    const encSpec = (state.spec.encounters || []).find(e => e.id === encounterId);
    if (!encSpec) return false;

    let instanceIdCounter = 1;
    const spawnedEnemies = [];

    encSpec.enemies.forEach(group => {
      const monsterDef = state.spec.monsters[group.monsterId];
      if (!monsterDef) return;

      for (let i = 0; i < group.count; i++) {
        spawnedEnemies.push({
          instanceId: `mob_${group.monsterId}_${instanceIdCounter++}`,
          id: monsterDef.id,
          name: group.count > 1 ? `${monsterDef.name} ${String.fromCharCode(65 + i)}` : monsterDef.name,
          hp: monsterDef.hp,
          maxHp: monsterDef.maxHp,
          armorClass: monsterDef.armorClass,
          armorType: monsterDef.armorType || 'leather',
          attackTarget: monsterDef.attackTarget,
          thaco: monsterDef.thaco != null ? monsterDef.thaco : (monsterDef.attackTarget ? Math.max(10, 20 - (monsterDef.attackTarget - 11)) : 20),
          damage: monsterDef.damage,
          damageType: monsterDef.damageType || 'slashing',
          actionPhase: monsterDef.actionPhase || 'MEDIUM',
          moraleThreshold: monsterDef.moraleThreshold || 40,
          xpReward: monsterDef.xpReward || 50,
          glbModel: monsterDef.glbModel,
          rotationOffset: monsterDef.rotationOffset || [0, 0, 0],
          positionOffset: monsterDef.positionOffset || [0, 0, 0],
          scale: monsterDef.scale !== undefined ? monsterDef.scale : 0.75,
          creatureType: monsterDef.creatureType || 'mortal',
          undeadTier: monsterDef.undeadTier || null,
          info: monsterDef.info || null,
          revealTrapCoords: monsterDef.revealTrapCoords || null,
          loot: monsterDef.loot ? JSON.parse(JSON.stringify(monsterDef.loot)) : null,
          isLeader: !!monsterDef.isLeader
        });
      }
    });

    const isDarkAmbush = state.isDarknessActive() && !state.canPartySeeAhead();
    const hasElvenBoots = state.partyHasBootsOfElvenkind && state.partyHasBootsOfElvenkind();
    const surprise = (!isDarkAmbush && (!!encSpec.scouted || hasElvenBoots));
    state.combat = {
      active: true,
      round: 1,
      encounterId: encounterId,
      enemies: spawnedEnemies,
      queuedCommands: {},
      previousCommands: {},
      channelingCast: null,
      surpriseRound: surprise,
      alertedRound: isDarkAmbush || (!!encSpec.alerted && !hasElvenBoots),
      moraleCheckedFirstBlood: false,
      moraleCheckedHalfSquad: false,
      moraleCheckedLeader: false
    };

    if (hasElvenBoots && !isDarkAmbush) {
      state.addLog(`🧝 Boots of Elvenkind: Moving with supernatural elven silence, your party catches the enemy by complete surprise! Free surprise round active!`, "success");
    }

    if (isDarkAmbush) {
      state.addLog(`🌑 AMBUSHED IN THE DARK! Without a torch or light spell, the enemies strike from the gloom!`, "danger");
    } else {
      const light = state.getActiveLightSource();
      if (light.active) {
        const srcName = light.type === 'arcane_light' ? 'Arcane Light' : 'Torchlight';
        state.addLog(`🔥 ${srcName} reveals ${encSpec.name} ahead, preventing a dark ambush!`, "info");
      }
      state.addLog(`⚔️ COMBAT ENGAGED! ${encSpec.name} (${spawnedEnemies.length} hostiles present).`, "danger");
    }
    return true;
  }

  /**
   * Queues a player action command for a specific hero index.
   */
  static queueHeroCommand(state, heroIndex, command) {
    if (state.combat && state.combat.queuedCommands) {
      state.combat.queuedCommands[heroIndex] = command;
    }
  }

  /**
   * Resolves a full combat round: builds action queues based on phase tiers, executes actions in order,
   * checks morale triggers, and computes victory or wipe conditions.
   */
  static resolveCombatRound(state) {
    if (!state.combat || !state.combat.active) {
      return { events: [], finalMobHp: {}, finalHeroHp: {}, victory: false, partyWiped: false, totalXp: 0 };
    }

    const actionQueue = [];
    const combatEvents = [];
    
    const simMobHp = {};
    state.combat.enemies.forEach(e => { simMobHp[e.instanceId] = e.hp; });

    const simHeroHp = {};
    state.party.forEach((h, idx) => { simHeroHp[idx] = h.hp; });

    const castInterrupted = {};
    const selfGuardAc = {};
    const guardedBy = {};

    state.party.forEach((hero, index) => {
      if (state.combat.round === 1 && state.combat.alertedRound) return;
      if (hero.hp <= 0) return;
      // GUARD is only active when explicitly queued for the active round
      const cmd = state.combat.queuedCommands[index];
      if (!cmd || cmd.type !== 'GUARD') return;
      const targetIdx = cmd.guardTargetIndex;
      if (targetIdx == null || targetIdx < 0 || targetIdx >= state.party.length) return;
      const targetHero = state.party[targetIdx];
      if (!targetHero || targetHero.hp <= 0) return;
      if (targetIdx === index) selfGuardAc[index] = 1;
      else guardedBy[targetIdx] = index;
    });

    state.party.forEach((hero, index) => {
      if (hero.hp <= 0) return;

      let cmd = state.combat.queuedCommands[index] || state.combat.previousCommands[index];

      // Non-repeatable or situational actions (GUARD, CAST, PRAY, BACKSTAB, TURN) must not auto-repeat from memory
      if (!state.combat.queuedCommands[index] && cmd) {
        if (cmd.type === 'GUARD' || cmd.type === 'CAST' || cmd.type === 'PRAY' || cmd.type === 'BACKSTAB' || cmd.type === 'TURN') {
          cmd = null;
        }
      }

      if (!cmd) {
        const defaultTarget = state.combat.enemies.find(e => e.hp > 0);
        cmd = { type: 'ATTACK', targetInstanceId: defaultTarget ? defaultTarget.instanceId : null };
      } else if (cmd.type === 'ATTACK' || cmd.type === 'SHOOT') {
        const targetAlive = state.combat.enemies.some(e => e.instanceId === cmd.targetInstanceId && e.hp > 0);
        if (!targetAlive) {
          const defaultTarget = state.combat.enemies.find(e => e.hp > 0);
          cmd = { ...cmd, targetInstanceId: defaultTarget ? defaultTarget.instanceId : null };
        }
      }

      // Only preserve repeatable martial attacks in smart action memory
      if (cmd.type === 'ATTACK' || cmd.type === 'SHOOT') {
        state.combat.previousCommands[index] = { ...cmd };
      } else {
        delete state.combat.previousCommands[index];
      }

      let phaseTier = 2;
      if (cmd.type === 'BACKSTAB') phaseTier = 0;
      else if (cmd.type === 'SHOOT') phaseTier = 1;
      else if (cmd.type === 'CAST') {
        const sp = hero.spells && hero.spells[cmd.spellIndex];
        const ct = (sp && sp.casting_time) || 'normal';
        phaseTier = ct === 'instant' ? 1 : ct === 'slow' ? 3 : 2;
      } else if (cmd.type === 'PRAY') phaseTier = 2;
      else if (cmd.type === 'TURN') phaseTier = 1;
      else if (cmd.type === 'GUARD') phaseTier = 2;

      actionQueue.push({ sourceType: 'HERO', heroIndex: index, hero: hero, command: cmd, phaseTier: phaseTier });
    });

    state.combat.enemies.forEach(mob => {
      if (state.combat.round === 1 && state.combat.surpriseRound) return;
      if (mob.hp <= 0 || mob.fled || mob.surrendered || (mob.asleepRounds || 0) > 0 || (mob.turnedRounds || 0) > 0) return;
      const consciousParty = state.party.filter(p => p.hp > 0);
      if (consciousParty.length === 0) return;

      const targetHero = consciousParty[Math.floor(Math.random() * consciousParty.length)];
      let phaseTier = mob.actionPhase === 'FAST' ? 1 : mob.actionPhase === 'SLOW' ? 3 : 2;

      actionQueue.push({ sourceType: 'MONSTER', mob: mob, targetHero: targetHero, targetHeroIndex: state.party.indexOf(targetHero), phaseTier: phaseTier });
    });

    actionQueue.sort((a, b) => a.phaseTier - b.phaseTier);

    for (const act of actionQueue) {
      const livingMobs = state.combat.enemies.filter(e => simMobHp[e.instanceId] > 0 && !e.fled && !e.surrendered);
      if (livingMobs.length === 0) break;

      if (act.sourceType === 'HERO') {
        const { hero, heroIndex, command } = act;
        if (simHeroHp[heroIndex] <= 0) continue;

        if (command.type === 'GUARD') {
          const gIdx = command.guardTargetIndex;
          const gName = (gIdx != null && state.party[gIdx]) ? state.party[gIdx].name : 'an ally';
          if (gIdx === heroIndex) {
            combatEvents.push({ eventType: 'GUARD', sourceName: hero.name, logText: `🛡️ ${hero.name} raises a guard (+1 AC this round).`, logType: 'info' });
          } else {
            combatEvents.push({ eventType: 'GUARD', sourceName: hero.name, logText: `🛡️ ${hero.name} steps in to shield ${gName}!`, logType: 'info' });
          }
          continue;
        }

        let target = livingMobs.find(e => e.instanceId === command.targetInstanceId) || livingMobs[0];
        if (!target) break;

        if (command.type === 'BACKSTAB' && hero.isStealth) {
          hero.isStealth = false;
          CombatActions.resolveHeroBackstab(state, hero, target, simMobHp, combatEvents);
        } else if (command.type === 'SHOOT') {
          CombatActions.resolveHeroRanged(state, hero, heroIndex, target, simMobHp, combatEvents);
        } else if (command.type === 'ATTACK' || !command.type) {
          CombatActions.resolveHeroMelee(state, hero, target, simMobHp, combatEvents);
        } else if (command.type === 'CAST') {
          CombatActions.resolveHeroCast(state, hero, heroIndex, command, target, livingMobs, simMobHp, simHeroHp, castInterrupted, combatEvents);
        } else if (command.type === 'PRAY') {
          CombatActions.resolveHeroPray(state, hero, heroIndex, command, target, livingMobs, simMobHp, simHeroHp, combatEvents);
        } else if (command.type === 'TURN') {
          CombatActions.resolveHeroTurnUndead(state, hero, livingMobs, simMobHp, combatEvents);
        }

        CombatEngine.checkMorale(state, simMobHp, simHeroHp, combatEvents);

      } else if (act.sourceType === 'MONSTER') {
        const { mob, targetHero, targetHeroIndex } = act;
        CombatActions.resolveMonsterAttack(
          state,
          mob,
          targetHero,
          targetHeroIndex,
          simMobHp,
          simHeroHp,
          guardedBy,
          selfGuardAc,
          castInterrupted,
          combatEvents
        );
      }
    }

    const activeThreats = state.combat.enemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0 && !e.fled && !e.surrendered);
    const livingHeroes = Object.values(simHeroHp).filter(hp => hp > 0).length;
    let victory = false, partyWiped = false, totalXp = 0;
    
    if (activeThreats.length === 0) {
      victory = true;
      const currentEnc = (state.spec.encounters || []).find(e => e.id === state.combat.encounterId);
      const mobXpSum = state.combat.enemies.reduce((sum, e) => sum + (e.xpReward || 0), 0);
      totalXp = (currentEnc && currentEnc.onVictoryXp !== undefined) ? currentEnc.onVictoryXp : mobXpSum;
      combatEvents.push({ eventType: 'VICTORY', logText: `🏆 COMBAT VICTORIOUS! Acquired +${totalXp} XP!`, logType: 'success' });
    } else if (livingHeroes === 0) {
      partyWiped = true;
      combatEvents.push({ eventType: 'PARTY_WIPED', logText: `💀 The last of the company falls. The flooded dark claims its due.`, logType: 'danger' });
    }

    state.combat.queuedCommands = {};

    return { events: combatEvents, finalMobHp: simMobHp, finalHeroHp: simHeroHp, victory, partyWiped, totalXp };
  }

  /**
   * Commits computed round results to the persistent state and advances round timers.
   */
  static commitCombatRoundResults(state, finalMobHp, finalHeroHp, victory, totalXp) {
    state.combat.enemies.forEach(e => {
      if (finalMobHp[e.instanceId] !== undefined) e.hp = finalMobHp[e.instanceId];
      if (e.hp <= 0) {
        e.surrendered = false;
        e.slain = true;
        e.moraleStatus = 'DEAD';
      }
      if ((e.asleepRounds || 0) > 0) e.asleepRounds = Math.max(0, e.asleepRounds - 1);
      if ((e.turnedRounds || 0) > 0) e.turnedRounds = Math.max(0, e.turnedRounds - 1);
      if ((e.debuffRounds || 0) > 0) {
        e.debuffRounds -= 1;
        if (e.debuffRounds <= 0) {
          e.debuffType = null;
          e.debuffAmount = 0;
        }
      }
    });
    
    state.party.forEach((h, idx) => {
      if (finalHeroHp[idx] !== undefined) h.hp = finalHeroHp[idx];
      if ((h.tempAcRounds || 0) > 0) {
        h.tempAcRounds -= 1;
        if (h.tempAcRounds <= 0) {
          h.tempAcBonus = 0;
          h.tempAcSource = null;
        }
      }
      if ((h.tempAttackRounds || 0) > 0) {
        h.tempAttackRounds -= 1;
        if (h.tempAttackRounds <= 0) h.tempAttackBonus = 0;
      }
    });

    state.combat.round += 1;
    if (victory) {
      state.combat.active = false;
      const surrenderedMob = state.combat.enemies.find(e => e.surrendered && e.hp > 0 && !e.fled && !e.slain);
      state.surrenderedEnemy = surrenderedMob || null;
      if (totalXp > 0) {
        state.awardQuestXP(totalXp);
      }
    }
  }

  /**
   * Evaluates psychological morale triggers for combatants during combat.
   */
  static checkMorale(state, simMobHp, simHeroHp, combatEvents) {
    if (!state.combat || !state.combat.active || !state.combat.enemies) return;

    const initialEnemies = state.combat.enemies;

    // Clean up any enemy that died so their surrender/status is properly cleared
    for (const e of initialEnemies) {
      if ((simMobHp[e.instanceId] ?? e.hp) <= 0) {
        e.surrendered = false;
        e.slain = true;
        e.moraleStatus = 'DEAD';
      }
    }

    const aliveEnemies = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0 && !e.fled && !e.surrendered);
    if (aliveEnemies.length === 0) return;

    const deadCount = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) <= 0).length;
    const squadTriggers = [];

    // 1. First Blood (first casualty in a squad of 2+)
    if (!state.combat.moraleCheckedFirstBlood && deadCount >= 1 && initialEnemies.length > 1) {
      state.combat.moraleCheckedFirstBlood = true;
      squadTriggers.push('FIRST_BLOOD');
    }

    // 2. Squad casualties (50% or fewer remaining in a squad of 2+)
    if (!state.combat.moraleCheckedHalfSquad && initialEnemies.length > 1 && aliveEnemies.length <= Math.floor(initialEnemies.length / 2)) {
      state.combat.moraleCheckedHalfSquad = true;
      squadTriggers.push('HALF_SQUAD');
    }

    // 3. Leader slain
    const leaderDead = initialEnemies.some(e => e.isLeader && (simMobHp[e.instanceId] ?? e.hp) <= 0);
    if (!state.combat.moraleCheckedLeader && leaderDead) {
      state.combat.moraleCheckedLeader = true;
      squadTriggers.push('LEADER_SLAIN');
    }

    // 4. Individual Critical Wounds check (HP <= 25%, only if not already tested)
    for (const mob of aliveEnemies) {
      const curHp = simMobHp[mob.instanceId] ?? mob.hp;
      if (!mob.moraleCheckedBloodied && curHp <= Math.ceil(mob.maxHp * 0.25) && curHp > 0) {
        mob.moraleCheckedBloodied = true;
        CombatEngine.resolveSingleMonsterMorale(state, mob, 'CRITICAL_WOUNDS', simMobHp, simHeroHp, combatEvents);
      }
    }

    // If a squad-wide trigger fired, test the squad discipline together
    if (squadTriggers.length > 0) {
      const triggerReason = squadTriggers[0];
      CombatEngine.resolveSquadMorale(state, aliveEnemies, triggerReason, simMobHp, simHeroHp, combatEvents);
    }
  }

  /**
   * Resolves a squad-wide discipline morale check.
   */
  static resolveSquadMorale(state, aliveEnemies, triggerReason, simMobHp, simHeroHp, combatEvents) {
    if (!aliveEnemies || aliveEnemies.length === 0) return;

    // Filter out entities immune to morale (undead or fearless entities)
    const mortalEnemies = aliveEnemies.filter(e => e.creatureType !== 'undead' && (e.moraleThreshold || 0) < 100 && !e.fled && !e.surrendered);
    if (mortalEnemies.length === 0) return;

    // Use highest discipline / leader morale among the squad
    const leaderMob = mortalEnemies.find(e => e.isLeader) || mortalEnemies[0];
    const rawThreshold = leaderMob.moraleThreshold != null ? leaderMob.moraleThreshold : 50;
    // Map raw threshold to authentic AD&D hold percentage (base 55-90%)
    const baseThreshold = Math.max(50, Math.min(95, rawThreshold + 10));

    let modifier = 0;
    const initialEnemies = state.combat.enemies || [];
    const leaderDead = initialEnemies.some(e => e.isLeader && (simMobHp[e.instanceId] ?? e.hp) <= 0);
    if (leaderDead) modifier -= 15;
    if (triggerReason === 'HALF_SQUAD') modifier -= 10;

    // Emboldened if any hero is incapacitated (+15)
    const partyWeakened = state.party.some((h, idx) => (simHeroHp[idx] ?? h.hp) <= 0);
    if (partyWeakened) modifier += 15;

    const effectiveTarget = Math.max(15, Math.min(95, baseThreshold + modifier));
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= effectiveTarget) {
      combatEvents.push({
        eventType: 'MORALE_HOLD',
        sourceName: leaderMob.name,
        targetInstanceId: leaderMob.instanceId,
        logText: `🛡️ SQUAD DISCIPLINE HOLDS: The enemy ranks rally and refuse to break! [d100=${roll} vs Target ${effectiveTarget}%]`,
        logType: 'muted'
      });
    } else {
      // Squad breaks!
      // When multiple enemies are alive, breaking enemies ROUT / FLEE. They do NOT surrender in the middle of active squad fighting.
      let routCount = 0;
      for (const mob of mortalEnemies) {
        mob.fled = true;
        mob.moraleStatus = 'FLED';
        routCount++;
        combatEvents.push({
          eventType: 'MORALE_FLEE',
          cueBadge: '💨 ROUTED',
          cueClass: 'dodge',
          targetInstanceId: mob.instanceId,
          sourceName: mob.name,
          logText: `💨 SQUAD ROUT: Panic overtakes ${mob.name}! They throw down their weapons and flee down the hall! [d100=${roll} > ${effectiveTarget}%]`,
          logType: 'warning'
        });
      }
      if (routCount > 0) {
        state.explorationTurnCounter = (state.explorationTurnCounter || 0) + 1;
        combatEvents.push({
          eventType: 'HAZARD_ALERT',
          logText: `⚠️ Panic echoes down the corridors—wandering patrols hear the commotion!`,
          logType: 'danger'
        });
      }
    }
  }

  /**
   * Resolves an individual morale test against a monster's threshold with situational modifiers.
   */
  static resolveSingleMonsterMorale(state, mob, triggerReason, simMobHp, simHeroHp, combatEvents) {
    // Mindless undead or fearless entities with moraleThreshold >= 100 never break
    if (mob.creatureType === 'undead' || (mob.moraleThreshold || 0) >= 100) {
      return;
    }
    if (mob.fled || mob.surrendered) return;

    const rawThreshold = mob.moraleThreshold != null ? mob.moraleThreshold : 50;
    const baseThreshold = Math.max(50, Math.min(95, rawThreshold + 10));
    let modifier = 0;

    const initialEnemies = state.combat.enemies || [];
    const leaderDead = initialEnemies.some(e => e.isLeader && (simMobHp[e.instanceId] ?? e.hp) <= 0);
    if (leaderDead) modifier -= 15;

    const aliveEnemies = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0 && !e.fled && !e.surrendered);
    if (aliveEnemies.length <= 1 && initialEnemies.length > 1) modifier -= 10;

    const curHp = simMobHp[mob.instanceId] ?? mob.hp;
    if (curHp <= Math.ceil(mob.maxHp * 0.25)) modifier -= 10;

    // Emboldened if any hero is incapacitated (+15 morale)
    const partyWeakened = state.party.some((h, idx) => (simHeroHp[idx] ?? h.hp) <= 0);
    if (partyWeakened) modifier += 15;

    const effectiveTarget = Math.max(15, Math.min(95, baseThreshold + modifier));
    const roll = Math.floor(Math.random() * 100) + 1;

    if (roll <= effectiveTarget) {
      combatEvents.push({
        eventType: 'MORALE_HOLD',
        sourceName: mob.name,
        targetInstanceId: mob.instanceId,
        logText: `🛡️ MORALE HOLDS: ${mob.name} refuses to break! [d100=${roll} vs Target ${effectiveTarget}%]`,
        logType: 'muted'
      });
    } else {
      // Morale breaks!
      if (mob.creatureType === 'beast') {
        mob.fled = true;
        mob.moraleStatus = 'FLED';
        state.explorationTurnCounter = (state.explorationTurnCounter || 0) + 1;
        combatEvents.push({
          eventType: 'MORALE_FLEE',
          cueBadge: '💨 FLEES',
          cueClass: 'dodge',
          targetInstanceId: mob.instanceId,
          sourceName: mob.name,
          logText: `💨 BEAST FLEES: Howling in terror, ${mob.name} retreats into the dark crevices! [d100=${roll} > ${effectiveTarget}%]`,
          logType: 'warning'
        });
        combatEvents.push({
          eventType: 'HAZARD_ALERT',
          logText: `⚠️ The echoing screeches of the fleeing beast alert the dungeon corridors!`,
          logType: 'danger'
        });
      } else {
        // Humanoids:
        // RULE 1: If other allies are still actively fighting (aliveEnemies.length > 1), NEVER surrender!
        // A broken combatant panics and routs/flees into the corridors.
        if (aliveEnemies.length > 1) {
          mob.fled = true;
          mob.moraleStatus = 'FLED';
          state.explorationTurnCounter = (state.explorationTurnCounter || 0) + 1;
          combatEvents.push({
            eventType: 'MORALE_FLEE',
            cueBadge: '💨 ROUTED',
            cueClass: 'dodge',
            targetInstanceId: mob.instanceId,
            sourceName: mob.name,
            logText: `💨 ROUT: Panic overtakes ${mob.name}! They throw down their shield and bolt down the hall! [d100=${roll} > ${effectiveTarget}%]`,
            logType: 'warning'
          });
          combatEvents.push({
            eventType: 'HAZARD_ALERT',
            logText: `⚠️ Panic echoes down the corridors—wandering patrols hear the commotion!`,
            logType: 'danger'
          });
        } else {
          // RULE 2: The monster is the LAST remaining combatant facing the party (aliveEnemies.length <= 1).
          // Check if cornered against a wall, door, or portcullis:
          const isCornered = (typeof state.isMonsterCornered === 'function')
            ? state.isMonsterCornered()
            : state.isFacingClosedObstacle();

          // If cornered with nowhere to run, surrender is guaranteed (100%).
          // In an open corridor, 30% chance to yield if critically wounded, 15% otherwise; remainder rout and flee!
          const yieldChance = isCornered ? 100 : (curHp <= Math.ceil(mob.maxHp * 0.25) ? 30 : 15);
          const yieldRoll = Math.floor(Math.random() * 100) + 1;

          if (yieldRoll <= yieldChance) {
            mob.surrendered = true;
            mob.moraleStatus = 'SURRENDERED';
            mob.intimidateAttempted = false;
            mob.stealAttempted = false;
            const contextText = isCornered
              ? `Backed against the wall with no escape`
              : `Seeing their company vanquished and outmatched`;
            combatEvents.push({
              eventType: 'MORALE_SURRENDER',
              cueBadge: '🏳️ SURRENDER',
              cueClass: 'shield',
              targetInstanceId: mob.instanceId,
              sourceName: mob.name,
              logText: `🏳️ YIELDS: ${contextText}, ${mob.name} drops their weapon to the flagstones and begs for quarter!`,
              logType: 'success'
            });
          } else {
            mob.fled = true;
            mob.moraleStatus = 'FLED';
            state.explorationTurnCounter = (state.explorationTurnCounter || 0) + 1;
            combatEvents.push({
              eventType: 'MORALE_FLEE',
              cueBadge: '💨 ROUTED',
              cueClass: 'dodge',
              targetInstanceId: mob.instanceId,
              sourceName: mob.name,
              logText: `💨 ROUT: Seeing their company fall, ${mob.name} turns on their heel and bolts into the shadows of the corridor!`,
              logType: 'warning'
            });
            combatEvents.push({
              eventType: 'HAZARD_ALERT',
              logText: `⚠️ Footsteps fade into the darkness—wandering patrols hear the commotion!`,
              logType: 'danger'
            });
          }
        }
      }
    }
  }

  /**
   * Attempts an intimidation/interrogation check on a surrendered captive.
   */
  static attemptIntimidate(state, enemy) {
    const fighter = state.party.find(p => (p.skills?.intimidate || p.classKey === 'fighter') && p.hp > 0);
    if (!fighter) {
      return { success: false, passed: false, log: "No conscious fighter to intimidate the captive." };
    }
    if (!enemy) {
      return { success: false, passed: false, log: "No captive present." };
    }
    if (enemy.intimidateAttempted) {
      return { success: false, passed: false, log: `${enemy.name} has already faced your interrogation.` };
    }

    enemy.intimidateAttempted = true;
    enemy.interrogated = true;

    // AD&D 2e Ability Check: d20 <= skill target (natural 20 fails)
    const target = state.getSkillTarget(fighter, 'intimidate');
    const roll = Math.floor(Math.random() * 20) + 1;
    const passed = (roll <= target) && (roll !== 20);

    if (!passed) {
      return {
        success: false,
        passed: false,
        roll,
        target,
        fighterName: fighter.name,
        enemyName: enemy.name,
        log: `[d20=${roll} vs Target ${target}] Intimidate failed: The captive says nothing, glaring at ${fighter.name} with cold, stubborn defiance.`
      };
    }

    let revealedTrap = null;
    if (enemy.revealTrapCoords && Array.isArray(enemy.revealTrapCoords)) {
      const key = `${enemy.revealTrapCoords[0]},${enemy.revealTrapCoords[1]}`;
      state.detectedTraps.add(key);
      const tileDef = state.spec.map && state.spec.map[enemy.revealTrapCoords[1]] ? state.spec.legend[state.spec.map[enemy.revealTrapCoords[1]][enemy.revealTrapCoords[0]]] : null;
      revealedTrap = tileDef && tileDef.trap ? tileDef.trap : { name: "Concealed Mechanism" };
    }

    state.awardQuestXP(75);
    const infoText = enemy.info || "Mercy! The dungeon corridors ahead are rigged with lethal traps and roving sentries—advance with extreme caution!";

    return {
      success: true,
      passed: true,
      roll,
      target,
      fighterName: fighter.name,
      enemyName: enemy.name,
      revealedTrap,
      log: `[d20=${roll} vs Target ${target}] With blade drawn and chilling focus, ${fighter.name} corners ${enemy.name}. Terrified, the captive babbles: "${infoText}" (+75 XP)`
    };
  }

  /**
   * Attempts a pickpocket check on a surrendered captive.
   */
  static attemptStealSurrendered(state, enemy) {
    const thief = state.party.find(p => (p.skills?.pick_pockets || p.classKey === 'thief') && p.hp > 0);
    if (!thief) {
      return { success: false, passed: false, reason: "No conscious thief to pickpocket the captive." };
    }
    if (!enemy) {
      return { success: false, passed: false, reason: "No captive present." };
    }
    if (enemy.stealAttempted) {
      return { success: false, passed: false, reason: `${enemy.name}'s pockets have already been searched.` };
    }

    enemy.stealAttempted = true;

    // AD&D 2e Pick Pockets check: d100 <= chance %
    const chance = state.getSkillTarget(thief, 'pick_pockets');
    const roll = Math.floor(Math.random() * 100) + 1;
    const passed = roll <= chance;

    if (!passed) {
      return {
        success: false,
        passed: false,
        roll,
        chance,
        thiefName: thief.name,
        enemyName: enemy.name,
        log: `[d100=${roll} vs Target ${chance}%] Pickpocket failed: ${thief.name} searches ${enemy.name}'s garments, finds nothing, and assumes the captive has nothing in their pockets.`
      };
    }

    if (!enemy.loot || enemy.looted) {
      return {
        success: true,
        passed: true,
        roll,
        chance,
        thiefName: thief.name,
        enemyName: enemy.name,
        log: `[d100=${roll} vs Target ${chance}%] Success! ${thief.name} deftly checks ${enemy.name}'s pockets, but confirms the captive is carrying no valuables.`
      };
    }

    enemy.looted = true;
    const stolenItem = enemy.loot;
    let goldAcquired = 0;

    if (stolenItem.gold) {
      state.addPartyItem('Gold Pieces', stolenItem.gold);
      goldAcquired = stolenItem.gold;
    }

    if (stolenItem.name) {
      state.addPartyItem(stolenItem.name, 1);
    }

    state.awardQuestXP(50);
    const lootDesc = goldAcquired > 0 && stolenItem.name ? `${stolenItem.name} and ${goldAcquired} gold pieces` : goldAcquired > 0 ? `${goldAcquired} gold pieces` : stolenItem.name;

    return {
      success: true,
      passed: true,
      roll,
      chance,
      thiefName: thief.name,
      enemyName: enemy.name,
      stolenItem,
      goldAcquired,
      log: `[d100=${roll} vs Target ${chance}%] Success! ${thief.name} expertly loots ${enemy.name}'s pockets, acquiring ${lootDesc}! (+50 XP)`
    };
  }

  /**
   * Releases or scares off a surrendered enemy, advancing exploration turns and creating commotion.
   */
  static fleeSurrenderedEnemy(state) {
    if (!state.surrenderedEnemy) return null;
    const captive = state.surrenderedEnemy;
    captive.fled = true;
    captive.surrendered = false;
    captive.moraleStatus = 'FLED';
    state.surrenderedEnemy = null;

    // Flee mechanics: 1 exploration turn passes, commotion may alert dungeon patrols
    const turnResult = state.advanceExplorationTurn(10, "Captive Flees", true);

    return {
      captive,
      turnResult,
      log: `💨 FLEES: Seeing the party advance, ${captive.name} scrambles to their feet and runs for their life into the dark passages!`,
      hazardLog: `⚠️ Panic echoes down the corridors—wandering patrols hear the commotion!`
    };
  }

  /**
   * Strikes down a surrendered captive, executing them and gathering their loot.
   */
  static strikeSurrenderedEnemy(state) {
    if (!state.surrenderedEnemy) return null;
    const captive = state.surrenderedEnemy;
    captive.hp = 0;
    captive.slain = true;
    captive.surrendered = false;
    state.surrenderedEnemy = null;

    let lootedItem = null;
    let goldAcquired = 0;
    if (captive.loot && !captive.looted) {
      captive.looted = true;
      lootedItem = captive.loot;
      if (lootedItem.gold) {
        state.addPartyItem('Gold Pieces', lootedItem.gold);
        goldAcquired = lootedItem.gold;
      }
      if (lootedItem.name) {
        state.addPartyItem(lootedItem.name, 1);
      }
    }

    return {
      captive,
      lootedItem,
      goldAcquired,
      log: `🗡️ The party strikes down the surrendered ${captive.name}, finishing the captive where they kneel.`
    };
  }

  /**
   * Attempts a tactical disengagement / party retreat from the active combat encounter.
   * Resolves agility checks, enemy parting strikes of opportunity, and party repositioning.
   */
  static attemptPartyRetreat(state) {
    if (!state.combat || !state.combat.active) return { success: false, events: [] };

    const livingHeroes = (state.party || []).filter(h => h.hp > 0);
    if (livingHeroes.length === 0) {
      return { success: false, partyWiped: true, events: [{ logText: "No conscious party members can move to retreat!", logType: "danger" }] };
    }

    const livingEnemies = (state.combat.enemies || []).filter(e => e.hp > 0 && !e.fled && !e.surrendered);
    if (livingEnemies.length === 0) {
      state.combat.active = false;
      return { success: true, victory: true, events: [{ logText: "No active foes remain to oppose your movement.", logType: "info" }] };
    }

    // 1. Calculate retreat success rate based on AD&D agility, party class makeup, stealth, and encumbrance
    let baseChance = 60;

    // Average dexterity modifier (+3% per point > 10, -3% per point < 10)
    const avgDex = livingHeroes.reduce((acc, h) => acc + (h.attributes?.dexterity || 10), 0) / livingHeroes.length;
    const dexMod = Math.round((avgDex - 10) * 3);
    baseChance += dexMod;

    // Conscious Thief bonus (+10%, +25% if active stealth smoke/distraction)
    const thief = livingHeroes.find(h => h.classKey === 'thief');
    if (thief) {
      baseChance += thief.isStealth ? 25 : 10;
    }

    // Conscious Mage bonus if wards / illusions / shields active
    const mage = livingHeroes.find(h => h.classKey === 'mage');
    if (mage && (mage.tempAcBonus > 0 || mage.isStealth)) {
      baseChance += 10;
    }

    // Encumbrance penalty
    const partyTier = state.getPartyTier ? state.getPartyTier() : { tier: 'unencumbered' };
    if (partyTier.tier === 'heavy' || partyTier.tier === 'severe') {
      baseChance -= 20;
    } else if (partyTier.tier === 'encumbered') {
      baseChance -= 10;
    }

    // Clamp chance between 15% and 90%
    const escapeChance = Math.min(90, Math.max(15, baseChance));
    const roll = Math.floor(Math.random() * 100) + 1;
    const escapeSuccess = roll <= escapeChance;

    const events = [];
    events.push({
      eventType: 'RETREAT_ATTEMPT',
      roll,
      target: escapeChance,
      success: escapeSuccess,
      logText: `🏃 RETREAT: The party attempts a tactical withdrawal! (Agility Check: d100 Roll ${roll} vs Target ${escapeChance}%) -> ${escapeSuccess ? 'SUCCESS' : 'BLOCKED'}`,
      logType: escapeSuccess ? 'success' : 'warning',
      cueBadge: escapeSuccess ? '🏃 ESCAPED' : '⚠️ PINNED',
      cueClass: escapeSuccess ? 'hero' : 'danger'
    });

    // 2. Enemy Parting Strikes / Attacks of Opportunity
    const finalHeroHp = state.party.map(h => h.hp);
    const numPartingAttacks = escapeSuccess ? Math.min(livingEnemies.length, 2) : Math.min(livingEnemies.length, 4);

    for (let i = 0; i < numPartingAttacks; i++) {
      const enemy = livingEnemies[i];
      if (!enemy || enemy.hp <= 0) continue;

      const livingIndices = state.party.map((h, idx) => ({ h, idx, hp: finalHeroHp[idx] })).filter(item => item.hp > 0);
      if (livingIndices.length === 0) break;

      const targetHeroObj = livingIndices[Math.floor(Math.random() * livingIndices.length)];
      const targetHero = targetHeroObj.h;
      const targetIdx = targetHeroObj.idx;

      const toHitMod = escapeSuccess ? -2 : 0;
      const attackRoll = Math.floor(Math.random() * 20) + 1;
      const effectiveThaco = enemy.thaco != null ? enemy.thaco : 19;
      const targetAC = (targetHero.armorClass || 10) - (targetHero.tempAcBonus || 0);
      const neededToHit = effectiveThaco - targetAC;

      const isCrit = attackRoll === 20;
      const isFumble = attackRoll === 1;
      const isHit = !isFumble && (isCrit || (attackRoll + toHitMod >= neededToHit));

      if (isHit) {
        const rawDmg = CombatCalculator.rollDice(enemy.damage, 4);
        const actualDmg = escapeSuccess ? Math.max(1, Math.floor(rawDmg * 0.75)) : rawDmg;
        finalHeroHp[targetIdx] -= actualDmg;
        const isInc = finalHeroHp[targetIdx] <= 0 && finalHeroHp[targetIdx] > -10;
        const isDead = finalHeroHp[targetIdx] <= -10;

        events.push({
          eventType: 'HERO_HIT',
          attackerName: enemy.name,
          attackerSpec: enemy,
          targetHeroIndex: targetIdx,
          targetHeroName: targetHero.name,
          damage: actualDmg,
          isInc,
          isDead,
          cueBadge: `-${actualDmg}`,
          cueClass: 'danger',
          logText: `⚔️ Parting Strike: ${enemy.name} lashes at ${targetHero.name} as they retreat for ${actualDmg} damage!${isDead ? ' (DEAD)' : isInc ? ' (INCAPACITATED)' : ''}`,
          logType: isDead || isInc ? 'danger' : 'warning'
        });
      } else {
        events.push({
          eventType: 'HERO_MISS',
          attackerName: enemy.name,
          targetHeroName: targetHero.name,
          cueBadge: 'DODGE',
          cueClass: 'hero',
          logText: `🛡️ ${targetHero.name} dodges a parting strike from ${enemy.name}!`,
          logType: 'muted'
        });
      }
    }

    const partyAllWiped = finalHeroHp.every(hp => hp <= 0);

    return {
      success: escapeSuccess && !partyAllWiped,
      partyWiped: partyAllWiped,
      finalHeroHp,
      events
    };
  }
}
