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
    state.combat = {
      active: true,
      round: 1,
      encounterId: encounterId,
      enemies: spawnedEnemies,
      queuedCommands: {},
      previousCommands: {},
      channelingCast: null,
      surpriseRound: !isDarkAmbush && !!encSpec.scouted,
      alertedRound: isDarkAmbush || !!encSpec.alerted,
      moraleCheckedFirstBlood: false,
      moraleCheckedHalfSquad: false,
      moraleCheckedLeader: false
    };

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
      const surrenderedMob = state.combat.enemies.find(e => e.surrendered);
      if (surrenderedMob) {
        state.surrenderedEnemy = surrenderedMob;
      }
      const currentEnc = (state.spec.encounters || []).find(e => e.id === state.combat.encounterId);
      const mobXpSum = state.combat.enemies.reduce((sum, e) => sum + (e.xpReward || 0), 0);
      totalXp = Math.max(currentEnc?.onVictoryXp || 0, mobXpSum);
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
      const surrenderedMob = state.combat.enemies.find(e => e.surrendered);
      if (surrenderedMob) {
        state.surrenderedEnemy = surrenderedMob;
      }
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
    const aliveEnemies = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0 && !e.fled && !e.surrendered);
    const deadCount = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) <= 0).length;

    const squadTriggers = [];

    // 1. First Blood
    if (!state.combat.moraleCheckedFirstBlood && deadCount >= 1 && initialEnemies.length > 1) {
      state.combat.moraleCheckedFirstBlood = true;
      squadTriggers.push('FIRST_BLOOD');
    }

    // 2. Squad casualties (50% or less remaining)
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

    // 4. Individual Bloodied checks (HP <= 35%)
    for (const mob of aliveEnemies) {
      const curHp = simMobHp[mob.instanceId] ?? mob.hp;
      if (!mob.moraleCheckedBloodied && curHp <= Math.ceil(mob.maxHp * 0.35) && curHp > 0) {
        mob.moraleCheckedBloodied = true;
        CombatEngine.resolveSingleMonsterMorale(state, mob, 'BLOODIED', simMobHp, simHeroHp, combatEvents);
      }
    }

    // If a squad-wide trigger fired, test all active living non-broken monsters
    if (squadTriggers.length > 0) {
      const triggerReason = squadTriggers[0];
      for (const mob of aliveEnemies) {
        if (mob.fled || mob.surrendered) continue;
        CombatEngine.resolveSingleMonsterMorale(state, mob, triggerReason, simMobHp, simHeroHp, combatEvents);
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

    const baseThreshold = mob.moraleThreshold || 50;
    let modifier = 0;

    const initialEnemies = state.combat.enemies || [];
    const leaderDead = initialEnemies.some(e => e.isLeader && (simMobHp[e.instanceId] ?? e.hp) <= 0);
    if (leaderDead) modifier -= 15;

    const aliveEnemies = initialEnemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0 && !e.fled && !e.surrendered);
    if (aliveEnemies.length <= 1 && initialEnemies.length > 1) modifier -= 10;

    const curHp = simMobHp[mob.instanceId] ?? mob.hp;
    if (curHp <= Math.ceil(mob.maxHp * 0.35)) modifier -= 10;

    // Emboldened if any hero is incapacitated (+10 morale)
    const partyWeakened = state.party.some((h, idx) => (simHeroHp[idx] ?? h.hp) <= 0);
    if (partyWeakened) modifier += 10;

    const effectiveTarget = Math.max(10, Math.min(95, baseThreshold + modifier));
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
        // Humanoids surrender if cornered, alone, or critically wounded; otherwise rout
        const isCornered = state.isFacingClosedObstacle();
        const isAlone = aliveEnemies.length <= 1;
        const isWounded = curHp <= Math.ceil(mob.maxHp * 0.35);

        if (isCornered || isAlone || isWounded) {
          mob.surrendered = true;
          mob.moraleStatus = 'SURRENDERED';
          mob.intimidateAttempted = false;
          mob.stealAttempted = false;
          combatEvents.push({
            eventType: 'MORALE_SURRENDER',
            cueBadge: '🏳️ SURRENDER',
            cueClass: 'shield',
            targetInstanceId: mob.instanceId,
            sourceName: mob.name,
            logText: `🏳️ YIELDS: Trembling and outmatched, ${mob.name} drops their weapon to the flagstones and begs for quarter! [d100=${roll} > ${effectiveTarget}%]`,
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
            logText: `💨 ROUT: Panic overtakes ${mob.name}! They throw down their shield and bolt down the hall screaming in terror! [d100=${roll} > ${effectiveTarget}%]`,
            logType: 'warning'
          });
          combatEvents.push({
            eventType: 'HAZARD_ALERT',
            logText: `⚠️ Panic echoes down the corridors—wandering patrols hear the commotion!`,
            logType: 'danger'
          });
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
}
