import { ProgressionManager } from '../characters/progression_manager.js';
import { EncumbranceManager } from '../items/encumbrance_manager.js';

/**
 * ExplorationManager handles dungeon exploration turns, light/torch timers,
 * wandering monster patrol checks, rogue tradecraft (pickpocketing, stealth,
 * finding & disarming traps, scouting, hearing noise, sneaking past encounters, lockpicking),
 * trap triggers & saving throws, obstacle interactions (doors, chests, props, bash, read magic),
 * and spatial movement & rotation.
 */
export class ExplorationManager {
  /**
   * Advances exploration clock in 10-minute dungeon turns, updates light/torch durations,
   * and rolls for wandering monster patrols according to AD&D 2e rules.
   */
  static advanceExplorationTurn(state, minutes = 10, sourceAction = "Exploration", isLoud = false) {
    // 1. Advance torch and light spell duration counters
    const msToDeduct = minutes * 60 * 1000;
    const now = Date.now();
    if (state.torchLitUntil > 0) {
      state.torchLitUntil = Math.max(0, state.torchLitUntil - msToDeduct);
      if (state.torchLitUntil <= now) {
        state.torchLitUntil = 0;
        state.addLog(`🔥 The party's torch flickers violently and burns out! Darkness closes in.`, "warning");
      }
    }
    if (state.lightSpellUntil > 0) {
      state.lightSpellUntil = Math.max(0, state.lightSpellUntil - msToDeduct);
      if (state.lightSpellUntil <= now) {
        state.lightSpellUntil = 0;
        state.addLog(`✨ The radiant glow of the Light spell fades away.`, "info");
      }
    }

    // 2. Advance hero buff/debuff durations (in AD&D 2e: 1 round = 1 minute)
    if (state.party && Array.isArray(state.party)) {
      state.party.forEach(hero => {
        if (!hero || hero.hp <= -10) return;

        // AC Buffs (Shield of Faith, Sanctuary, etc.)
        if (hero.tempAcRounds && hero.tempAcRounds > 0) {
          hero.tempAcRounds = Math.max(0, hero.tempAcRounds - minutes);
          if (hero.tempAcRounds === 0) {
            hero.tempAcBonus = 0;
            const src = hero.tempAcSource || 'ward';
            hero.tempAcSource = null;
            state.addLog(`🛡️ ${hero.name}'s protective ${src} has expired.`, "muted");
          }
        }

        // Attack Buffs (Bless, Haste, Holy Water, Potion of Giant Strength, etc.)
        if (hero.tempAttackRounds && hero.tempAttackRounds > 0) {
          hero.tempAttackRounds = Math.max(0, hero.tempAttackRounds - minutes);
          if (hero.tempAttackRounds === 0) {
            hero.tempAttackBonus = 0;
            hero.tempDamageBonus = 0;
            const src = hero.tempAttackSource || 'combat blessing';
            hero.tempAttackSource = null;
            state.addLog(`✨ The ${src} enhancing ${hero.name} has faded.`, "muted");
          }
        }
      });
    }

    // 3. Track total game exploration minutes
    state.totalExplorationMinutes = (state.totalExplorationMinutes || 0) + minutes;

    // 4. Wandering monster check: only in exploration areas (dungeon/wilderness), never in town
    const zone = state.getCurrentZone ? state.getCurrentZone() : (state.isWildernessTile() ? 'wilderness' : 'dungeon');
    if (zone === 'town' || state.combat.active) {
      return { minutes, wanderingSpawned: false, zone };
    }

    // Accumulate quiet actions towards a 30-minute interval check
    state.explorationTurnCounter = (state.explorationTurnCounter || 0) + (minutes / 10);
    
    // Check wandering monsters if action was loud (bashing) OR if 3 turns (30 mins) have accumulated
    const shouldCheck = isLoud || state.explorationTurnCounter >= 3;
    if (!shouldCheck) {
      return { minutes, wanderingSpawned: false, zone, turnsAccumulated: state.explorationTurnCounter };
    }

    // Reset accumulator on check
    state.explorationTurnCounter = 0;

    // 1-in-6 chance on a d6 check (or 2-in-6 if loud bashing)
    const d6Roll = Math.floor(Math.random() * 6) + 1;
    const triggerThreshold = isLoud ? 2 : 1;
    let wanderingSpawned = false;
    let isAmbush = false;
    let chosenPatrolName = null;

    if (d6Roll <= triggerThreshold) {
      const areaKey = `${zone}_${state.player.x},${state.player.y}`;
      if (!state.spawnedPatrolZones.has(areaKey)) {
        state.spawnedPatrolZones.add(areaKey);
        const table = state.spec.wandering_monsters ? (state.spec.wandering_monsters[zone] || state.spec.wandering_monsters['dungeon']) : null;
        if (table && table.length > 0) {
          const chosenPatrol = table[Math.floor(Math.random() * table.length)];
          const monsterDef = state.spec.monsters ? state.spec.monsters[chosenPatrol.monsterId] : null;
          if (monsterDef) {
            chosenPatrolName = chosenPatrol.name;
            const count = chosenPatrol.count || 1;
            const enemies = [];
            for (let i = 0; i < count; i++) {
              enemies.push({
                instanceId: `patrol_${chosenPatrol.monsterId}_${Date.now()}_${i}`,
                id: monsterDef.id,
                name: count > 1 ? `${monsterDef.name} ${String.fromCharCode(65 + i)}` : monsterDef.name,
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

            // Check if party is facing a wall, closed door, chest, or dead end
            const hasElvenBoots = state.partyHasBootsOfElvenkind && state.partyHasBootsOfElvenkind();
            const facingBlocked = this.isFacingClosedObstacle(state);
            if (facingBlocked && !hasElvenBoots) {
              // Rear ambush! Enemies come from the open hall behind the party
              isAmbush = true;
              this.turnAround(state);
              state.addLog(`⚠️ REAR AMBUSH! Clattering footsteps and guttural snarls echo from the corridor behind you! A patrol of ${chosenPatrol.name} has cornered the party against the obstacle!`, "danger");
            } else if (hasElvenBoots) {
              state.addLog(`🧝 Boots of Elvenkind: Your party treads in utter silence! You hear the approaching ${chosenPatrol.name} before they detect you, preventing an ambush!`, "success");
            } else {
              state.addLog(`⚠️ WANDERING PATROL SPOTTED! The corridor echoes with approaching danger: ${chosenPatrol.name}!`, "danger");
            }

            state.combat = {
              active: true,
              round: 1,
              encounterId: `wandering_${Date.now()}`,
              enemies: enemies,
              queuedCommands: {},
              previousCommands: {},
              channelingCast: null,
              surpriseRound: isAmbush,
              alertedRound: true,
              moraleCheckedFirstBlood: false,
              moraleCheckedHalfSquad: false,
              moraleCheckedLeader: false
            };

            wanderingSpawned = true;
          }
        }
      }
    }

    return { minutes, wanderingSpawned, isAmbush, patrolName: chosenPatrolName, zone };
  }

  /**
   * Attempt to pickpocket an NPC.
   */
  static attemptPickpocket(state, npc) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief || thief.hp <= 0) return { success: false, reason: "Thief is incapacitated or missing." };
    if (!npc.inventory_to_steal || npc.inventory_to_steal.length === 0) return { success: false, reason: "Target has nothing left to steal." };
    
    const chance = state.getSkillTarget(thief, 'pick_pockets');
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= chance) {
      const stolenItem = npc.inventory_to_steal.shift();
      const sName = typeof stolenItem === 'string' ? stolenItem : stolenItem.name;
      const sAmt = typeof stolenItem === 'object' ? (stolenItem.amount || 1) : 1;
      const thiefIndex = state.party.indexOf(thief);
      state.addPartyItem(sName, sAmt, thiefIndex >= 0 ? thiefIndex : 0);
      return { success: true, roll, chance, stolenItem };
    } else {
      const npcState = state.getNPCState(npc.id);
      npcState.attitude = Math.max(-100, npcState.attitude - 40);
      npcState.endBehavior = 'despawn';
      const nearby = (state.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - state.player.x), Math.abs(e.y - state.player.y)) <= 2);
      if (nearby) nearby.alerted = true;
      return { success: false, roll, chance, detected: true };
    }
  }

  /**
   * Toggles thief stealth stance.
   */
  static attemptHideInShadows(state) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false, roll: 0, chance: 0 };

    const partyTier = EncumbranceManager.getPartyTier(state);
    if (partyTier.stealthLocked) {
      thief.isStealth = false;
      state.addLog(`⚠️ Encumbrance Lockout: Armor and gear are too heavy to slip into the shadows!`, "warning");
      return { success: false, roll: 0, chance: 0, encumbered: true };
    }

    const chance = state.getSkillTarget(thief, 'hide_in_shadows');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    thief.isStealth = success;
    
    // Blind roll: hide exact dice roll in blind mode
    const turnResult = this.advanceExplorationTurn(state, 10, "Hide in Shadows");
    return { success, roll, chance, turnResult };
  }

  /**
   * Checks whether the party is directly facing a dungeon wall tile.
   */
  static isFacingWall(state) {
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    else if (state.player.facing === 'SOUTH') dy = 1;
    else if (state.player.facing === 'EAST') dx = 1;
    else if (state.player.facing === 'WEST') dx = -1;
    const tx = state.player.x + dx, ty = state.player.y + dy;
    if (ty < 0 || ty >= state.spec.map.length || tx < 0 || tx >= state.spec.map[0].length) return true;
    return state.spec.map[ty][tx] === 1;
  }

  /**
   * Checks whether the party is facing a wall or closed door/obstacle.
   */
  static isFacingClosedObstacle(state) {
    if (this.isFacingWall(state)) return true;
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    else if (state.player.facing === 'SOUTH') dy = 1;
    else if (state.player.facing === 'EAST') dx = 1;
    else if (state.player.facing === 'WEST') dx = -1;
    const tx = state.player.x + dx, ty = state.player.y + dy;
    if (ty < 0 || ty >= state.spec.map.length || tx < 0 || tx >= state.spec.map[0].length) return true;
    const tileId = state.spec.map[ty][tx];
    const key = `${tx},${ty}`;
    if ((tileId === 2 || tileId === 8) && !state.openedDoors.has(key)) return true;
    if (tileId === 7) return true;
    return false;
  }

  /**
   * Checks whether the monster engaged in front of the party is cornered with no rear escape path.
   */
  static isMonsterCornered(state) {
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    else if (state.player.facing === 'SOUTH') dy = 1;
    else if (state.player.facing === 'EAST') dx = 1;
    else if (state.player.facing === 'WEST') dx = -1;

    // The monster stands 1 step in front of the party; the rear tile is 2 steps ahead
    const bx = state.player.x + 2 * dx;
    const by = state.player.y + 2 * dy;
    if (!state.spec || !state.spec.map) return false;
    if (by < 0 || by >= state.spec.map.length || bx < 0 || bx >= state.spec.map[0].length) return true;
    const tileId = state.spec.map[by][bx];
    if (tileId === 1) return true; // Solid wall behind monster
    const key = `${bx},${by}`;
    if ((tileId === 2 || tileId === 8) && !state.openedDoors?.has(key)) return true; // Closed door behind monster
    if (tileId === 7) return true; // Portcullis behind monster
    return false;
  }

  /**
   * Rotates party 180 degrees to face the opposite direction.
   */
  static turnAround(state) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(state.player.facing);
    if (index === -1) index = 0;
    index = (index + 2) % 4;
    state.player.facing = directions[index];
    state.revealExploration();
    state.isDirty = true;
  }

  /**
   * Retrieves active trap directly in front of the party.
   */
  static getTrapInFront(state) {
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    if (state.player.facing === 'SOUTH') dy = 1;
    if (state.player.facing === 'EAST') dx = 1;
    if (state.player.facing === 'WEST') dx = -1;
    const tx = state.player.x + dx, ty = state.player.y + dy;
    
    if (ty >= 0 && ty < state.spec.map.length && tx >= 0 && tx < state.spec.map[0].length) {
      const tileId = state.spec.map[ty][tx];
      const tileDef = state.spec.legend[tileId];
      const key = `${tx},${ty}`;
      if (tileDef && tileDef.trap && !state.disarmedTraps.has(key)) {
        return { x: tx, y: ty, ...tileDef.trap, detected: state.detectedTraps.has(key) };
      }
    }
    return null;
  }

  /**
   * Rogue skill: Find Traps.
   */
  static attemptFindTrap(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false, roll: 0, chance: 0 };
    const chance = state.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    if (success) {
      state.detectedTraps.add(`${target.x},${target.y}`);
      state.awardQuestXP(100);
    }
    const turnResult = this.advanceExplorationTurn(state, 10, "Find Traps");
    return { success, roll, chance, turnResult };
  }

  /**
   * Rogue skill: Disarm Traps.
   */
  static attemptDisarmTrap(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, triggered: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, triggered: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    thief.toolsDurability = Math.max(0, thief.toolsDurability - 4);
    const chance = state.getSkillTarget(thief, 'disarm_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const key = `${target.x},${target.y}`;
    
    const turnResult = this.advanceExplorationTurn(state, 10, "Disarm Trap");

    if (roll <= chance) {
      state.disarmedTraps.add(key);
      state.awardQuestXP(200);
      return { success: true, triggered: false, roll, chance, durability: thief.toolsDurability, turnResult };
    } 
    // In AD&D 2e, a trap only springs inadvertently on a fumble (roll > 95)
    if (roll > 95) {
      state.disarmedTraps.add(key);
      // Fumble when disarming: roll specifically for the thief attempting the disarm!
      const trapResult = this.triggerTrap(state, target, thief);
      return { success: false, triggered: true, roll, chance, trapResult, durability: thief.toolsDurability, turnResult };
    } else {
      // Normal failure: the mechanism resists, but the trap is not sprung
      return { success: false, triggered: false, roll, chance, durability: thief.toolsDurability, turnResult };
    }
  }

  /**
   * Rogue skill: Scout Ahead.
   */
  static attemptScout(state, range = 3) {
    const thief = state.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "No conscious thief in the party." };
    if (this.isFacingWall(state)) return { success: false, reason: "Solid stone blocks the way ahead." };

    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    else if (state.player.facing === 'SOUTH') dy = 1;
    else if (state.player.facing === 'EAST') dx = 1;
    else if (state.player.facing === 'WEST') dx = -1;

    const chance = state.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    const discoveries = [];

    if (success) {
      thief.shadowcraftSuccesses = (thief.shadowcraftSuccesses || 0) + 1;

      for (let step = 1; step <= range; step++) {
        const tx = state.player.x + dx * step, ty = state.player.y + dy * step;
        if (ty < 0 || ty >= state.spec.map.length || tx < 0 || tx >= state.spec.map[0].length) break;
        const tileId = state.spec.map[ty][tx];
        if (tileId === 1) break; 

        const key = `${tx},${ty}`;
        const tileDef = state.spec.legend[tileId];
        if (tileDef && tileDef.trap && !state.disarmedTraps.has(key)) {
          state.detectedTraps.add(key);
          discoveries.push({ type: 'trap', x: tx, y: ty, name: tileDef.trap.name });
        }
        const enc = (state.spec.encounters || []).find(e => e.x === tx && e.y === ty && !e.completed);
        if (enc) {
          enc.scouted = true;
          discoveries.push({ type: 'encounter', x: tx, y: ty, name: enc.name || 'hostiles' });
        }
      }
    } else {
      const nearby = (state.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - state.player.x), Math.abs(e.y - state.player.y)) <= range);
      if (nearby) nearby.alerted = true;
    }
    const turnResult = this.advanceExplorationTurn(state, 10, "Scout Ahead", false);

    // If a wandering patrol spawned while scouting, the thief spotted them approaching ahead!
    // Party gains awareness/advantage rather than being ambushed.
    if (turnResult && turnResult.wanderingSpawned && state.combat.active) {
      state.combat.surpriseRound = false;
      state.combat.alertedRound = true;
      discoveries.unshift({ type: 'patrol', name: turnResult.patrolName || 'Wandering Patrol' });
    }

    return { success, roll, chance, discoveries, turnResult };
  }

  /**
   * Rogue skill: Passive Hear Noise.
   */
  static checkPassiveHearNoise(state) {
    const thief = state.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return null;

    const nearby = (state.spec.encounters || []).find(e => {
      if (e.completed) return false;
      const dist = Math.max(Math.abs(e.x - state.player.x), Math.abs(e.y - state.player.y));
      return dist > 0 && dist <= 2;
    });
    if (!nearby) return null;

    const chance = state.getSkillTarget(thief, 'hear_noise');
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll > chance) return null;

    const dx = nearby.x - state.player.x, dy = nearby.y - state.player.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
    return { heroName: thief.name, direction: dir };
  }

  /**
   * Rogue skill: Sneak Past Encounter.
   */
  static attemptSneakPastEncounter(state, encounter) {
    const thief = state.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief || !thief.isStealth) return { success: false, reason: "Not sneaking." };

    const consciousCount = state.party.filter(p => p.hp > 0).length;
    let penalty = Math.max(0, consciousCount - 1) * 5;

    const sTiers = ProgressionManager.SHADOW_TIERS;
    if (thief.level >= sTiers.familiarity.minLevel && (thief.shadowcraftSuccesses || 0) >= sTiers.familiarity.count) {
        penalty = Math.max(0, penalty - sTiers.familiarity.penaltyRelief);
    }

    const chance = Math.max(5, state.getSkillTarget(thief, 'hide_in_shadows') - penalty);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;

    if (success) {
      thief.shadowcraftSuccesses = (thief.shadowcraftSuccesses || 0) + 1;
      
      let keepStealth = false;
      if (thief.level >= sTiers.mastery.minLevel && (thief.shadowcraftSuccesses || 0) >= sTiers.mastery.count) {
          if (Math.random() <= sTiers.mastery.keepStealthChance) keepStealth = true;
      }

      thief.isStealth = keepStealth;
      encounter.completed = true;
    } else {
      encounter.alerted = true;
    }
    return { success, roll, chance, encounterName: encounter.name };
  }

  /**
   * Springs a dungeon trap, calculating damage and saving throws.
   */
  static triggerTrap(state, trapDef, specificTarget = null) {
    const totalDamage = trapDef.damage || 15;
    const category = trapDef.saveCategory || 'breath';
    const subCategory = trapDef.subCategory || trapDef.name;
    const activeMembers = state.party.filter(p => p.hp > 0);
    if (activeMembers.length === 0) return { totalDamage, category, damagePerPlayer: 0, results: [], partyWiped: true };

    let targetedMembers = [];
    if (specificTarget && specificTarget.hp > 0) {
      // Direct single target (e.g. Thief during disarm fumble)
      targetedMembers = [specificTarget];
    } else {
      // Stepping on a trap / random triggering: roll saving throw for a random active party member
      const luckyOrUnluckyHero = activeMembers[Math.floor(Math.random() * activeMembers.length)];
      targetedMembers = [luckyOrUnluckyHero];
    }

    const damagePerPlayer = totalDamage;
    const results = targetedMembers.map(member => {
      const save = state.checkSavingThrow(member, category, subCategory);
      const damage = save.success ? Math.ceil(damagePerPlayer / 2) : damagePerPlayer;
      member.hp = Math.max(-10, member.hp - damage);
      const isDead = member.hp <= -10;
      const isIncapacitated = member.hp <= 0 && !isDead;
      return { heroName: member.name, heroIndex: state.party.indexOf(member), save, damage, isDead, isIncapacitated, hp: member.hp };
    });

    const partyWiped = state.party.every(h => h.hp <= 0);
    return { totalDamage, category, damagePerPlayer, results, partyWiped };
  }

  /**
   * Rogue skill: Pick Lock.
   */
  static attemptPickLock(state, target) {
    const thief = state.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    const lockKey = target ? `${target.x},${target.y}:${thief.level}` : null;
    if (lockKey && state.failedLockAttempts.has(lockKey)) {
      return { 
        success: false, 
        lockedOut: true, 
        reason: `${thief.name} has already tried this lock at Level ${thief.level} and found the tumblers beyond their current skill. Try again after leveling up or bash the obstacle.` 
      };
    }

    const roll = Math.floor(Math.random() * 100) + 1;
    const wear = (roll > 95) ? 10 : 4;
    thief.toolsDurability = Math.max(0, thief.toolsDurability - wear);

    const chance = state.getSkillTarget(thief, 'pick_locks');
    const success = roll <= chance;
    
    const turnResult = this.advanceExplorationTurn(state, 10, "Pick Lock");

    if (success) {
      state.awardQuestXP(150);
    } else {
      if (lockKey) {
        state.failedLockAttempts.add(lockKey);
      }
    }
    return { success, roll, chance, durability: thief.toolsDurability, fumbled: roll > 95, turnResult };
  }

  /**
   * Records door or chest as permanently unlocked.
   */
  static unlockTarget(state, x, y, type) {
    const key = `${x},${y}`;
    if (type === 'door') state.unlockedDoors.add(key);
    if (type === 'chest') state.unlockedChests.add(key);
  }

  /**
   * Verifies if a map tile coordinate is walkable.
   */
  static isWalkable(state, x, y) {
    if (y < 0 || y >= state.spec.map.length || x < 0 || x >= state.spec.map[0].length) return false;
    const tileId = state.spec.map[y][x];
    if ((tileId === 2 || tileId === 8) && state.openedDoors.has(`${x},${y}`)) return true;
    const tileDef = state.spec.legend[tileId];
    return tileDef && tileDef.walkable;
  }

  /**
   * Advances the party forward one tile in the direction they are facing.
   */
  static moveForward(state) {
    const partyTier = EncumbranceManager.getPartyTier(state);
    if (partyTier.tier === 'immobile') {
      state.addLog(`⛔ The party is completely immobilized by crushing encumbrance! Drop or manage heavy gear to move.`, "warning");
      return false;
    }

    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    if (state.player.facing === 'SOUTH') dy = 1;
    if (state.player.facing === 'EAST') dx = 1;
    if (state.player.facing === 'WEST') dx = -1;
    const targetX = state.player.x + dx, targetY = state.player.y + dy;
    if (this.isWalkable(state, targetX, targetY)) {
      if (state.surrenderedEnemy) {
        state.fleeSurrenderedEnemy();
      }
      state.player.x = targetX;
      state.player.y = targetY;
      state.revealExploration();

      // Encumbrance stealth lockout breaks active stealth on movement
      if (partyTier.stealthLocked && state.party) {
        let brokeStealth = false;
        state.party.forEach(hero => {
          if (hero.isStealth) {
            hero.isStealth = false;
            brokeStealth = true;
          }
        });
        if (brokeStealth) {
          state.addLog(`🔊 Heavy gear clatters and clangs! Stealth is broken by encumbrance.`, "warning");
        }
      }

      // In AD&D 2e: Walking 1 square consumes 1 minute (1 round) of game time + encumbrance penalty
      const minutes = 1 + (partyTier.timeMultiplier || 0);
      const isLoud = Boolean(partyTier.isLoud);
      const actionLabel = partyTier.tier !== 'unencumbered'
        ? `Walking (${partyTier.tier.charAt(0).toUpperCase() + partyTier.tier.slice(1)})`
        : "Walking";
      const turnResult = this.advanceExplorationTurn(state, minutes, actionLabel, isLoud);
      state.lastMovementTurnResult = turnResult;

      return true;
    }
    return false;
  }

  /**
   * Retreats the party backward one tile opposite to facing direction.
   */
  static moveBackward(state) {
    const partyTier = EncumbranceManager.getPartyTier(state);
    if (partyTier.tier === 'immobile') {
      state.addLog(`⛔ The party is completely immobilized by crushing encumbrance! Drop or manage heavy gear to move.`, "warning");
      return false;
    }

    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = 1;
    if (state.player.facing === 'SOUTH') dy = -1;
    if (state.player.facing === 'EAST') dx = -1;
    if (state.player.facing === 'WEST') dx = 1;
    const targetX = state.player.x + dx, targetY = state.player.y + dy;
    if (this.isWalkable(state, targetX, targetY)) {
      state.player.x = targetX;
      state.player.y = targetY;
      state.revealExploration();

      // Encumbrance stealth lockout breaks active stealth on movement
      if (partyTier.stealthLocked && state.party) {
        let brokeStealth = false;
        state.party.forEach(hero => {
          if (hero.isStealth) {
            hero.isStealth = false;
            brokeStealth = true;
          }
        });
        if (brokeStealth) {
          state.addLog(`🔊 Heavy gear clatters and clangs! Stealth is broken by encumbrance.`, "warning");
        }
      }

      // In AD&D 2e: Walking 1 square consumes 1 minute (1 round) of game time + encumbrance penalty
      const minutes = 1 + (partyTier.timeMultiplier || 0);
      const isLoud = Boolean(partyTier.isLoud);
      const actionLabel = partyTier.tier !== 'unencumbered'
        ? `Walking (${partyTier.tier.charAt(0).toUpperCase() + partyTier.tier.slice(1)})`
        : "Walking";
      const turnResult = this.advanceExplorationTurn(state, minutes, actionLabel, isLoud);
      state.lastMovementTurnResult = turnResult;

      return true;
    }
    return false;
  }

  /**
   * Rotates party 90 degrees LEFT or RIGHT.
   */
  static rotate(state, direction) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(state.player.facing);
    index = direction === 'RIGHT' ? (index + 1) % 4 : (index - 1 + 4) % 4;
    state.player.facing = directions[index];
    state.revealExploration();
  }

  /**
   * Marks a dungeon door tile as permanently opened.
   */
  static markDoorOpen(state, x, y) {
    state.openedDoors.add(`${x},${y}`);
  }

  /**
   * Opens a chest at coordinates, distributes loot to the shared party pack, and grants quest XP.
   */
  static openChest(state, x, y) {
    const key = `${x},${y}`;
    if (state.openedChests.has(key)) return null;
    state.openedChests.add(key);
    let generatedLoot = null;
    if (state.spec.chests && state.spec.chests[key]) {
      generatedLoot = JSON.parse(JSON.stringify(state.spec.chests[key]));
    } else {
      generatedLoot = [{ name: "Healing Potion", type: "consumable" }, { name: "Gold Pieces", amount: 75, type: "currency" }];
    }
    generatedLoot.forEach(item => {
      state.addPartyItem(item.name, item.amount || 1);
    });
    state.awardQuestXP(150);
    return generatedLoot;
  }

  /**
   * Checks for proximity narrative triggers or scripted interaction events.
   */
  static checkInteractionTrigger(state, x, y) {
    if (!state.spec.interactions) return null;
    const key = `${x},${y}`;
    if (state.triggeredEvents.has(key)) return null;
    const trigger = state.spec.interactions.find(t => t.x === x && t.y === y);
    if (trigger) { state.triggeredEvents.add(key); return trigger; }
    return null;
  }

  /**
   * Inspects the tile directly in front of the party for interactive doors, chests, props, and puzzles.
   */
  static getInteractiveTargetInFront(state) {
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    else if (state.player.facing === 'SOUTH') dy = 1;
    else if (state.player.facing === 'EAST') dx = 1;
    else if (state.player.facing === 'WEST') dx = -1;

    const tx = state.player.x + dx;
    const ty = state.player.y + dy;
    if (ty < 0 || ty >= state.spec.map.length || tx < 0 || tx >= state.spec.map[0].length) return null;

    const tileId = state.spec.map[ty][tx];
    const key = `${tx},${ty}`;

    // Grid Doors (tiles 2 and 8)
    if ((tileId === 2 || tileId === 8) && !state.openedDoors.has(key)) {
      const tileDef = state.spec.legend[tileId];
      const isLocked = Boolean(tileDef?.locked && !state.unlockedDoors.has(key));
      return {
        x: tx,
        y: ty,
        type: 'door',
        locked: isLocked,
        methods: tileDef?.locked?.methods || tileDef?.methods || [],
        dc: tileDef?.locked?.dc || 0,
        tileDef
      };
    }

    // Grid Chests (tile 3)
    if (tileId === 3 && !state.openedChests.has(key)) {
      const tileDef = state.spec.legend[tileId];
      const isLocked = Boolean(tileDef?.locked && !state.unlockedChests.has(key));
      return {
        x: tx,
        y: ty,
        type: 'chest',
        locked: isLocked,
        methods: tileDef?.locked?.methods || tileDef?.methods || [],
        dc: tileDef?.locked?.dc || 0,
        tileDef
      };
    }

    // Freestanding 3D Entity Chests & Props
    if (!state.openedChests.has(key) && state.spec.entities) {
      const entity = state.spec.entities.find(e => (e.model === 'chest' || e.type === 'chest' || e.type === 'prop') && e.x === tx && e.y === ty);
      if (entity) {
        const tileDef = state.spec.legend[3] || { name: entity.name || 'Chest', locked: null };
        const isLocked = Boolean(tileDef.locked && !state.unlockedChests.has(key));
        return {
          x: tx,
          y: ty,
          type: (entity.model === 'chest' || entity.type === 'chest') ? 'chest' : 'prop',
          locked: isLocked,
          methods: tileDef?.locked?.methods || tileDef?.methods || [],
          dc: tileDef?.locked?.dc || 0,
          tileDef,
          entity
        };
      }
    }

    // Generic Interactive / Puzzle / Runic / Inscription Tiles
    const tileDef = state.spec.legend[tileId];
    if (tileDef && (tileDef.interactive || tileDef.puzzle || tileDef.runes || tileDef.inscription || tileDef.locked)) {
      const isLocked = Boolean(tileDef.locked && !state.unlockedDoors.has(key) && !state.unlockedChests.has(key));
      return {
        x: tx,
        y: ty,
        type: tileDef.type || 'interactive',
        locked: isLocked,
        methods: tileDef.locked?.methods || tileDef.methods || (tileDef.runes || tileDef.puzzle || tileDef.inscription ? ['read_magic'] : []),
        dc: tileDef.locked?.dc || tileDef.dc || 0,
        tileDef
      };
    }

    return null;
  }

  /**
   * Checks if an interactive object in front can be opened.
   */
  static canOpenObjectInFront(state) {
    const target = this.getInteractiveTargetInFront(state);
    if (!target) return false;
    return target.type === 'door' || target.type === 'chest' || target.type === 'prop';
  }

  /**
   * Validates if party is facing the front access side of an interactive prop entity.
   */
  static isFacingPropFront(state, entity) {
    if (!entity || !entity.facing) return true;
    const requiredPlayerFacing = {
      'SOUTH': 'NORTH',
      'NORTH': 'SOUTH',
      'EAST': 'WEST',
      'WEST': 'EAST'
    }[entity.facing.toUpperCase()];

    if (!requiredPlayerFacing) return true;
    return state.player.facing === requiredPlayerFacing;
  }

  /**
   * Retrieves locked obstacle target in front of the party.
   */
  static getLockInFront(state) {
    const target = this.getInteractiveTargetInFront(state);
    return (target && target.locked) ? target : null;
  }

  /**
   * Fighter ability: Bash Door / Obstacle.
   * Duration scales with Strength: STR >= 18 takes 1 min, +1 min per point below, capped at 10 mins.
   */
  static attemptBash(state, fighter) {
    const hero = fighter || state.party.find(p => p.classKey === 'fighter') || state.party[0];
    const target = state.getSkillTarget(hero, 'bash');
    const roll = Math.floor(Math.random() * 20) + 1;
    const success = (roll <= target) && (roll !== 20);
    
    // Scale bash duration inversely with Strength:
    // STR >= 18 -> 1 minute.
    // Below 18 -> 1 + (18 - STR) minutes, capped at 10 minutes maximum for low strength.
    const str = state.getEffectiveStrength
      ? state.getEffectiveStrength(hero)
      : ((hero && hero.attributes && typeof hero.attributes.strength === 'number') ? hero.attributes.strength : 10);
    const minutes = Math.min(10, Math.max(1, 1 + (18 - str)));

    // Bashing makes violent noise — advance exploration turn and check wandering patrol / alert nearby
    const turnResult = this.advanceExplorationTurn(state, minutes, "Bash Door", true);

    // Also alert any nearby encounters within 3 tiles
    const nearby = (state.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - state.player.x), Math.abs(e.y - state.player.y)) <= 3);
    if (nearby) nearby.alerted = true;

    return { success, roll, target, turnResult, minutes, str, heroName: hero.name };
  }

  /**
   * Mage ability: Read Magic on locked/runic target.
   */
  static attemptReadMagic(state, mage, lock) {
    const hero = mage || state.party.find(p => p.classKey === 'mage');
    const target = state.getSkillTarget(hero, 'read_magic');
    const roll = Math.floor(Math.random() * 20) + 1;
    return { success: (roll <= target) && (roll !== 20), roll, target };
  }
}
