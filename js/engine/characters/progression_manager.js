import { ItemCatalog } from '../items/item_catalog.js';
import { SpellRegistry } from '../spell_registry.js';
import { EncumbranceManager } from '../items/encumbrance_manager.js';

/**
 * ProgressionManager encapsulates AD&D 2e character math, attack bonus progressions,
 * weapon mastery tiers, thief skills, saving throw calculations, experience thresholds,
 * training costs, and level-up advancement options.
 */
export class ProgressionManager {
  /** Attack Bonus Growth per class, purely dependent on current level. */
  static ATTACK_BONUS_GROWTH = {
    fighter: 1,      // Best in the game unconditionally (+1 every level)
    thief:   0.5,    // +1 every 2 levels
    cleric:  0.5,    // +1 every 2 levels
    mage:    0.34    // +1 every 3 levels
  };

  /** Progression gates for standard weapon mastery. */
  static MASTERY_TIERS = {
    familiarity: { minLevel: 2, hits: 15, atkBonus: 1, dmgBonus: 0 },
    mastery:     { minLevel: 5, hits: 40, atkBonus: 2, dmgBonus: 1 }
  };

  /** Progression gates for Thief scouting/stealth track. */
  static SHADOW_TIERS = {
    familiarity: { minLevel: 3, count: 10, penaltyRelief: 5 },   // Softens Sneak-Past's party-size penalty
    mastery:     { minLevel: 6, count: 25, keepStealthChance: 0.35 } // Chance to not consume isStealth on success
  };

  /** Progression gates for Thief backstab track. */
  static BACKSTAB_TIERS = {
    familiarity: { minLevel: 2, count: 10, bonusMult: 0.1 },  // Stacks onto the existing +20% base (+10% extra)
    mastery:     { minLevel: 5, count: 25, bonusMult: 0.25 }  // Stacks onto the existing +20% base (+25% extra)
  };

  /**
   * AD&D 2nd Edition Dexterity Defensive Adjustment Table (PHB Table 8).
   * Negative values improve descending AC (lower AC is better).
   * Positive values are penalties to AC (worse protection).
   */
  static getDexDefensiveAdjustment(dexterity) {
    const dex = dexterity != null ? dexterity : 10;
    if (dex <= 3) return 4;   // +4 AC penalty
    if (dex === 4) return 3;  // +3 AC penalty
    if (dex === 5) return 2;  // +2 AC penalty
    if (dex === 6) return 1;  // +1 AC penalty
    if (dex <= 14) return 0;  // Normal
    if (dex === 15) return -1; // -1 AC bonus
    if (dex === 16) return -2; // -2 AC bonus
    if (dex === 17) return -2; // -2 AC bonus (in 2e: -3 or -2; matches archetype starting AC 6 for leather AC 8)
    if (dex >= 18) return -4; // -4 AC bonus
    return 0;
  }

  /**
   * Derives AD&D 2nd Edition THAC0 for a monster.
   * If mob.thaco is specified in encounter data, uses it.
   * Otherwise derives from mob.attackTarget (11 -> 20, 12 -> 19, 13 -> 18, 14 -> 17, 15 -> 16)
   * or approximate Hit Dice (HP / 6).
   */
  static getMonsterThaco(mob) {
    if (mob.thaco != null) return mob.thaco;
    if (mob.attackTarget) {
      return Math.max(10, 20 - (mob.attackTarget - 11));
    }
    const hd = Math.max(1, Math.round((mob.maxHp || mob.hp || 8) / 6));
    return Math.max(10, 20 - (hd - 1));
  }

  /**
   * Calculates a hero's effective AC in AD&D 2e (lower is better),
   * accounting for base armor, shield, DEX, temporary magical wards, tactical Guard stance,
   * and encumbrance penalty.
   */
  static getHeroEffectiveAC(hero, isGuarding = false, state = null) {
    let ac = hero.armorClass != null ? hero.armorClass : 5;
    if (isGuarding) {
      ac -= 1; // Guarding improves AC by 1
    }
    if (hero.tempAcBonus) {
      ac -= hero.tempAcBonus; // Shield spell / Sanctuary improves AC
    }
    if (state) {
      const partyTier = EncumbranceManager.getPartyTier(state);
      if (partyTier && partyTier.acPenalty) {
        ac += partyTier.acPenalty;
      }
    }
    return ac;
  }

  /**
   * Retrieves the XP threshold needed for the next level from archetype specs or defaults.
   */
  static getXPForNextLevel(classKey, currentLevel, classesSpec = null) {
    const archetype = classesSpec?.archetypes?.[classKey];
    const defaultTables = {
      thief:   [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000],
      cleric:  [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000],
      fighter: [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000],
      mage:    [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000]
    };
    const table = archetype?.xp_table || defaultTables[classKey] || defaultTables.fighter;
    if (currentLevel < table.length) {
      return table[currentLevel];
    }
    return Math.round(table[table.length - 1] * Math.pow(2, currentLevel - table.length + 1));
  }

  /**
   * Calculates Constitution HP modifier according to AD&D 2e rules.
   */
  static getConHpModifier(hero) {
    const con = hero?.attributes?.constitution || 10;
    const isWarrior = hero?.classKey === 'fighter';
    if (con <= 3) return -2;
    if (con <= 6) return -1;
    if (con <= 14) return 0;
    if (con === 15) return 1;
    if (con === 16) return 2;
    if (con === 17) return isWarrior ? 3 : 2;
    if (con >= 18) return isWarrior ? 4 : 2;
    return 0;
  }

  /**
   * Calculates required training gold cost based on current hero level.
   * 1st level to 2nd level: 10 gp, 2nd to 3rd: 20 gp, etc.
   */
  static getTrainingCost(hero) {
    if (!hero) return 10;
    return Math.max(10, (hero.level || 1) * 10);
  }

  /**
   * Identifies the mentor, facility, patron camp, or sanctuary where this hero trains.
   */
  static getTrainingLocation(hero, spec = null) {
    if (!hero) return "Patron Encampment & Town Sanctuary";
    const key = (hero.classKey || '').toLowerCase();
    if (key === 'fighter') return "Highstone Military Garrison (Captain Valerius)";
    if (key === 'mage') return "Arcane Spire Sanctum (Archmage Cynthia Ravenwing)";
    if (key === 'cleric') return "Sunfire Sanctuary (High Priestess Kaelen)";
    if (key === 'thief') return "Thieves' Guild Crypt (Master Jax Quick-Fingers)";
    if (spec?.shop?.name) return `${spec.shop.name} Guild Training Grounds`;
    return "Lord Albright's Patron Pavilion & Encampment";
  }

  /**
   * Checks whether the party is at the patron camp, town settlement, temple, or surface where training mentors reside.
   */
  static canPartyTrain(state) {
    if (!state) return false;
    if (state.combat?.active) return false;
    if (typeof state.isTownTile === 'function' && state.isTownTile()) return true;
    if (typeof state.isWildernessTile === 'function' && state.isWildernessTile()) return true;
    if (typeof state.isNearShop === 'function' && state.isNearShop()) return true;
    const surfaceMin = state.spec?.surface_y_min != null ? state.spec.surface_y_min : 8;
    if (state.player?.y >= surfaceMin) return true;
    return false;
  }

  /**
   * Calculates attack bonus exclusively from level growth. Pure function.
   */
  static getLevelAttackBonus(hero) {
    const rate = this.ATTACK_BONUS_GROWTH[hero?.classKey] ?? 0.5;
    return Math.floor(((hero?.level || 1) - 1) * rate);
  }

  /**
   * Tracks successful weapon usage hits to drive the mastery tier unlocking.
   */
  static trackWeaponUsage(hero, weaponName) {
    if (!hero || !weaponName) return;
    if (!hero.weaponUsage) hero.weaponUsage = {};
    hero.weaponUsage[weaponName] = (hero.weaponUsage[weaponName] || 0) + 1;
  }

  /**
   * Skill target percentile or roll-under score for rogue and hero tradecraft.
   */
  static getSkillTarget(hero, skillKey) {
    if (!hero) return 10;
    let key = skillKey;
    if (key === 'disarm_traps' && (!hero.skills || !hero.skills.disarm_traps)) {
      key = 'find_traps';
    } else if (key === 'find_traps' && (!hero.skills || !hero.skills.find_traps)) {
      key = 'disarm_traps';
    }
    const skill = hero.skills ? hero.skills[key] : null;
    if (!skill) return 10;
    const levelBonus = ((hero.level || 1) - 1) * (skill.perLevel || 0);

    if (skill.type === 'percentile') {
      let dexMod = 0;
      const dex = hero.attributes?.dexterity || 10;
      if (hero.classKey === 'thief') {
        if (key === 'pick_locks') {
          if (dex === 16) dexMod = 5;
          else if (dex === 17) dexMod = 10;
          else if (dex === 18) dexMod = 15;
          else if (dex >= 19) dexMod = 20;
          else if (dex <= 9) dexMod = -10;
        } else if (key === 'find_traps' || key === 'disarm_traps') {
          if (dex === 17) dexMod = 5;
          else if (dex >= 18) dexMod = 10;
          else if (dex <= 9) dexMod = -10;
        } else if (key === 'pick_pockets') {
          if (dex === 17) dexMod = 5;
          else if (dex >= 18) dexMod = 10;
          else if (dex <= 9) dexMod = -15;
        } else if (key === 'hide_in_shadows') {
          if (dex === 17) dexMod = 5;
          else if (dex >= 18) dexMod = 10;
          else if (dex <= 9) dexMod = -10;
        }
      }
      let gearBonus = 0;
      if (key === 'hide_in_shadows' && hero.equippedBoots && (hero.equippedBoots.stealthBonus || hero.equippedBoots.name?.toLowerCase().includes('elvenkind') || hero.equippedBoots.name?.toLowerCase().includes('evenkind'))) {
        gearBonus += (hero.equippedBoots.stealthBonus || 25);
      }
      return Math.min(99, Math.max(1, skill.base + levelBonus + dexMod + gearBonus));
    } else {
      let rawAttr = (hero.attributes && hero.attributes[skill.attribute]) || 10;
      if (skill.attribute === 'strength' && hero.equippedGloves && (hero.equippedGloves.strengthSet || hero.equippedGloves.name?.toLowerCase().includes('ogre'))) {
        rawAttr = Math.max(rawAttr, hero.equippedGloves.strengthSet || 18);
      }
      return rawAttr + skill.base + levelBonus;
    }
  }

  /**
   * Awards quest / combat XP divided equally among living party members.
   * Marks heroes as eligible for level-up rather than auto-advancing them in the dungeon.
   */
  static awardQuestXP(state, amount) {
    if (!amount || amount <= 0 || !Array.isArray(state.party)) return [];

    // Only living heroes earn XP; dead/incapacitated heroes do not earn XP
    const livingHeroes = state.party.filter(hero => hero.hp > 0);
    if (livingHeroes.length === 0) return [];

    const share = Math.max(1, Math.floor(amount / livingHeroes.length));
    const newlyReadyHeroes = [];

    livingHeroes.forEach(hero => {
      hero.xp = (hero.xp || 0) + share;
      if (hero.xp >= hero.nextLevelXp && hero.level < 10) {
        if (!hero.canLevelUp) {
          hero.canLevelUp = true;
          newlyReadyHeroes.push(hero);
          state.addLog(`⭐ ${hero.name} has gained enough experience (${hero.xp}/${hero.nextLevelXp} XP) to advance to Level ${hero.level + 1}! Return to the village to train and advance.`, "success");
        }
      }
    });

    return newlyReadyHeroes;
  }

  /**
   * Prepares the options and rolled metrics for a hero's training advancement modal.
   */
  static calculateLevelUpOptions(state, heroIndex) {
    const hero = state.party[heroIndex];
    if (!hero) return null;

    const archetype = state.classesSpec?.archetypes?.[hero.classKey] || {};
    const hitDie = archetype.hit_die || (hero.classKey === 'fighter' ? 10 : hero.classKey === 'cleric' ? 8 : hero.classKey === 'thief' ? 6 : 4);
    const conMod = this.getConHpModifier(hero);
    const nextLevel = hero.level + 1;
    const rolledDie = Math.floor(Math.random() * hitDie) + 1;
    const calculatedHpGain = Math.max(1, rolledDie + conMod);
    const atkGrowth = this.ATTACK_BONUS_GROWTH[hero.classKey] ?? 0.5;
    const trainingCost = this.getTrainingCost(hero);
    const trainingLocation = this.getTrainingLocation(hero, state.spec);
    const partyGold = state.getPartyGold();
    const canAfford = partyGold >= trainingCost;

    // Available unlearned spells for Casters
    let availableSpells = [];
    if (hero.classKey === 'mage' || hero.classKey === 'cleric') {
      const maxAllowedTier = nextLevel >= 9 ? 4 : nextLevel >= 6 ? 3 : nextLevel >= 3 ? 2 : 1;
      const classSpells = SpellRegistry.getSpellsForClass(hero.classKey, maxAllowedTier);
      availableSpells = classSpells.filter(s => {
        const inSpells = hero.spells && hero.spells.some(hs => hs.id === s.id);
        const inGrimoire = hero.grimoire && hero.grimoire.some(gs => gs.id === s.id);
        return !inSpells && !inGrimoire;
      });
    }

    const availableWeapons = [
      'Longsword',
      'Two-Handed Sword',
      'Warhammer',
      'Short Sword',
      'Mace',
      'Halberd',
      'Quarterstaff',
      'Short Bow',
      'Long Bow',
      'Crossbow',
      'Sling'
    ];

    return {
      heroIndex,
      heroName: hero.name,
      className: hero.className,
      classKey: hero.classKey,
      currentLevel: hero.level,
      nextLevel,
      hitDie,
      rolledDie,
      conMod,
      hpGain: calculatedHpGain,
      currentHp: hero.hp,
      currentMaxHp: hero.maxHp,
      atkGrowth,
      currentAtk: hero.attackBonus || 1,
      trainingCost,
      trainingLocation,
      partyGold,
      canAfford,
      thiefPoints: hero.classKey === 'thief' ? (archetype.discretionary_skill_points_per_level || 15) : 0,
      skills: hero.skills ? JSON.parse(JSON.stringify(hero.skills)) : {},
      availableSpells,
      specializedWeapon: hero.specializedWeapon || 'Longsword',
      availableWeapons
    };
  }

  /**
   * Applies the finalized training advancement choices made by the player.
   */
  static applyLevelUp(state, heroIndex, choices) {
    const hero = state.party[heroIndex];
    if (!hero) return { success: false, reason: "Hero not found." };
    if (!hero.canLevelUp) return { success: false, reason: "Hero is not ready to level up." };

    const trainingCost = this.getTrainingCost(hero);
    const trainingLocation = this.getTrainingLocation(hero, state.spec);
    if (state.getPartyGold() < trainingCost) {
      return { success: false, reason: `Insufficient gold for mentor training fee (Need ${trainingCost} gp, have ${state.getPartyGold()} gp).` };
    }

    if (!state.spendGold(trainingCost)) {
      return { success: false, reason: "Payment for training fee failed." };
    }

    const oldLevel = hero.level;
    const hpGain = choices.hpGain || 5;
    const atkGrowth = this.ATTACK_BONUS_GROWTH[hero.classKey] ?? 0.5;

    hero.level += 1;
    hero.nextLevelXp = this.getXPForNextLevel(hero.classKey, hero.level, state.classesSpec);
    hero.canLevelUp = (hero.xp >= hero.nextLevelXp && hero.level < 10);

    // Apply HP
    hero.maxHp += hpGain;
    hero.hp = Math.min(hero.maxHp, hero.hp + hpGain);

    // Apply Attack Bonus
    hero.attackBonus = (hero.attackBonus || 1) + atkGrowth;

    // Apply Fighter Weapon Specialization
    if (hero.classKey === 'fighter' && choices.specializedWeapon) {
      const oldSpec = hero.specializedWeapon || 'Longsword';
      hero.specializedWeapon = choices.specializedWeapon;
      if (oldSpec !== choices.specializedWeapon) {
        state.addLog(`⚔️ ${hero.name} designates the ${hero.specializedWeapon} as their weapon of martial specialization (+1 to-hit, +2 damage)!`, "success");
      }
    }

    // Apply Thief Discretionary Points
    if (hero.classKey === 'thief' && choices.skillAllocations) {
      Object.entries(choices.skillAllocations).forEach(([skillKey, pts]) => {
        if (hero.skills && hero.skills[skillKey] && pts > 0) {
          hero.skills[skillKey].base = Math.min(99, (hero.skills[skillKey].base || 0) + pts);
        }
      });
    }

    // Apply Mage cognition boost & selected spells
    if (hero.classKey === 'mage') {
      hero.maxCognition = (hero.maxCognition || 100) + 10;
      hero.cognition = hero.maxCognition;
      if (choices.newSpells && Array.isArray(choices.newSpells)) {
        if (!hero.grimoire) hero.grimoire = [];
        choices.newSpells.forEach(spellDef => {
          const formattedSpell = {
            id: spellDef.id,
            name: spellDef.name,
            level: spellDef.level || spellDef.tier || 1,
            tier: spellDef.tier || spellDef.level || 1,
            cognitive_load: spellDef.cognitive_load || 20,
            casting_time: spellDef.casting_time || 'normal',
            target: spellDef.target || 'single_enemy',
            effect: spellDef.effect ? { ...spellDef.effect } : null,
            description: spellDef.description || '',
            sfx: spellDef.sfx || 'magic_missile'
          };
          if (!hero.grimoire.some(s => s.id === spellDef.id)) {
            hero.grimoire.push(formattedSpell);
          }
          if (!hero.spells.some(s => s.id === spellDef.id)) {
            hero.spells.push({ ...formattedSpell, spent: true });
          }
        });
      }
    }

    // Apply Cleric divine favor boost & selected prayers
    if (hero.classKey === 'cleric') {
      hero.maxDivineFavor = (hero.maxDivineFavor || 100) + 5;
      hero.divineFavor = hero.maxDivineFavor;
      if (choices.newSpells && Array.isArray(choices.newSpells)) {
        choices.newSpells.forEach(spellDef => {
          if (!hero.spells.some(s => s.id === spellDef.id)) {
            hero.spells.push({
              id: spellDef.id,
              name: spellDef.name,
              level: spellDef.level || 1,
              target: spellDef.target || 'ally',
              effect: spellDef.effect ? { ...spellDef.effect } : null,
              description: spellDef.description || '',
              spent: false
            });
          }
        });
      }
    }

    state.addLog(`⭐ ${hero.name} paid ${trainingCost} gp for mentor training at ${trainingLocation} and advanced to Level ${hero.level}! (+${hpGain} HP, +${atkGrowth.toFixed(2)} to-hit)`, "success");

    return {
      success: true,
      heroName: hero.name,
      heroIndex,
      oldLevel,
      newLevel: hero.level,
      hpGain,
      newHp: hero.hp,
      newMaxHp: hero.maxHp,
      newAtk: hero.attackBonus
    };
  }
}
