import { resolveSavingThrow } from './saving_throws.js';

/**
 * GameState acts as the central data store and rules engine for the dungeon crawler.
 * It manages player position, party metrics, skill resolution (d100 tradecraft for Thieves,
 * d20 roll-under ability checks for other classes), Vancian cognition, Divine favor,
 * level progression, inventory, and dungeon interactions.
 */
export class GameState {
  // ===========================================================================
  // STATIC CONFIGURATION & PROGRESSION TIERS
  // ===========================================================================

  /** Minimal weapon table — category drives Shoot availability; damageType feeds mitigation. */
  static WEAPON_CATALOG = {
    'Longsword': { category: 'melee', damageType: 'slashing', maxDmg: 8 },
    'Short Sword': { category: 'melee', damageType: 'slashing', maxDmg: 6 },
    'Dagger': { category: 'melee', damageType: 'piercing', maxDmg: 4 },
    'Warhammer': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6 },
    'Quarterstaff': { category: 'melee', damageType: 'bludgeoning', maxDmg: 6 },
    'Short Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 6 },
    'Long Bow': { category: 'ranged', damageType: 'piercing', maxDmg: 8 },
    'Crossbow': { category: 'ranged', damageType: 'piercing', maxDmg: 8 },
    'Sling': { category: 'ranged', damageType: 'bludgeoning', maxDmg: 4 }
  };

  /** Master item catalog. Shops, loot, starting kits and use-handlers all key off this. */
  static ITEM_CATALOG = {
    'Gold Pieces': { id: 'gold', kind: 'currency', scope: 'party', description: 'Coin of the realm.', stackable: true, usable: false, price: 1 },
    'Rations': { id: 'rations', kind: 'consumable', scope: 'party', description: 'Dried meat, hardtack and watered wine. Required to camp.', stackable: true, usable: false, price: 2 },
    'Torch': { id: 'torch', kind: 'consumable', scope: 'party', description: 'Burns for a short while. Keeps the dark at bay.', stackable: true, usable: true, useEffect: 'light', price: 1 },
    'Healing Potion': { id: 'healing_potion', kind: 'consumable', scope: 'party', description: 'A bitter red draught. Restores 1d4+1 hit points.', stackable: true, usable: true, useEffect: 'heal', healDice: '1d4+1', price: 25 },
    'Holy Water': { id: 'holy_water', kind: 'consumable', scope: 'party', description: 'Blessed vial. 2d4 damage vs undead or small blessing.', stackable: true, usable: true, useEffect: 'holy_water', price: 20 },
    'Arrows': { id: 'arrows', kind: 'ammo', scope: 'party', description: 'Bundle of arrows for bows.', stackable: true, usable: false, price: 1, unitLabel: 'arrow' },
    'Bolts': { id: 'bolts', kind: 'ammo', scope: 'party', description: 'Crossbow bolts.', stackable: true, usable: false, price: 1, unitLabel: 'bolt' },
    'Thief Tools': { id: 'thief_tools', kind: 'gear', scope: 'personal', description: 'Picks, probes and oil. Required for lockpicking and trap work. Degrades with use.', stackable: false, usable: true, useEffect: 'repair_tools', price: 30 },
    'Short Bow': { id: 'short_bow', kind: 'weapon', scope: 'personal', description: 'Light bow. Requires arrows.', stackable: false, usable: false, price: 25 },
    'Longsword': { id: 'longsword', kind: 'weapon', scope: 'personal', description: 'Standard martial blade.', stackable: false, usable: false, price: 15 },
    'Dagger': { id: 'dagger', kind: 'weapon', scope: 'personal', description: 'Small blade, easily concealed.', stackable: false, usable: false, price: 2 },
    'Warhammer': { id: 'warhammer', kind: 'weapon', scope: 'personal', description: 'Bludgeoning weapon favored by clerics.', stackable: false, usable: false, price: 8 },
    'Quarterstaff': { id: 'quarterstaff', kind: 'weapon', scope: 'personal', description: 'Simple wooden staff.', stackable: false, usable: false, price: 2 },
    'Short Sword': { id: 'short_sword', kind: 'weapon', scope: 'personal', description: 'Light blade preferred by thieves.', stackable: false, usable: false, price: 8 },
    'Leather Armor': { id: 'leather_armor', kind: 'armor', armorType: 'light', baseAc: 8, scope: 'personal', description: 'Cured and boiled animal hide. Light enough for thieves to move silently.', stackable: false, usable: false, price: 5 },
    'Studded Leather': { id: 'studded_leather', kind: 'armor', armorType: 'light', baseAc: 7, scope: 'personal', description: 'Tough leather reinforced with close-set steel rivets.', stackable: false, usable: false, price: 20 },
    'Scale Mail': { id: 'scale_mail', kind: 'armor', armorType: 'medium', baseAc: 6, scope: 'personal', description: 'Overlapping brass and iron scales laced to leather.', stackable: false, usable: false, price: 45 },
    'Chain Mail': { id: 'chain_mail', kind: 'armor', armorType: 'medium', baseAc: 5, scope: 'personal', description: 'Interlinked steel rings worn over padded gambeson.', stackable: false, usable: false, price: 75 },
    'Banded Mail': { id: 'banded_mail', kind: 'armor', armorType: 'heavy', baseAc: 4, scope: 'personal', description: 'Horizontal steel bands riveted to chain and leather.', stackable: false, usable: false, price: 90 },
    'Plate Mail': { id: 'plate_mail', kind: 'armor', armorType: 'heavy', baseAc: 3, scope: 'personal', description: 'Formed steel breastplate, rerebraces and greaves over chain.', stackable: false, usable: false, price: 150 },
    'Field Plate': { id: 'field_plate', kind: 'armor', armorType: 'heavy', baseAc: 2, scope: 'personal', description: 'Master-forged articulate steel harness offering superior battlefield warding.', stackable: false, usable: false, price: 400 },
    'Small Shield': { id: 'small_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Light buckler strapped to the forearm. Deflects incoming blows (-1 AC).', stackable: false, usable: false, price: 7 },
    'Medium Shield': { id: 'medium_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Iron-banded heater shield turning aside weapon strikes (-1 AC).', stackable: false, usable: false, price: 10 },
    'Consecrated Shield': { id: 'consecrated_shield', kind: 'shield', acBonus: 1, scope: 'personal', description: 'Blessed kite shield inscribed with sacred holy heraldry (-1 AC).', stackable: false, usable: false, price: 35 },
    "Scholar's Robes": { id: 'scholars_robes', kind: 'armor', armorType: 'unarmored', baseAc: 10, scope: 'personal', description: 'Woven wool and silk mantle allowing unhindered somatic casting.', stackable: false, usable: false, price: 5 },
    'Sun-Forged Relic of Dawn': { id: 'sun_relic', kind: 'quest', scope: 'party', description: 'A gleaming solar artifact consecrated in ancient times. Recovered from the goblin ruins.', stackable: false, usable: false, price: null },
    'Ancient Rubies': { id: 'rubies', kind: 'treasure', scope: 'party', description: 'Glittering gemstones plundered by the goblins.', stackable: true, usable: false, price: null }
  };

  /** Attack Bonus Growth per class, purely dependent on current level. */
  static ATTACK_BONUS_GROWTH = {
    fighter: 1, // Best in the game unconditionally
    thief: 0.5,
    cleric: 0.5,
    mage: 0.34
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
  getMonsterThaco(mob) {
    if (mob.thaco != null) return mob.thaco;
    if (mob.attackTarget) {
      return Math.max(10, 20 - (mob.attackTarget - 11));
    }
    const hd = Math.max(1, Math.round((mob.maxHp || mob.hp || 8) / 6));
    return Math.max(10, 20 - (hd - 1));
  }

  /**
   * Calculates a hero's effective AC in AD&D 2e (lower is better),
   * accounting for base armor, shield, DEX, temporary magical wards, and tactical Guard stance.
   */
  getHeroEffectiveAC(hero, isGuarding = false) {
    let ac = hero.armorClass != null ? hero.armorClass : 5;
    if (isGuarding) {
      ac -= 1; // Guarding improves AC by 1
    }
    if (hero.tempAcBonus) {
      ac -= hero.tempAcBonus; // Shield spell / Sanctuary improves AC
    }
    return ac;
  }



  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  constructor(adventureData, classesData) {
    this.spec = adventureData;
    this.classesSpec = classesData;
    this.player = {
      x: adventureData.start.x,
      y: adventureData.start.y,
      facing: adventureData.start.facing
    };
    
    this.party = [
      this.createPartyMember("fighter", "Valeros"),
      this.createPartyMember("thief", "Merisiel"),
      this.createPartyMember("cleric", "Kyra"),
      this.createPartyMember("mage", "Elminster")
    ];

    this.inventory = [
      { name: "Gold Pieces", amount: 100, type: "currency" },
      { name: "Rations", amount: 5, type: "consumable" },
      { name: "Torch", amount: 3, type: "consumable" },
      { name: "Healing Potion", amount: 1, type: "consumable" },
      { name: "Arrows", amount: 20, type: "ammo" }
    ];

    this.openedDoors = new Set();
    this.openedChests = new Set();
    this.unlockedDoors = new Set();
    this.unlockedChests = new Set();
    this.detectedTraps = new Set();
    this.disarmedTraps = new Set();
    this.triggeredEvents = new Set();
    
    this.activeNpc = null;
    this.selectedSpeaker = null;
    this.npcStates = {};

    this.combat = {
      active: false,
      round: 1,
      encounterId: null,
      enemies: [],               // Active monster instances
      queuedCommands: {},        // Pending orders for the turn
      previousCommands: {},      // Smart Action Memory
      channelingCast: null       // Track multi-turn casting
    };

    this.torchLitUntil = 0;
    this.lightSpellUntil = 0;

    this.onLog = null; // UI Event Delegate Hook
  }

  /**
   * Illumination and Dungeon Darkness Queries
   */
  getActiveLightSource() {
    const now = Date.now();
    if (this.lightSpellUntil && this.lightSpellUntil > now) {
      const remainingMs = this.lightSpellUntil - now;
      return {
        active: true,
        type: 'arcane_light',
        remainingMs,
        remainingSeconds: Math.ceil(remainingMs / 1000)
      };
    }
    if (this.torchLitUntil && this.torchLitUntil > now) {
      const remainingMs = this.torchLitUntil - now;
      return {
        active: true,
        type: 'torch',
        remainingMs,
        remainingSeconds: Math.ceil(remainingMs / 1000)
      };
    }
    return { active: false, type: null, remainingMs: 0, remainingSeconds: 0 };
  }

  isWildernessTile(x = this.player.x, y = this.player.y) {
    if (y < 0 || y >= this.spec.map.length || x < 0 || x >= this.spec.map[0].length) return false;
    const tileId = this.spec.map[y][x];
    const legendEntry = this.spec.legend && this.spec.legend[String(tileId)];
    if (legendEntry && (legendEntry.zone === 'wilderness' || legendEntry.zone === 'surface' || legendEntry.zone === 'village' || legendEntry.wilderness === true)) {
      return true;
    }
    if (tileId === 4 || tileId === 5) return true;
    if (this.spec.surface_y_min !== undefined && y >= this.spec.surface_y_min) return true;
    if (this.spec.dungeon_y_max !== undefined && y > this.spec.dungeon_y_max) return true;
    return false;
  }

  isDarknessActive(x = this.player.x, y = this.player.y) {
    if (this.spec.dark_dungeon === false || this.spec.darkness === false) return false;
    if (this.isWildernessTile(x, y)) return false;

    // Check legend metadata for the current tile
    if (y >= 0 && y < this.spec.map.length && x >= 0 && x < this.spec.map[0].length) {
      const tileId = this.spec.map[y][x];
      const legendEntry = this.spec.legend && this.spec.legend[String(tileId)];
      if (legendEntry) {
        if (legendEntry.darkness === false || legendEntry.lit === true || legendEntry.action === 'shop' || legendEntry.action === 'atonement') {
          return false;
        }
      }
    }

    // Check adventure level bounds
    if (this.spec.surface_y_min !== undefined && y >= this.spec.surface_y_min) return false;
    if (this.spec.dungeon_y_max !== undefined && y > this.spec.dungeon_y_max) return false;
    if (this.spec.dungeon_y_min !== undefined && y < this.spec.dungeon_y_min) return false;

    return true;
  }

  canPartySeeAhead() {
    if (!this.isDarknessActive()) return true;
    return this.getActiveLightSource().active;
  }

  /**
   * Factory method to initialize individual party members based on class archetypes.
   */
  createPartyMember(classKey, customName, chosenSpells = []) {
    const archetype = this.classesSpec.archetypes[classKey];
    if (!archetype) throw new Error(`Archetype '${classKey}' not found in classes spec.`);

    const defaultWeapon = archetype.default_weapon ||
      (classKey === 'fighter' ? 'Longsword' : classKey === 'thief' ? 'Short Sword' : classKey === 'cleric' ? 'Warhammer' : 'Quarterstaff');

    let inventory = [];
    let equippedArmor = null;
    let equippedShield = null;

    if (classKey === 'fighter') {
      inventory = [{ name: 'Short Bow', amount: 1 }];
      equippedArmor = {
        id: 'banded_mail',
        name: 'Banded Mail',
        type: 'heavy',
        baseAc: 4,
        description: 'Overlapping horizontal steel bands riveted to leather backing.'
      };
      equippedShield = {
        id: 'medium_shield',
        name: 'Medium Shield',
        type: 'shield',
        acBonus: 1,
        description: 'Iron-rimmed oak heater shield bearing martial heraldry.'
      };
    } else if (classKey === 'cleric') {
      equippedArmor = {
        id: 'chain_mail',
        name: 'Chain Mail',
        type: 'medium',
        baseAc: 5,
        description: 'Interlinked hardened steel rings worn over padded gambeson.'
      };
      equippedShield = {
        id: 'consecrated_shield',
        name: 'Consecrated Shield',
        type: 'shield',
        acBonus: 1,
        description: 'Blessed kite shield inscribed with sacred holy heraldry.'
      };
    } else if (classKey === 'thief') {
      inventory = [{ name: 'Thief Tools', amount: 1 }, { name: 'Short Bow', amount: 1 }];
      equippedArmor = {
        id: 'leather_armor',
        name: 'Cured Leather Jerkin',
        type: 'light',
        baseAc: 8,
        description: 'Supple boiled leather allowing silent movement and acrobatic evasion.'
      };
      equippedShield = null;
    } else if (classKey === 'mage') {
      equippedArmor = {
        id: 'scholars_robes',
        name: "Scholar's Woven Robes",
        type: 'unarmored',
        baseAc: 10,
        description: 'Heavy wool and silk embroidered with protective warding threads.'
      };
      equippedShield = null;
    }

    const xpTable = archetype.xp_table || (classKey === 'thief' ? [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000] : classKey === 'cleric' ? [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000] : classKey === 'fighter' ? [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000] : [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000]);
    const nextLevelXp = xpTable[1] || 2000;

    const member = {
      name: customName,
      classKey: classKey,
      className: archetype.name,
      group: archetype.group,
      level: 1,
      xp: 0,
      nextLevelXp: nextLevelXp,
      canLevelUp: false,
      hp: archetype.starting_hp,
      maxHp: archetype.starting_hp,
      armorClass: archetype.armor_class || 5,
      attackBonus: archetype.attack_bonus || 1,
      attributes: { ...archetype.attributes },
      skills: JSON.parse(JSON.stringify(archetype.skills || {})),
      equippedWeapon: defaultWeapon,
      equippedArmor: equippedArmor,
      equippedShield: equippedShield,
      tempAcBonus: 0,
      tempAcRounds: 0,
      tempAcSource: null,
      tempAttackBonus: 0,
      tempAttackRounds: 0,
      inventory,
      weaponUsage: {},
      spells: []
    };

    if (classKey === 'mage' && archetype.vancian_magic) {
      const maxCog = archetype.vancian_magic.cognition_max || 100;
      member.maxCognition = maxCog;
      member.cognition = maxCog;
      member.hasStudiedSinceRest = true;
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;
      
      // Load user-chosen setup spells if provided, otherwise fallback to tier 1
      if (chosenSpells && chosenSpells.length > 0) {
        member.spells = chosenSpells.map(s => ({ ...s, spent: false }));
      } else {
        const tier1 = archetype.vancian_magic.spell_tiers?.["1"] || [];
        member.spells = tier1.slice(0, 2).map(s => ({ ...s, spent: false }));
      }
    }

    if (classKey === 'cleric' && archetype.divine_favor) {
      const maxFav = archetype.divine_favor.max_favor || 100;
      member.divineFavor = maxFav;
      member.maxDivineFavor = maxFav;
      member.ethosStatus = "Full Communion";
      member.absoluteSilence = false;
      member.hasPrayedSinceRest = true;
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;
      member.tempAttackBonus = 0;
      member.tempAttackRounds = 0;

      if (chosenSpells && chosenSpells.length > 0) {
        member.spells = chosenSpells.map(s => ({ ...s, spent: false }));
      } else {
        const tier1 = archetype.spells_available_by_tier?.["1"] || [];
        member.spells = tier1.slice(0, 2).map(s => ({ ...s, spent: false }));
      }
    }

    if (classKey === 'thief') {
      member.toolsDurability = 100;
      member.isStealth = false;
      member.backstabSuccesses = 0;
      member.shadowcraftSuccesses = 0;
    }

    return member;
  }

  // ===========================================================================
  // PROGRESSION & STAT RESOLUTION
  // ===========================================================================

  /**
   * Retrieves the XP threshold needed for the next level from archetype specs or defaults.
   */
  getXPForNextLevel(classKey, currentLevel) {
    const archetype = this.classesSpec?.archetypes?.[classKey];
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
  getConHpModifier(hero) {
    const con = hero.attributes?.constitution || 10;
    const isWarrior = hero.classKey === 'fighter';
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
   * Checks whether the party is in town/village/wilderness where training mentors reside.
   */
  canPartyTrain() {
    if (this.combat.active) return false;
    if (this.isWildernessTile()) return true;
    if (this.isNearShop()) return true;
    return false;
  }

  /** * Calculates attack bonus exclusively from level growth. Pure function. 
   */
  getLevelAttackBonus(hero) {
    const rate = GameState.ATTACK_BONUS_GROWTH[hero.classKey] ?? 0.5;
    return Math.floor((hero.level - 1) * rate);
  }

  /**
   * Tracks successful weapon usage hits to drive the mastery tier unlocking. 
   */
  trackWeaponUsage(hero, weaponName) {
    if (!hero.weaponUsage) hero.weaponUsage = {};
    hero.weaponUsage[weaponName] = (hero.weaponUsage[weaponName] || 0) + 1;
  }

  /**
   * Retrieves the current mastery bonus of a weapon based on usage count and hero level.
   */
  getWeaponMastery(hero, weaponName) {
    const hits = (hero.weaponUsage && hero.weaponUsage[weaponName]) || 0;
    const { familiarity, mastery } = GameState.MASTERY_TIERS;
    
    if (hero.level >= mastery.minLevel && hits >= mastery.hits) {
      return { tier: 'mastery', ...mastery };
    }
    if (hero.level >= familiarity.minLevel && hits >= familiarity.hits) {
      return { tier: 'familiarity', atkBonus: familiarity.atkBonus, dmgBonus: 0 };
    }
    return { tier: 'novice', atkBonus: 0, dmgBonus: 0 };
  }

  getSkillTarget(hero, skillKey) {
    let key = skillKey;
    if (key === 'disarm_traps' && (!hero.skills || !hero.skills.disarm_traps)) {
      key = 'find_traps';
    } else if (key === 'find_traps' && (!hero.skills || !hero.skills.find_traps)) {
      key = 'disarm_traps';
    }
    const skill = hero.skills ? hero.skills[key] : null;
    if (!skill) return 10;
    const levelBonus = (hero.level - 1) * (skill.perLevel || 0);

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
      return Math.min(99, Math.max(1, skill.base + levelBonus + dexMod));
    } else {
      const rawAttr = hero.attributes[skill.attribute] || 10;
      return rawAttr + skill.base + levelBonus;
    }
  }

  // ===========================================================================
  // UTILITIES & DELEGATES
  // ===========================================================================

  addLog(message, type = 'info') {
    if (typeof this.onLog === 'function') this.onLog(message, type);
  }

  getNPCState(npcId) {
    if (!this.npcStates[npcId]) {
      this.npcStates[npcId] = { attitude: 0, currentNode: null, met: false, completed: false, despawned: false, endBehavior: null, flags: {} };
    }
    return this.npcStates[npcId];
  }

  // ===========================================================================
  // INVENTORY MANAGEMENT
  // ===========================================================================

  isKnownWeapon(weaponName) {
    if (this.spec.weapons && this.spec.weapons[weaponName]) return true;
    return !!GameState.WEAPON_CATALOG[weaponName];
  }

  getItemDef(name) {
    if (this.spec.items && this.spec.items[name]) return this.spec.items[name];
    return GameState.ITEM_CATALOG[name] || null;
  }
  
  isRangedWeapon(weaponName) {
    const def = (this.spec.weapons && this.spec.weapons[weaponName]) || GameState.WEAPON_CATALOG[weaponName];
    return !!(def && def.category === 'ranged');
  }

  canHeroShoot(hero) { return !!(hero && this.isRangedWeapon(hero.equippedWeapon)); }
  
  canHeroMelee(hero) {
    if (!hero || !hero.equippedWeapon) return false;
    const def = GameState.WEAPON_CATALOG[hero.equippedWeapon];
    return !!(def && def.category === 'melee');
  }

  getWeaponDamageType(weaponName, fallback = 'slashing') {
    const def = GameState.WEAPON_CATALOG[weaponName];
    return (def && def.damageType) || fallback;
  }

  getWeaponMaxDamage(weaponName, fallback = 8) {
    const def = GameState.WEAPON_CATALOG[weaponName];
    return (def && def.maxDmg) || fallback;
  }

  getMonsterMaxDamage(dmgStr) {
    if (!dmgStr || typeof dmgStr !== 'string') return 8;
    const m = dmgStr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
    if (!m) return 8;
    const num = Math.max(1, parseInt(m[1], 10) || 1);
    const die = Math.max(1, parseInt(m[2], 10) || 4);
    const bonus = parseInt(m[3] || '0', 10) || 0;
    return (num * die) + bonus;
  }

  evaluateAttackOutcome(params) {
    const {
      attackerName, targetName, weaponName = 'weapon', dmgType = 'slashing',
      attackMode = 'melee', roll, targetNum, rawDmg, netDmg, maxDamage = 8,
      isDead = false, isBoss = false, isNat20 = false, isBackstab = false
    } = params;

    const margin = targetNum - roll;
    const isHighMargin = isNat20 || (roll === 1) || (margin >= 4);
    const isLowMargin = (margin <= 1);
    const ratio = rawDmg / Math.max(1, maxDamage);
    const isHighDmg = ratio >= 0.75 || rawDmg >= maxDamage;
    const isLowDmg = rawDmg <= 2 || ratio <= 0.30;

    let logText = '';
    let logType = 'info';
    let cueBadge = `💥 ${netDmg}`;
    let cueClass = 'normal';
    let isMasterstroke = false;
    let masterstrokeFeat = null;

    if (isBackstab) {
      isMasterstroke = true;
      cueClass = 'backstab';
      cueBadge = `🗡️ ${netDmg} BACKSTAB!`;
      logType = 'masterstroke';
      logText = `<div class="ms-title"><span>🗡️ MASTER BACKSTAB — ${attackerName.toUpperCase()}</span><span class="ms-meta">${weaponName} (${netDmg} dmg)</span></div><div class="ms-quote">"${attackerName} emerges unseen from the gloom and sinks the blade to the hilt into ${targetName}!"</div>`;

      if (netDmg >= 12 || isDead || isBoss) {
        masterstrokeFeat = {
          title: '🗡️ SHADOW MASTERSTROKE',
          category: 'CRITICAL BACKSTAB EXECUTED',
          badge: '🩸 LETHAL ANATOMY',
          origin: 'Exploiting unprotected blind spot from darkness',
          heroName: attackerName,
          rollText: `<span style="color:#ffd700">d100:[${roll}] vs Skill</span>`,
          damage: netDmg,
          outcome: `⚡ ${netDmg} DAMAGE`,
          narrative: `${attackerName} strikes silently from the darkness, driving the blade clean into vital organs!`
        };
      }
    } else if (isHighMargin && isHighDmg) {
      // Tier 1 & 2: Masterstroke!
      isMasterstroke = true;
      cueClass = 'crushing';
      cueBadge = `💥 ${netDmg} MASTERSTROKE!`;
      logType = 'masterstroke';

      let quote = '';
      if (attackMode === 'ranged') {
        quote = `${attackerName} threads the arrow with surgical perfection into a vulnerable joint in ${targetName}'s defenses!`;
      } else if (dmgType === 'piercing') {
        quote = `${attackerName} finds the mortal seam in ${targetName}'s guard, piercing directly into vital tissue!`;
      } else if (dmgType === 'bludgeoning') {
        quote = `${attackerName} brings the ${weaponName} down with bone-shattering leverage and devastating kinetic force!`;
      } else {
        quote = `${attackerName} exploits a lethal gap in ${targetName}'s stance, driving the ${weaponName} clean through with surgical mastery!`;
      }

      logText = `<div class="ms-title"><span>⚔️ MASTERSTROKE — ${attackerName.toUpperCase()}</span><span class="ms-meta">${weaponName} (${netDmg}/${maxDamage} dmg)</span></div><div class="ms-quote">"${quote}"</div>`;

      // Tier 3: Rare Cinematic Banner for exceptional feats
      if (isDead && (isBoss || isNat20 || roll === 1 || netDmg >= 8)) {
        masterstrokeFeat = {
          title: '⚔️ MASTERSTROKE OF MARTIAL PROWESS',
          category: 'CRITICAL APERTURE EXPLOITED',
          badge: '💥 FATAL PENETRATION',
          origin: 'Exquisite geometric timing and terminal kinetic force',
          heroName: attackerName,
          rollText: `<span style="color:#ffd700">d20:[${roll}] vs Target ${targetNum}</span>`,
          damage: netDmg,
          outcome: `⚡ ${netDmg} DAMAGE (FATAL)`,
          narrative: `${attackerName} executes a textbook martial finisher, terminating ${targetName} instantly!`
        };
      }
    } else if (isHighMargin && isLowDmg) {
      cueClass = 'graze';
      cueBadge = `⚔️ ${netDmg} (Graze)`;
      logType = 'info';
      if (attackMode === 'ranged') {
        logText = `🏹 ${attackerName}'s shot is on target, but glances across ${targetName}'s flank — drawing only a stinging flesh graze (${netDmg} dmg).`;
      } else if (dmgType === 'piercing') {
        logText = `⚔️ ${attackerName} slips past the parry, but the point catches on dense bone — shallow penetration (${netDmg} dmg).`;
      } else if (dmgType === 'bludgeoning') {
        logText = `⚔️ ${attackerName} lands squarely, but the impact glances across curved muscle without full kinetic shock (${netDmg} dmg).`;
      } else {
        logText = `⚔️ ${attackerName} cuts cleanly past the guard, but ${targetName} recoils in the nick of time — a shallow flesh graze (${netDmg} dmg).`;
      }
    } else if (isLowMargin && isHighDmg) {
      cueClass = 'heavy';
      cueBadge = `💥 ${netDmg} HEAVY IMPACT!`;
      logType = 'info';
      logText = `💥 ${attackerName}'s swing is hurried and off-balance, but ${targetName} lunges into the steel — brutal impalement! (${netDmg} dmg)`;
    } else if (isLowMargin && isLowDmg) {
      cueClass = 'graze';
      cueBadge = `⚔️ ${netDmg}`;
      logType = 'muted';
      logText = `⚔️ ${attackerName}'s ${weaponName} barely breaches ${targetName}'s guard, the blade edge leaving only a ragged scratch (${netDmg} dmg).`;
    } else {
      cueClass = 'normal';
      cueBadge = `💥 ${netDmg}`;
      logType = 'info';
      if (attackMode === 'ranged') {
        logText = `🏹 ${attackerName} looses a shot at ${targetName}, striking home for ${netDmg} damage!`;
      } else {
        logText = `⚔️ ${attackerName} lands a solid strike on ${targetName} with ${weaponName} for ${netDmg} damage!`;
      }
    }

    return { logText, logType, cueBadge, cueClass, isMasterstroke, masterstrokeFeat };
  }

  evaluateHeroMissOutcome(params) {
    const { attackerName, targetName, weaponName = 'weapon', attackMode = 'melee', roll, targetArmorType = 'none' } = params;
    let logText = '';
    let cueBadge = '💨 EVADED';
    let cueClass = 'dodge';
    let missLayer = 'DODGE';

    if (roll === 20) {
      logText = `💨 ${attackerName} overextends with an awkward swing; ${targetName} easily steps aside!`;
      cueBadge = '💨 WHIFF';
      cueClass = 'dodge';
      missLayer = 'DODGE';
    } else if (targetArmorType === 'chain' || targetArmorType === 'plate') {
      logText = `⚙️ ARMOR DEFLECTION: ${attackerName}'s ${weaponName} rings off ${targetName}'s ${targetArmorType} armor without penetrating!`;
      cueBadge = '⚙️ DEFLECTED';
      cueClass = 'armor';
      missLayer = 'ARMOR';
    } else {
      logText = `💨 EVADED: ${targetName} ducks underneath ${attackerName}'s strike!`;
      cueBadge = '💨 EVADED';
      cueClass = 'dodge';
      missLayer = 'DODGE';
    }

    return { logText, logType: 'muted', cueBadge, cueClass, missLayer };
  }

  equipHeroWeapon(heroIndex, weaponName) {
    const hero = this.party[heroIndex];
    if (!hero || !weaponName) return { success: false, reason: 'Invalid hero or weapon.' };
    if (!GameState.WEAPON_CATALOG[weaponName]) return { success: false, reason: `"${weaponName}" is not a known weapon.` };

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === weaponName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${weaponName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedWeapon) {
      const existing = hero.inventory.find(i => i.name === hero.equippedWeapon);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedWeapon, amount: 1 });
    }

    hero.equippedWeapon = weaponName;
    return { success: true, equipped: weaponName };
  }

  equipHeroArmor(heroIndex, armorName) {
    const hero = this.party[heroIndex];
    if (!hero || !armorName) return { success: false, reason: 'Invalid hero or armor.' };
    const itemDef = this.getItemDef(armorName);
    if (!itemDef || itemDef.kind !== 'armor') return { success: false, reason: `"${armorName}" is not valid armor.` };

    // Class armor restrictions in AD&D 2e:
    if (hero.classKey === 'mage' && itemDef.armorType !== 'unarmored') {
      return { success: false, reason: 'Mages cannot wear metallic or rigid armor while weaving somatic spells.' };
    }
    if (hero.classKey === 'thief' && itemDef.armorType !== 'light' && itemDef.armorType !== 'unarmored') {
      return { success: false, reason: 'Thieves cannot wear heavy armor without crippling thieving tradecraft.' };
    }

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === armorName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${armorName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedArmor && hero.equippedArmor.name && hero.equippedArmor.name !== "None (Unarmored)") {
      const existing = hero.inventory.find(i => i.name === hero.equippedArmor.name);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedArmor.name, amount: 1 });
    }

    hero.equippedArmor = {
      id: itemDef.id,
      name: armorName,
      type: itemDef.armorType || 'medium',
      baseAc: itemDef.baseAc != null ? itemDef.baseAc : 10,
      description: itemDef.description || ''
    };
    this.recalculateHeroAC(hero);
    return { success: true, equipped: armorName };
  }

  equipHeroShield(heroIndex, shieldName) {
    const hero = this.party[heroIndex];
    if (!hero || !shieldName) return { success: false, reason: 'Invalid hero or shield.' };
    const itemDef = this.getItemDef(shieldName);
    if (!itemDef || itemDef.kind !== 'shield') return { success: false, reason: `"${shieldName}" is not a shield.` };

    if (hero.classKey === 'mage') {
      return { success: false, reason: 'Mages cannot wield shields without disrupting spellcraft somatic components.' };
    }

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === shieldName);
    if (!slot || (slot.amount || 1) < 1) return { success: false, reason: `${hero.name} does not carry ${shieldName}.` };

    if ((slot.amount || 1) <= 1) hero.inventory = inv.filter(i => i !== slot);
    else slot.amount -= 1;

    if (hero.equippedShield && hero.equippedShield.name) {
      const existing = hero.inventory.find(i => i.name === hero.equippedShield.name);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedShield.name, amount: 1 });
    }

    hero.equippedShield = {
      id: itemDef.id,
      name: shieldName,
      type: 'shield',
      acBonus: itemDef.acBonus || 1,
      description: itemDef.description || ''
    };
    this.recalculateHeroAC(hero);
    return { success: true, equipped: shieldName };
  }

  recalculateHeroAC(hero) {
    const baseArmorAc = hero.equippedArmor?.baseAc != null ? hero.equippedArmor.baseAc : 10;
    const shieldBonus = hero.equippedShield ? (hero.equippedShield.acBonus || 1) : 0;
    const dexMod = GameState.getDexDefensiveAdjustment(hero.attributes?.dexterity);
    hero.armorClass = baseArmorAc - shieldBonus + dexMod;
    return hero.armorClass;
  }

  getPartyItem(name) {
    if (!this.inventory) this.inventory = [];
    return this.inventory.find(i => i.name === name) || null;
  }

  getPartyItemQty(name) {
    const item = this.getPartyItem(name);
    return item ? (item.amount ?? item.count ?? 0) : 0;
  }

  getPartyGold() { return this.getPartyItemQty('Gold Pieces'); }

  addPartyItem(name, amount = 1) {
    if (!this.inventory) this.inventory = [];
    const def = this.getItemDef(name);
    const qty = Math.max(1, amount | 0);
    const existing = this.getPartyItem(name);
    if (existing && (def ? def.stackable !== false : true)) {
      existing.amount = (existing.amount ?? existing.count ?? 0) + qty;
      if (existing.count !== undefined) existing.count = existing.amount;
      return existing;
    }
    const entry = { name, amount: qty };
    if (def && def.kind) entry.type = def.kind;
    this.inventory.push(entry);
    return entry;
  }

  removePartyItem(name, amount = 1) {
    const item = this.getPartyItem(name);
    if (!item) return false;
    const qtyKey = item.amount !== undefined ? 'amount' : 'count';
    const have = item[qtyKey] ?? 0;
    if (have < amount) return false;
    item[qtyKey] = have - amount;
    if (item[qtyKey] <= 0) this.inventory = this.inventory.filter(i => i !== item);
    return true;
  }

  spendGold(amount) { return this.removePartyItem('Gold Pieces', amount); }

  useConsumable(itemName, heroIndex = null) {
    const def = this.getItemDef(itemName);
    if (!def || !def.usable) return { success: false, reason: `${itemName} cannot be used.` };
    if (this.getPartyItemQty(itemName) < 1) return { success: false, reason: `No ${itemName} left in the pack.` };
    if (this.combat.active && def.useEffect === 'light') return { success: false, reason: 'Cannot light a torch in the middle of a melee.' };

    const hero = (heroIndex != null) ? this.party[heroIndex] : null;

    if (def.useEffect === 'heal') {
      if (!hero || hero.hp <= 0) return { success: false, reason: 'Choose a living hero to drink the potion.' };
      if (hero.hp >= hero.maxHp) return { success: false, reason: `${hero.name} is already at full health.` };
      
      const healed = Math.floor(Math.random() * 4) + 1 + 1; // 1d4+1
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + healed);
      const actual = hero.hp - before;
      this.removePartyItem(itemName, 1);
      return { success: true, healed: actual, log: `${hero.name} drinks a Healing Potion and recovers ${actual} HP (${hero.hp}/${hero.maxHp}).` };
    }

    if (def.useEffect === 'holy_water') {
      if (!hero) return { success: false, reason: 'Choose a hero to apply the blessing.' };
      this.removePartyItem(itemName, 1);
      if (hero.classKey === 'cleric') {
        hero.divineFavor = Math.min(hero.maxDivineFavor || 100, (hero.divineFavor || 0) + 8);
        if (hero.divineFavor > 0) hero.absoluteSilence = false;
        this.#syncClericEthos(hero);
        return { success: true, log: `${hero.name} anoints themselves with Holy Water. Divine Favor rises (+8).` };
      }
      hero.tempAttackBonus = (hero.tempAttackBonus || 0) + 1;
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 3);
      return { success: true, log: `${hero.name} is blessed with Holy Water (+1 to hit for a short time).` };
    }

    if (def.useEffect === 'light') {
      this.removePartyItem(itemName, 1);
      this.torchLitUntil = Date.now() + 3 * 60 * 1000;
      return { success: true, log: `🔥 A torch is lit! Warm, flickering flames push back the dungeon darkness for 3 minutes.` };
    }

    if (def.useEffect === 'repair_tools') {
      const thief = this.party.find(p => p.classKey === 'thief');
      if (!thief) return { success: false, reason: 'No thief in the party.' };
      if ((thief.toolsDurability || 0) >= 100) return { success: false, reason: 'Tools are already in perfect condition.' };
      
      const personal = (thief.inventory || []).find(i => i.name === 'Thief Tools');
      const fromParty = this.getPartyItemQty('Thief Tools') > 0;
      
      if (!fromParty && !personal) return { success: false, reason: 'No spare Thief Tools available.' };
      
      if (fromParty) this.removePartyItem('Thief Tools', 1);
      else {
        if ((personal.amount || 1) <= 1) thief.inventory = thief.inventory.filter(i => i !== personal);
        else personal.amount -= 1;
      }
      thief.toolsDurability = 100;
      return { success: true, log: `${thief.name} refits a fresh set of tools. Durability restored to 100%.` };
    }
    return { success: false, reason: 'Unknown use effect.' };
  }

  isNearShop() {
    const shop = this.spec.shop;
    if (!shop || !shop.tile) return false;
    const [sx, sy] = shop.tile;
    const r = shop.radius != null ? shop.radius : 1;
    return Math.abs(this.player.x - sx) + Math.abs(this.player.y - sy) <= r;
  }

  getShopTile() { return (this.spec.shop && this.spec.shop.tile) ? this.spec.shop.tile : null; }

  buyItem(itemName, qty = 1, heroIndex = null) {
    const def = this.getItemDef(itemName);
    if (!def) return { success: false, reason: `Unknown item: ${itemName}` };
    if (def.kind === 'currency') return { success: false, reason: 'Cannot buy gold with gold.' };

    const total = (def.price || 0) * qty;
    if (this.getPartyGold() < total) return { success: false, reason: `Not enough gold (need ${total} gp).` };
    if (!this.spendGold(total)) return { success: false, reason: 'Payment failed.' };

    if (def.scope === 'personal') {
      const hero = heroIndex != null ? this.party[heroIndex] : this.party.find(p => p.classKey === 'thief') || this.party[0];
      if (!hero) return { success: false, reason: 'No hero to receive the item.' };
      if (!hero.inventory) hero.inventory = [];
      const existing = hero.inventory.find(i => i.name === itemName);
      if (existing) {
        existing.amount = (existing.amount || 1) + qty;
      } else {
        hero.inventory.push({ name: itemName, amount: qty });
      }
      if (itemName === 'Thief Tools' && hero.classKey === 'thief') hero.toolsDurability = 100;
      return { success: true, total, destination: 'personal', heroName: hero.name };
    }

    this.addPartyItem(itemName, qty);
    return { success: true, total, destination: 'party' };
  }

  // ===========================================================================
  // COMBAT ENGINE
  // ===========================================================================

  startEncounter(encounterId) {
    const encSpec = (this.spec.encounters || []).find(e => e.id === encounterId);
    if (!encSpec) return false;

    let instanceIdCounter = 1;
    const spawnedEnemies = [];

    encSpec.enemies.forEach(group => {
      const monsterDef = this.spec.monsters[group.monsterId];
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
          undeadTier: monsterDef.undeadTier || null
        });
      }
    });

    const isDarkAmbush = this.isDarknessActive() && !this.canPartySeeAhead();
    this.combat = {
      active: true,
      round: 1,
      encounterId: encounterId,
      enemies: spawnedEnemies,
      queuedCommands: {},
      previousCommands: {},
      channelingCast: null,
      surpriseRound: !isDarkAmbush && !!encSpec.scouted,
      alertedRound: isDarkAmbush || !!encSpec.alerted
    };

    if (isDarkAmbush) {
      this.addLog(`🌑 AMBUSHED IN THE DARK! Without a torch or light spell, the enemies strike from the gloom!`, "danger");
    } else {
      const light = this.getActiveLightSource();
      if (light.active) {
        const srcName = light.type === 'arcane_light' ? 'Arcane Light' : 'Torchlight';
        this.addLog(`🔥 ${srcName} reveals ${encSpec.name} ahead, preventing a dark ambush!`, "info");
      }
      this.addLog(`⚔️ COMBAT ENGAGED! ${encSpec.name} (${spawnedEnemies.length} hostiles present).`, "danger");
    }
    return true;
  }

  queueHeroCommand(heroIndex, command) {
    this.combat.queuedCommands[heroIndex] = command;
  }

  getTurnUndeadTarget(clericLevel, undeadTier) {
    const lvl = Math.max(1, Math.min(10, clericLevel || 1));
    const table = {
      1: { weak: 10, medium: 13, strong: 16, greater: null },
      2: { weak: 7, medium: 10, strong: 13, greater: 20 },
      3: { weak: 4, medium: 7, strong: 10, greater: 16 },
      4: { weak: 'D', medium: 4, strong: 7, greater: 13 },
      5: { weak: 'D', medium: 'D', strong: 4, greater: 10 },
      6: { weak: 'D', medium: 'D', strong: 'D', greater: 7 },
      7: { weak: 'D', medium: 'D', strong: 'D', greater: 4 },
      8: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' },
      9: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' },
      10: { weak: 'D', medium: 'D', strong: 'D', greater: 'D' }
    };
    const row = table[lvl] || table[1];
    return row[undeadTier] !== undefined ? row[undeadTier] : row.weak;
  }

  applyArmorMitigation(rawDamage, damageType, armorType) {
    if (damageType === 'bludgeoning') return rawDamage;
    if (armorType === 'chain') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 2);
    } else if (armorType === 'plate') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 5);
      if (damageType === 'piercing') return Math.max(1, rawDamage - 3);
    }
    return rawDamage;
  }

  rollMonsterDamage(dmgStr) {
    if (!dmgStr || typeof dmgStr !== 'string') return Math.floor(Math.random() * 4) + 1;
    const m = dmgStr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
    if (!m) return Math.floor(Math.random() * 4) + 1;
    const num = Math.max(1, parseInt(m[1], 10) || 1);
    const die = Math.max(1, parseInt(m[2], 10) || 4);
    const bonus = parseInt(m[3] || '0', 10) || 0;
    let total = bonus;
    for (let i = 0; i < num; i++) total += Math.floor(Math.random() * die) + 1;
    return Math.max(1, total);
  }

  resolveCombatRound() {
    if (!this.combat.active) return { events: [], finalMobHp: {}, finalHeroHp: {}, victory: false, partyWiped: false, totalXp: 0 };

    const actionQueue = [];
    const combatEvents = [];
    
    const simMobHp = {};
    this.combat.enemies.forEach(e => { simMobHp[e.instanceId] = e.hp; });

    const simHeroHp = {};
    this.party.forEach((h, idx) => { simHeroHp[idx] = h.hp; });

    const castInterrupted = {};
    const selfGuardAc = {};
    const guardedBy = {};

    this.party.forEach((hero, index) => {
      if (this.combat.round === 1 && this.combat.alertedRound) return;
      if (hero.hp <= 0) return;
      const cmd = this.combat.queuedCommands[index] || this.combat.previousCommands[index];
      if (!cmd || cmd.type !== 'GUARD') return;
      const targetIdx = cmd.guardTargetIndex;
      if (targetIdx == null || targetIdx < 0 || targetIdx >= this.party.length) return;
      if (this.party[targetIdx].hp <= 0) return;
      if (targetIdx === index) selfGuardAc[index] = 1;
      else guardedBy[targetIdx] = index;
    });

    this.party.forEach((hero, index) => {
      if (hero.hp <= 0) return;

      let cmd = this.combat.queuedCommands[index] || this.combat.previousCommands[index];
      if (!cmd) {
        const defaultTarget = this.combat.enemies.find(e => e.hp > 0);
        cmd = { type: 'ATTACK', targetInstanceId: defaultTarget ? defaultTarget.instanceId : null };
      }

      this.combat.previousCommands[index] = cmd;
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

    this.combat.enemies.forEach(mob => {
      if (this.combat.round === 1 && this.combat.surpriseRound) return;
      if (mob.hp <= 0 || (mob.asleepRounds || 0) > 0 || (mob.turnedRounds || 0) > 0) return;
      const consciousParty = this.party.filter(p => p.hp > 0);
      if (consciousParty.length === 0) return;

      const targetHero = consciousParty[Math.floor(Math.random() * consciousParty.length)];
      let phaseTier = mob.actionPhase === 'FAST' ? 1 : mob.actionPhase === 'SLOW' ? 3 : 2;

      actionQueue.push({ sourceType: 'MONSTER', mob: mob, targetHero: targetHero, targetHeroIndex: this.party.indexOf(targetHero), phaseTier: phaseTier });
    });

    actionQueue.sort((a, b) => a.phaseTier - b.phaseTier);

    for (const act of actionQueue) {
      const livingMobs = this.combat.enemies.filter(e => simMobHp[e.instanceId] > 0);
      if (livingMobs.length === 0) break;

      if (act.sourceType === 'HERO') {
        const { hero, heroIndex, command } = act;
        if (simHeroHp[heroIndex] <= 0) continue;

        if (command.type === 'GUARD') {
          const gIdx = command.guardTargetIndex;
          const gName = (gIdx != null && this.party[gIdx]) ? this.party[gIdx].name : 'an ally';
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
          
          let bonusChance = 20;
          const bTiers = GameState.BACKSTAB_TIERS;
          if (hero.level >= bTiers.mastery.minLevel && (hero.backstabSuccesses || 0) >= bTiers.mastery.count) {
              bonusChance += (bTiers.mastery.bonusMult * 100);
          } else if (hero.level >= bTiers.familiarity.minLevel && (hero.backstabSuccesses || 0) >= bTiers.familiarity.count) {
              bonusChance += (bTiers.familiarity.bonusMult * 100);
          }

          const chance = this.getSkillTarget(hero, 'hide_in_shadows') + bonusChance;
          const roll = Math.floor(Math.random() * 100) + 1;

          if (roll <= chance) {
            hero.backstabSuccesses = (hero.backstabSuccesses || 0) + 1;

            const rawDmg = (Math.floor(Math.random() * 8) + 2) * 2;
            const netDmg = this.applyArmorMitigation(rawDmg, 'slashing', target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            const outcome = this.evaluateAttackOutcome({
              attackerName: hero.name,
              targetName: target.name,
              weaponName: hero.equippedWeapon || 'Dagger',
              dmgType: 'slashing',
              attackMode: 'backstab',
              roll: roll,
              targetNum: chance,
              rawDmg: rawDmg,
              netDmg: netDmg,
              maxDamage: 20,
              isDead: isDead,
              isBoss: !!(target.isBoss || target.hp > 20),
              isBackstab: true
            });

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              attackMode: 'backstab',
              cueBadge: outcome.cueBadge,
              cueClass: outcome.cueClass,
              isMasterstroke: outcome.isMasterstroke,
              masterstrokeFeat: outcome.masterstrokeFeat,
              logText: outcome.logText,
              logType: outcome.logType
            });
          } else {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              attackMode: 'backstab',
              cueBadge: '💨 MISSED',
              cueClass: 'dodge',
              missLayer: 'DODGE',
              logText: `🗡️ ${hero.name}'s backstab missed ${target.name}!`,
              logType: 'warning'
            });
          }

        } else if (command.type === 'SHOOT') {
          if (!this.canHeroShoot(hero)) {
            combatEvents.push({ eventType: 'HERO_MISS', sourceName: hero.name, targetName: target.name, logText: `🏹 ${hero.name} has no ranged weapon ready — shot aborted!`, logType: 'warning' });
            continue;
          }

          const roll = Math.floor(Math.random() * 20) + 1;
          const dexVal = hero.attributes.dexterity || 10;
          const bless = hero.tempAttackBonus || 0;
          
          const mastery = this.getWeaponMastery(hero, hero.equippedWeapon);
          const targetNum = dexVal + (hero.attackBonus || 0) + this.getLevelAttackBonus(hero) + mastery.atkBonus + bless;
          const dmgType = this.getWeaponDamageType(hero.equippedWeapon, 'piercing');
          const maxWepDmg = (this.getWeaponMaxDamage(hero.equippedWeapon, 6) || 6) + mastery.dmgBonus;

          if (roll <= targetNum && roll !== 20) {
            const rawDmg = Math.floor(Math.random() * 6) + 2 + mastery.dmgBonus; 
            const netDmg = this.applyArmorMitigation(rawDmg, dmgType, target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            this.trackWeaponUsage(hero, hero.equippedWeapon);

            const outcome = this.evaluateAttackOutcome({
              attackerName: hero.name,
              targetName: target.name,
              weaponName: hero.equippedWeapon || 'Bow',
              dmgType: dmgType,
              attackMode: 'ranged',
              roll: roll,
              targetNum: targetNum,
              rawDmg: rawDmg,
              netDmg: netDmg,
              maxDamage: maxWepDmg,
              isDead: isDead,
              isBoss: !!(target.isBoss || target.hp > 20)
            });

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              attackMode: 'ranged',
              cueBadge: outcome.cueBadge,
              cueClass: outcome.cueClass,
              isMasterstroke: outcome.isMasterstroke,
              masterstrokeFeat: outcome.masterstrokeFeat,
              logText: outcome.logText,
              logType: outcome.logType
            });
          } else {
            const missOutcome = this.evaluateHeroMissOutcome({
              attackerName: hero.name,
              targetName: target.name,
              weaponName: hero.equippedWeapon || 'Bow',
              attackMode: 'ranged',
              roll: roll,
              targetArmorType: target.armorType
            });

            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              attackMode: 'ranged',
              cueBadge: missOutcome.cueBadge,
              cueClass: missOutcome.cueClass,
              missLayer: missOutcome.missLayer,
              logText: missOutcome.logText,
              logType: missOutcome.logType
            });
          }

        } else if (command.type === 'ATTACK' || !command.type) {
          if (!this.canHeroMelee(hero)) {
            combatEvents.push({ eventType: 'HERO_MISS', sourceName: hero.name, targetName: target.name, logText: `⚔️ ${hero.name} has no melee weapon ready — cannot strike!`, logType: 'warning' });
            continue;
          }

          const roll = Math.floor(Math.random() * 20) + 1;
          const strVal = hero.attributes.strength || 10;
          const bless = hero.tempAttackBonus || 0;
          
          const mastery = this.getWeaponMastery(hero, hero.equippedWeapon);
          const targetNum = strVal + (hero.attackBonus || 1) + this.getLevelAttackBonus(hero) + mastery.atkBonus + bless;
          const dmgType = this.getWeaponDamageType(hero.equippedWeapon, 'slashing');
          const maxWepDmg = (this.getWeaponMaxDamage(hero.equippedWeapon, 8) || 8) + mastery.dmgBonus;

          if (roll <= targetNum && roll !== 20) {
            const rawDmg = Math.floor(Math.random() * 8) + 2 + mastery.dmgBonus;
            const netDmg = this.applyArmorMitigation(rawDmg, dmgType, target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            this.trackWeaponUsage(hero, hero.equippedWeapon);

            const outcome = this.evaluateAttackOutcome({
              attackerName: hero.name,
              targetName: target.name,
              weaponName: hero.equippedWeapon || 'Blade',
              dmgType: dmgType,
              attackMode: 'melee',
              roll: roll,
              targetNum: targetNum,
              rawDmg: rawDmg,
              netDmg: netDmg,
              maxDamage: maxWepDmg,
              isDead: isDead,
              isBoss: !!(target.isBoss || target.hp > 20)
            });

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              attackMode: 'melee',
              cueBadge: outcome.cueBadge,
              cueClass: outcome.cueClass,
              isMasterstroke: outcome.isMasterstroke,
              masterstrokeFeat: outcome.masterstrokeFeat,
              logText: outcome.logText,
              logType: outcome.logType
            });
          } else {
            const missOutcome = this.evaluateHeroMissOutcome({
              attackerName: hero.name,
              targetName: target.name,
              weaponName: hero.equippedWeapon || 'Blade',
              attackMode: 'melee',
              roll: roll,
              targetArmorType: target.armorType
            });

            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              attackMode: 'melee',
              cueBadge: missOutcome.cueBadge,
              cueClass: missOutcome.cueClass,
              missLayer: missOutcome.missLayer,
              logText: missOutcome.logText,
              logType: missOutcome.logType
            });
          }

        } else if (command.type === 'CAST') {
          const spellIndex = command.spellIndex;
          const spell = hero.spells && hero.spells[spellIndex];
          if (!spell || spell.spent) {
            combatEvents.push({ eventType: 'HERO_MISS', sourceName: hero.name, logText: `🔮 ${hero.name}'s mind reaches for a spell that is no longer there...`, logType: 'warning' });
            continue;
          }

          const load = spell.cognitive_load || 20;
          const refund = Math.floor(load * 0.8);
          spell.spent = true;
          hero.cognition = Math.min(hero.maxCognition || 100, (hero.cognition || 0) + refund);

          if (castInterrupted[heroIndex]) {
            combatEvents.push({ eventType: 'SPELL_FIZZLE', sourceName: hero.name, spellId: spell.id, targetHeroIndex: heroIndex, logText: `💫 ${hero.name}'s ${spell.name} collapses! Concentration broken — construct erased (mind eases +${refund}).`, logType: 'danger' });
            continue;
          }

          const effect = spell.effect || {};
          const spellTarget = spell.target || 'enemy';

          if (effect.type === 'damage' && spellTarget === 'enemy') {
            const dmg = effect.amount || 12;
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - dmg);
            const isDead = simMobHp[target.instanceId] <= 0;
            combatEvents.push({
              eventType: 'MONSTER_HIT', sourceName: hero.name, targetInstanceId: target.instanceId, targetName: target.name, damage: dmg, isDead, attackMode: 'spell', spellId: spell.id,
              logText: `🔮 ${hero.name} unleashes ${spell.name} on ${target.name} for ${dmg} damage! (mind eases +${refund})`, logType: 'success'
            });
          } else if (effect.type === 'aoe_damage' && spellTarget === 'enemy') {
            let totalDamageDealt = 0;
            const hitMobs = [];
            livingMobs.forEach(mob => {
              const dmg = effect.amount || 18;
              simMobHp[mob.instanceId] = Math.max(0, simMobHp[mob.instanceId] - dmg);
              const isDead = simMobHp[mob.instanceId] <= 0;
              totalDamageDealt += dmg;
              hitMobs.push({ name: mob.name, damage: dmg, isDead });
            });
            const mobNames = hitMobs.map(m => m.name).join(', ');
            const deadCount = hitMobs.filter(m => m.isDead).length;
            combatEvents.push({
              eventType: 'MONSTER_HIT', sourceName: hero.name, targetName: mobNames, damage: totalDamageDealt, isDead: deadCount > 0, attackMode: 'spell', spellId: spell.id,
              logText: `💥 ${hero.name} unleashes ${spell.name} — ${mobNames} caught in the blast for ${totalDamageDealt} damage total! (mind eases +${refund})`, logType: 'success'
            });
          } else if (effect.type === 'party_heal' && spellTarget === 'party') {
            let totalHealed = 0;
            this.party.forEach((h, i) => {
              if (simHeroHp[i] > 0) {
                const healAmt = effect.amount || 20;
                const before = simHeroHp[i];
                simHeroHp[i] = Math.min(h.maxHp, simHeroHp[i] + healAmt);
                totalHealed += (simHeroHp[i] - before);
              }
            });
            combatEvents.push({
              eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id,
              logText: `✨ ${hero.name} invokes ${spell.name} — party recovers ${totalHealed} HP total! (mind eases +${refund})`, logType: 'success'
            });
          } else if (effect.type === 'debuff' && spellTarget === 'enemy') {
            target.debuffType = effect.debuffType || 'to_hit';
            target.debuffAmount = effect.amount || 2;
            target.debuffRounds = effect.duration_rounds || 3;
            const debuffLabel = target.debuffType === 'to_hit' ? 'to-hit penalty' : 'AC penalty';
            combatEvents.push({
              eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id,
              logText: `🌀 ${hero.name} hexes ${target.name} with ${spell.name} — ${debuffLabel} for ${target.debuffRounds} rounds! (mind eases +${refund})`, logType: 'success'
            });
          } else if (effect.type === 'sleep' && spellTarget === 'enemy') {
            const threshold = effect.max_hp_threshold || 30;
            if (simMobHp[target.instanceId] <= threshold) {
              target.asleepRounds = effect.duration_rounds || 2;
              combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `💤 ${hero.name} casts Sleep — ${target.name} collapses into slumber! (mind eases +${refund})`, logType: 'success' });
            } else {
              combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `💤 ${hero.name} casts Sleep — ${target.name} resists the drowse (too hardy). (mind eases +${refund})`, logType: 'warning' });
            }
          } else if (effect.type === 'buff_ac') {
            hero.tempAcBonus = effect.amount || 2;
            hero.tempAcRounds = effect.duration_rounds || 4;
            hero.tempAcSource = 'Arcane Shield';
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `🛡️ ${hero.name} casts Shield — a shimmering barrier forms! (+${hero.tempAcBonus} AC, ${hero.tempAcRounds} rounds) (mind eases +${refund})`, logType: 'success' });
          } else {
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `🔮 ${hero.name} casts ${spell.name}. (mind eases +${refund})`, logType: 'info' });
          }
        } else if (command.type === 'PRAY') {
          const spellIndex = command.spellIndex;
          const spell = hero.spells && hero.spells[spellIndex];
          if (!spell || spell.spent || hero.divineFavor <= 0 || hero.absoluteSilence) {
            combatEvents.push({ eventType: 'HERO_MISS', sourceName: hero.name, logText: `✨ ${hero.name}'s petition goes unanswered...`, logType: 'warning' });
            continue;
          }
          spell.spent = true;
          const effect = spell.effect || {};

          if (effect.type === 'heal') {
            let targetIdx = command.healTargetIndex;
            if (targetIdx == null || simHeroHp[targetIdx] <= 0) {
              targetIdx = 0;
              let lowest = Infinity;
              this.party.forEach((h, i) => {
                if (simHeroHp[i] > 0 && simHeroHp[i] < lowest) {
                  lowest = simHeroHp[i];
                  targetIdx = i;
                }
              });
            }
            const healAmt = effect.amount || 15;
            const before = simHeroHp[targetIdx];
            simHeroHp[targetIdx] = Math.min(this.party[targetIdx].maxHp, simHeroHp[targetIdx] + healAmt);
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `✨ ${hero.name} invokes ${spell.name} — ${this.party[targetIdx].name} recovers ${simHeroHp[targetIdx] - before} HP!`, logType: 'success' });
          } else if (effect.type === 'party_heal') {
            let totalHealed = 0;
            this.party.forEach((h, i) => {
              if (simHeroHp[i] > 0) {
                const healAmt = effect.amount || 20;
                const before = simHeroHp[i];
                simHeroHp[i] = Math.min(h.maxHp, simHeroHp[i] + healAmt);
                totalHealed += (simHeroHp[i] - before);
              }
            });
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `✨ ${hero.name} invokes ${spell.name} — party recovers ${totalHealed} HP total!`, logType: 'success' });
          } else if (effect.type === 'buff_attack') {
            this.party.forEach((h, i) => {
              if (simHeroHp[i] > 0) {
                h.tempAttackBonus = effect.amount || 1;
                h.tempAttackRounds = effect.duration_rounds || 4;
              }
            });
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `✨ ${hero.name} invokes Bless — the party is heartened (+${effect.amount || 1} attack, ${effect.duration_rounds || 4} rounds)!`, logType: 'success' });
          } else if (effect.type === 'buff_ac') {
            hero.tempAcBonus = effect.amount || 2;
            hero.tempAcRounds = effect.duration_rounds || 3;
            hero.tempAcSource = 'Sanctuary';
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `✨ ${hero.name} invokes Sanctuary — a divine ward turns blows (+${hero.tempAcBonus} AC, ${hero.tempAcRounds} rounds)!`, logType: 'success' });
          } else {
            combatEvents.push({ eventType: 'SPELL_CAST', sourceName: hero.name, spellId: spell.id, logText: `✨ ${hero.name} invokes ${spell.name}.`, logType: 'info' });
          }
        } else if (command.type === 'TURN') {
          if (hero.classKey !== 'cleric' || hero.divineFavor <= 0 || hero.absoluteSilence) {
            combatEvents.push({ eventType: 'HERO_MISS', sourceName: hero.name, logText: `✨ ${hero.name} raises the holy symbol — but the heavens are silent.`, logType: 'warning' });
            continue;
          }

          const undead = livingMobs.filter(e => e.creatureType === 'undead' && simMobHp[e.instanceId] > 0);
          if (undead.length === 0) {
            combatEvents.push({ eventType: 'TURN_UNDEAD', sourceName: hero.name, logText: `✨ ${hero.name} brandishes the holy symbol — no undead abominations present.`, logType: 'muted' });
            continue;
          }

          const roll = Math.floor(Math.random() * 20) + 1;
          const skillBonus = Math.floor((this.getSkillTarget(hero, 'turn_undead') - 14) / 3);
          const effectiveRoll = roll + Math.max(0, skillBonus);

          let destroyed = 0, fled = 0, resisted = 0;

          undead.forEach(mob => {
            const need = this.getTurnUndeadTarget(hero.level || 1, mob.undeadTier || 'weak');
            if (need == null) { resisted++; return; }
            if (need === 'D' || effectiveRoll >= 20) {
              simMobHp[mob.instanceId] = 0;
              destroyed++;
            } else if (effectiveRoll >= need) {
              mob.turnedRounds = 3;
              fled++;
            } else { resisted++; }
          });

          let detail = [];
          if (destroyed) detail.push(`${destroyed} destroyed`);
          if (fled) detail.push(`${fled} flee in terror`);
          if (resisted) detail.push(`${resisted} unfazed`);
          combatEvents.push({ eventType: 'TURN_UNDEAD', sourceName: hero.name, logText: `✨ ${hero.name} asserts divine authority! (d20=${roll}${skillBonus > 0 ? `+${skillBonus}` : ''}) — ${detail.join(', ') || 'no effect'}.`, logType: destroyed || fled ? 'success' : 'warning' });
        }

      } else if (act.sourceType === 'MONSTER') {
        const { mob, targetHero, targetHeroIndex } = act;
        if (simMobHp[mob.instanceId] <= 0 || simHeroHp[targetHeroIndex] <= 0) continue;

        let finalHeroIndex = targetHeroIndex;
        let finalHero = targetHero;
        let redirected = false;
        const guardianIdx = guardedBy[targetHeroIndex];
        
        if (guardianIdx != null && simHeroHp[guardianIdx] > 0) {
          finalHeroIndex = guardianIdx;
          finalHero = this.party[guardianIdx];
          redirected = true;
        }

        const guardBonus = selfGuardAc[finalHeroIndex] || 0;
        const spellAc = (this.party[finalHeroIndex] && this.party[finalHeroIndex].tempAcBonus) || 0;
        const debuffAcPenalty = (mob.debuffType === 'ac' && (mob.debuffRounds || 0) > 0) ? mob.debuffAmount : 0;
        
        // AD&D 2nd Edition Descending AC:
        // Lower AC is better. Guard stance (-1 AC) and spells like Shield/Sanctuary (-2 AC) improve defense.
        const baseHeroAc = finalHero.armorClass != null ? finalHero.armorClass : 5;
        const effectiveHeroAc = baseHeroAc - guardBonus - spellAc + debuffAcPenalty;

        // Attacker THAC0
        const mobThaco = this.getMonsterThaco(mob);

        // Required d20 roll to hit: Attacker THAC0 - Defender AC
        // In 2e, target cannot exceed 20 (natural 20 always hits) or be below 2 (natural 1 always misses).
        const rawTargetToHit = mobThaco - effectiveHeroAc;
        const targetToHit = Math.max(2, Math.min(20, rawTargetToHit));

        const roll = Math.floor(Math.random() * 20) + 1;
        const toHitPenalty = (mob.debuffType === 'to_hit' && (mob.debuffRounds || 0) > 0) ? mob.debuffAmount : 0;
        const adjustedRoll = roll - toHitPenalty;

        // Hit logic: Natural 20 always hits, natural 1 always misses.
        // Otherwise hit if adjusted roll meets or exceeds target to hit.
        const isHit = (roll === 20) || (roll !== 1 && adjustedRoll >= targetToHit);

        if (isHit) {
          const rawDmg = this.rollMonsterDamage(mob.damage);
          const maxMobDmg = this.getMonsterMaxDamage(mob.damage);
          simHeroHp[finalHeroIndex] = Math.max(0, simHeroHp[finalHeroIndex] - rawDmg);
          let isDead = simHeroHp[finalHeroIndex] <= 0;
          castInterrupted[finalHeroIndex] = true;

          const rollRatio = rawDmg / Math.max(1, maxMobDmg);
          const isHeavy = (roll === 20 || rollRatio >= 0.75);
          const isLow = (rawDmg <= 2 && rollRatio <= 0.35);

          let cueBadge = `🩸 -${rawDmg}`;
          let cueClass = 'normal';
          let logText = '';

          if (isHeavy) {
            cueBadge = `💀 -${rawDmg} CRUSHING!`;
            cueClass = 'heavy';
            logText = redirected
              ? `💥 CRITICAL IMPACT: ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and takes a devastating ${rawDmg} damage!`
              : `💥 CRITICAL IMPACT: ${mob.name} catches ${finalHero.name} with a crushing blow for ${rawDmg} damage!`;
          } else if (isLow) {
            cueBadge = `🩸 -${rawDmg}`;
            cueClass = 'graze';
            logText = redirected
              ? `💥 ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and absorbs ${rawDmg} minor damage.`
              : `💥 ${mob.name} nicks ${finalHero.name} through a gap in the armor for ${rawDmg} minor damage.`;
          } else {
            cueBadge = `🩸 -${rawDmg}`;
            cueClass = 'normal';
            logText = redirected
              ? `💥 ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and takes ${rawDmg} damage!`
              : `💥 ${mob.name} strikes ${finalHero.name} for ${rawDmg} damage!`;
          }

          combatEvents.push({
            eventType: 'HERO_HIT',
            sourceName: mob.name,
            targetHeroIndex: finalHeroIndex,
            targetHeroName: finalHero.name,
            damage: rawDmg,
            isDead: isDead,
            redirected: redirected,
            cueBadge: cueBadge,
            cueClass: cueClass,
            logText: logText,
            logType: 'danger'
          });

          // Saving throw trigger for monsters with venom, paralyzation, breath, or spells
          if (!isDead && (mob.special_attack || mob.save_category)) {
            const saveCat = mob.save_category || (mob.special_attack === 'poison' ? 'poison' : 'spell');
            const saveSub = mob.special_attack || 'poison';
            const saveRes = this.checkSavingThrow(finalHero, saveCat, saveSub);
            
            if (saveRes.success) {
              const modStr = saveRes.abilityMod ? (saveRes.abilityMod > 0 ? `+${saveRes.abilityMod}` : `${saveRes.abilityMod}`) : '';
              combatEvents.push({
                eventType: 'SAVE_SUCCESS',
                savingThrow: saveRes,
                targetHeroIndex: finalHeroIndex,
                targetHeroName: finalHero.name,
                sourceName: mob.name,
                logText: `🛡️ HEROIC FORTITUDE: ${saveRes.narrative} [d20=${saveRes.roll}${modStr} vs Target ${saveRes.target}]`,
                logType: 'success'
              });
            } else {
              const extraDmg = mob.poison_damage || mob.special_damage || 4;
              simHeroHp[finalHeroIndex] = Math.max(0, simHeroHp[finalHeroIndex] - extraDmg);
              isDead = simHeroHp[finalHeroIndex] <= 0;
              const modStr = saveRes.abilityMod ? (saveRes.abilityMod > 0 ? `+${saveRes.abilityMod}` : `${saveRes.abilityMod}`) : '';
              combatEvents.push({
                eventType: 'SAVE_FAILURE',
                savingThrow: saveRes,
                targetHeroIndex: finalHeroIndex,
                targetHeroName: finalHero.name,
                damage: extraDmg,
                isDead: isDead,
                sourceName: mob.name,
                logText: `💀 MORTAL BREACH: ${saveRes.narrative} (Takes +${extraDmg} toxic damage! d20=${saveRes.roll}${modStr} vs Target ${saveRes.target})`,
                logType: 'danger'
              });
            }
          }
        } else {
          // Layered defensive resolution: Determine the exact layer that foiled the attack
          const unarmoredThreshold = mobThaco - 10;
          const dexAdj = GameState.getDexDefensiveAdjustment ? GameState.getDexDefensiveAdjustment(finalHero.attributes?.dexterity || 10) : 0;
          const dexBonus = Math.abs(Math.min(0, dexAdj));
          const dexThreshold = unarmoredThreshold + dexBonus;

          const shieldBonus = (finalHero.equippedShield && (finalHero.equippedShield.acBonus || 1)) || 0;
          const shieldThreshold = dexThreshold + shieldBonus;

          const guardThreshold = shieldThreshold + guardBonus;
          const spellThreshold = guardThreshold + spellAc;

          let missLayer = 'ARMOR';
          let cueBadge = '⚙️ DEFLECTED';
          let cueClass = 'armor';
          let logText = '';

          if (adjustedRoll < unarmoredThreshold || roll === 1) {
            missLayer = 'DODGE';
            cueBadge = '💨 EVADED';
            cueClass = 'dodge';
            logText = redirected
              ? `💨 ${mob.name} lunges wildly at ${targetHero.name} — ${finalHero.name} intercepts and easily sidesteps the blow!`
              : `💨 EVADED: ${finalHero.name} smoothly sidesteps ${mob.name}'s wild strike — biting empty air!`;
          } else if (dexBonus > 0 && adjustedRoll < dexThreshold) {
            missLayer = 'DODGE';
            cueBadge = '💨 DODGED';
            cueClass = 'dodge';
            logText = redirected
              ? `💨 ${finalHero.name}'s quick reflexes turn ${mob.name}'s strike aside from ${targetHero.name}!`
              : `💨 DODGED: ${finalHero.name}'s lightning reflexes turn ${mob.name}'s lethal stroke into a clean miss!`;
          } else if (shieldBonus > 0 && adjustedRoll < shieldThreshold) {
            missLayer = 'SHIELD';
            cueBadge = '🛡️ BLOCKED';
            cueClass = 'shield';
            const shieldName = (finalHero.equippedShield && finalHero.equippedShield.name) || 'shield';
            logText = redirected
              ? `🛡️ SHIELD BLOCK: ${finalHero.name} intercepts ${mob.name}'s strike with the rim of the ${shieldName}!`
              : `🛡️ SHIELD BLOCK: ${finalHero.name} catches ${mob.name}'s blow cleanly on the iron rim of the ${shieldName}!`;
          } else if (guardBonus > 0 && adjustedRoll < guardThreshold) {
            missLayer = 'GUARD';
            cueBadge = '🛡️ GUARDED';
            cueClass = 'shield';
            logText = `🛡️ TACTICAL GUARD: ${finalHero.name}'s disciplined guard parries ${mob.name}'s assault!`;
          } else if (spellAc > 0 && adjustedRoll < spellThreshold) {
            missLayer = 'SPELL';
            cueBadge = '✨ WARDED';
            cueClass = 'ward';
            const spellSrc = finalHero.tempAcSource || 'Arcane Shield';
            logText = `✨ WARDED: A radiant barrier of ${spellSrc} flares around ${finalHero.name}, absorbing ${mob.name}'s blow!`;
          } else {
            missLayer = 'ARMOR';
            cueBadge = '⚙️ DEFLECTED';
            cueClass = 'armor';
            const armorName = (finalHero.equippedArmor && finalHero.equippedArmor.name) || 'armor';
            logText = redirected
              ? `⚙️ ARMOR DEFLECTION: ${finalHero.name} intercepts ${mob.name}'s strike — the blow rings harmlessly off the ${armorName}!`
              : `⚙️ ARMOR DEFLECTION: ${mob.name}'s blade strikes ${finalHero.name}'s ${armorName} with a shower of sparks, glancing off harmlessly!`;
          }

          combatEvents.push({
            eventType: 'MONSTER_MISS',
            sourceName: mob.name,
            targetHeroName: redirected ? finalHero.name : targetHero.name,
            targetHeroIndex: finalHeroIndex,
            missLayer: missLayer,
            cueBadge: cueBadge,
            cueClass: cueClass,
            logText: logText,
            logType: 'muted'
          });
        }
      }
    }

    const aliveAfter = this.combat.enemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0);
    const livingHeroes = Object.values(simHeroHp).filter(hp => hp > 0).length;
    let victory = false, partyWiped = false, totalXp = 0;
    
    if (aliveAfter.length === 0) {
      victory = true;
      totalXp = this.combat.enemies.reduce((sum, e) => sum + (e.xpReward || 0), 0);
      combatEvents.push({ eventType: 'VICTORY', logText: `🏆 COMBAT VICTORIOUS! Acquired +${totalXp} XP!`, logType: 'success' });
    } else if (livingHeroes === 0) {
      partyWiped = true;
      combatEvents.push({ eventType: 'PARTY_WIPED', logText: `💀 The last of the company falls. The flooded dark claims its due.`, logType: 'danger' });
    }

    this.combat.queuedCommands = {};

    return { events: combatEvents, finalMobHp: simMobHp, finalHeroHp: simHeroHp, victory, partyWiped, totalXp };
  }

  commitCombatRoundResults(finalMobHp, finalHeroHp, victory, totalXp) {
    this.combat.enemies.forEach(e => {
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
    
    this.party.forEach((h, idx) => {
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

    this.combat.round += 1;
    if (victory) {
      this.combat.active = false;
      if (totalXp > 0) {
        this.awardQuestXP(totalXp);
      }
    }
  }

  /**
   * Awards quest / combat XP divided equally among living party members.
   * Marks heroes as eligible for level-up rather than auto-advancing them in the dungeon.
   */
  awardQuestXP(amount) {
    if (!amount || amount <= 0) return [];

    // Only living heroes earn XP; dead/incapacitated heroes do not earn XP
    const livingHeroes = this.party.filter(hero => hero.hp > 0);
    if (livingHeroes.length === 0) return [];

    const share = Math.max(1, Math.floor(amount / livingHeroes.length));
    const newlyReadyHeroes = [];

    livingHeroes.forEach(hero => {
      hero.xp = (hero.xp || 0) + share;
      if (hero.xp >= hero.nextLevelXp && hero.level < 10) {
        if (!hero.canLevelUp) {
          hero.canLevelUp = true;
          newlyReadyHeroes.push(hero);
          this.addLog(`⭐ ${hero.name} has gained enough experience (${hero.xp}/${hero.nextLevelXp} XP) to advance to Level ${hero.level + 1}! Return to the village to train and advance.`, "success");
        }
      }
    });

    return newlyReadyHeroes;
  }

  /**
   * Prepares the options and rolled metrics for a hero's training advancement modal.
   */
  calculateLevelUpOptions(heroIndex) {
    const hero = this.party[heroIndex];
    if (!hero) return null;

    const archetype = this.classesSpec?.archetypes?.[hero.classKey] || {};
    const hitDie = archetype.hit_die || (hero.classKey === 'fighter' ? 10 : hero.classKey === 'cleric' ? 8 : hero.classKey === 'thief' ? 6 : 4);
    const conMod = this.getConHpModifier(hero);
    const nextLevel = hero.level + 1;
    const rolledDie = Math.floor(Math.random() * hitDie) + 1;
    const calculatedHpGain = Math.max(1, rolledDie + conMod);
    const atkGrowth = GameState.ATTACK_BONUS_GROWTH[hero.classKey] ?? 0.5;

    // Available unlearned spells for Casters
    let availableSpells = [];
    if (hero.classKey === 'mage') {
      const spellTiers = archetype.vancian_magic?.spell_tiers || {};
      Object.entries(spellTiers).forEach(([tierStr, spells]) => {
        const tierNum = parseInt(tierStr, 10);
        // Spells available up to the unlocked tier (tier 1 at L1, tier 2 at L3, tier 3 at L6, tier 4 at L9)
        const maxAllowedTier = nextLevel >= 9 ? 4 : nextLevel >= 6 ? 3 : nextLevel >= 3 ? 2 : 1;
        if (tierNum <= maxAllowedTier) {
          spells.forEach(s => {
            if (!hero.spells.some(hs => hs.id === s.id)) {
              availableSpells.push({ ...s, tier: tierNum });
            }
          });
        }
      });
    } else if (hero.classKey === 'cleric') {
      const spellTiers = archetype.spells_available_by_tier || {};
      Object.entries(spellTiers).forEach(([tierStr, spells]) => {
        const tierNum = parseInt(tierStr, 10);
        const maxAllowedTier = nextLevel >= 9 ? 4 : nextLevel >= 6 ? 3 : nextLevel >= 3 ? 2 : 1;
        if (tierNum <= maxAllowedTier) {
          spells.forEach(s => {
            if (!hero.spells.some(hs => hs.id === s.id)) {
              availableSpells.push({ ...s, tier: tierNum });
            }
          });
        }
      });
    }

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
      thiefPoints: hero.classKey === 'thief' ? (archetype.discretionary_skill_points_per_level || 15) : 0,
      skills: hero.skills ? JSON.parse(JSON.stringify(hero.skills)) : {},
      availableSpells
    };
  }

  /**
   * Applies the finalized training advancement choices made by the player.
   */
  applyLevelUp(heroIndex, choices) {
    const hero = this.party[heroIndex];
    if (!hero) return { success: false, reason: "Hero not found." };
    if (!hero.canLevelUp) return { success: false, reason: "Hero is not ready to level up." };

    const oldLevel = hero.level;
    const hpGain = choices.hpGain || 5;
    const atkGrowth = GameState.ATTACK_BONUS_GROWTH[hero.classKey] ?? 0.5;

    hero.level += 1;
    hero.nextLevelXp = this.getXPForNextLevel(hero.classKey, hero.level);
    hero.canLevelUp = (hero.xp >= hero.nextLevelXp && hero.level < 10);

    // Apply HP
    hero.maxHp += hpGain;
    hero.hp = Math.min(hero.maxHp, hero.hp + hpGain);

    // Apply Attack Bonus
    hero.attackBonus = (hero.attackBonus || 1) + atkGrowth;

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
        choices.newSpells.forEach(spellDef => {
          if (!hero.spells.some(s => s.id === spellDef.id)) {
            hero.spells.push({
              id: spellDef.id,
              name: spellDef.name,
              level: spellDef.level || 1,
              cognitive_load: spellDef.cognitive_load || 20,
              casting_time: spellDef.casting_time || 'normal',
              target: spellDef.target || 'enemy',
              effect: spellDef.effect ? { ...spellDef.effect } : null,
              description: spellDef.description || '',
              spent: false
            });
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

    this.addLog(`⭐ ${hero.name} has finished intensive training in town and attained Level ${hero.level}! (+${hpGain} HP, +${atkGrowth.toFixed(2)} to-hit)`, "success");

    return {
      success: true,
      heroName: hero.name,
      heroIndex,
      oldLevel,
      newLevel: hero.level,
      hpGain,
      maxHp: hero.maxHp,
      attackBonus: hero.attackBonus,
      classKey: hero.classKey
    };
  }

  // ===========================================================================
  // EXPLORATION & DUNGEONEERING
  // ===========================================================================

  attemptPickpocket(npc) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief || thief.hp <= 0) return { success: false, reason: "Thief is incapacitated or missing." };
    if (!npc.inventory_to_steal || npc.inventory_to_steal.length === 0) return { success: false, reason: "Target has nothing left to steal." };
    
    const chance = this.getSkillTarget(thief, 'pick_pockets');
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= chance) {
      const stolenItem = npc.inventory_to_steal.shift();
      this.inventory.push(stolenItem);
      return { success: true, roll, chance, stolenItem };
    } else {
      const npcState = this.getNPCState(npc.id);
      npcState.attitude = Math.max(-100, npcState.attitude - 40);
      npcState.endBehavior = 'despawn';
      const nearby = (this.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y)) <= 2);
      if (nearby) nearby.alerted = true;
      return { success: false, roll, chance, detected: true };
    }
  }

  attemptHideInShadows() {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false, roll: 0, chance: 0 };
    const chance = this.getSkillTarget(thief, 'hide_in_shadows');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    thief.isStealth = success;
    return { success, roll, chance };
  }

  isFacingWall() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;
    const tx = this.player.x + dx, ty = this.player.y + dy;
    if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) return true;
    return this.spec.map[ty][tx] === 1;
  }

  getTrapInFront() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    if (this.player.facing === 'SOUTH') dy = 1;
    if (this.player.facing === 'EAST') dx = 1;
    if (this.player.facing === 'WEST') dx = -1;
    const tx = this.player.x + dx, ty = this.player.y + dy;
    
    if (ty >= 0 && ty < this.spec.map.length && tx >= 0 && tx < this.spec.map[0].length) {
      const tileId = this.spec.map[ty][tx];
      const tileDef = this.spec.legend[tileId];
      const key = `${tx},${ty}`;
      if (tileDef && tileDef.trap && !this.disarmedTraps.has(key)) {
        return { x: tx, y: ty, ...tileDef.trap, detected: this.detectedTraps.has(key) };
      }
    }
    return null;
  }

  attemptFindTrap(target) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false, roll: 0, chance: 0 };
    const chance = this.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    if (success) this.detectedTraps.add(`${target.x},${target.y}`);
    return { success, roll, chance };
  }

  attemptDisarmTrap(target) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, triggered: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, triggered: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    thief.toolsDurability = Math.max(0, thief.toolsDurability - 4);
    const chance = this.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const key = `${target.x},${target.y}`;
    
    if (roll <= chance) {
      this.disarmedTraps.add(key);
      return { success: true, triggered: false, roll, chance, durability: thief.toolsDurability };
    } 
    // In AD&D 2e, a trap only springs inadvertently on a fumble (roll > 95)
    if (roll > 95) {
      this.disarmedTraps.add(key);
      const trapResult = this.triggerTrap(target);
      return { success: false, triggered: true, roll, chance, trapResult, durability: thief.toolsDurability };
    } else {
      // Normal failure: the mechanism resists, but the trap is not sprung
      return { success: false, triggered: false, roll, chance, durability: thief.toolsDurability };
    }
  }

  attemptScout(range = 3) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "No conscious thief in the party." };
    if (this.isFacingWall()) return { success: false, reason: "Solid stone blocks the way ahead." };

    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;

    const chance = this.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    const discoveries = [];

    if (success) {
      thief.shadowcraftSuccesses = (thief.shadowcraftSuccesses || 0) + 1;

      for (let step = 1; step <= range; step++) {
        const tx = this.player.x + dx * step, ty = this.player.y + dy * step;
        if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) break;
        const tileId = this.spec.map[ty][tx];
        if (tileId === 1) break; 

        const key = `${tx},${ty}`;
        const tileDef = this.spec.legend[tileId];
        if (tileDef && tileDef.trap && !this.disarmedTraps.has(key)) {
          this.detectedTraps.add(key);
          discoveries.push({ type: 'trap', x: tx, y: ty, name: tileDef.trap.name });
        }
        const enc = (this.spec.encounters || []).find(e => e.x === tx && e.y === ty && !e.completed);
        if (enc) {
          enc.scouted = true;
          discoveries.push({ type: 'encounter', x: tx, y: ty, name: enc.name || 'hostiles' });
        }
      }
    } else {
      const nearby = (this.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y)) <= range);
      if (nearby) nearby.alerted = true;
    }
    return { success, roll, chance, discoveries };
  }

  checkPassiveHearNoise() {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return null;

    const nearby = (this.spec.encounters || []).find(e => {
      if (e.completed) return false;
      const dist = Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y));
      return dist > 0 && dist <= 2;
    });
    if (!nearby) return null;

    const chance = this.getSkillTarget(thief, 'hear_noise');
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll > chance) return null;

    const dx = nearby.x - this.player.x, dy = nearby.y - this.player.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north');
    return { heroName: thief.name, direction: dir };
  }

  attemptSneakPastEncounter(encounter) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief || !thief.isStealth) return { success: false, reason: "Not sneaking." };

    const consciousCount = this.party.filter(p => p.hp > 0).length;
    let penalty = Math.max(0, consciousCount - 1) * 5;

    const sTiers = GameState.SHADOW_TIERS;
    if (thief.level >= sTiers.familiarity.minLevel && (thief.shadowcraftSuccesses || 0) >= sTiers.familiarity.count) {
        penalty = Math.max(0, penalty - sTiers.familiarity.penaltyRelief);
    }

    const chance = Math.max(5, this.getSkillTarget(thief, 'hide_in_shadows') - penalty);
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

  triggerTrap(trapDef) {
    const totalDamage = trapDef.damage || 15;
    const category = trapDef.saveCategory || 'breath';
    const subCategory = trapDef.subCategory || trapDef.name;
    const activeMembers = this.party.filter(p => p.hp > 0);
    if (activeMembers.length === 0) return { totalDamage, category, damagePerPlayer: 0, results: [] };

    const damagePerPlayer = Math.ceil(totalDamage / activeMembers.length);
    const results = activeMembers.map(member => {
      const save = this.checkSavingThrow(member, category, subCategory);
      const damage = save.success ? Math.ceil(damagePerPlayer / 2) : damagePerPlayer;
      member.hp = Math.max(0, member.hp - damage);
      return { heroName: member.name, heroIndex: this.party.indexOf(member), save, damage, isDead: member.hp <= 0 };
    });

    return { totalDamage, category, damagePerPlayer, results };
  }

  checkSavingThrow(hero, category, subCategory = null, dcBonus = 0) {
    return resolveSavingThrow(hero, category, subCategory, dcBonus);
  }

  attemptPickLock(targetType) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    const roll = Math.floor(Math.random() * 100) + 1;
    const wear = (roll > 95) ? 10 : 4;
    thief.toolsDurability = Math.max(0, thief.toolsDurability - wear);

    const chance = this.getSkillTarget(thief, 'pick_locks');
    const success = roll <= chance;
    return { success, roll, chance, durability: thief.toolsDurability, fumbled: roll > 95 };
  }

  unlockTarget(x, y, type) {
    const key = `${x},${y}`;
    if (type === 'door') this.unlockedDoors.add(key);
    if (type === 'chest') this.unlockedChests.add(key);
  }

  isWalkable(x, y) {
    if (y < 0 || y >= this.spec.map.length || x < 0 || x >= this.spec.map[0].length) return false;
    const tileId = this.spec.map[y][x];
    if ((tileId === 2 || tileId === 8) && this.openedDoors.has(`${x},${y}`)) return true;
    const tileDef = this.spec.legend[tileId];
    return tileDef && tileDef.walkable;
  }

  moveForward() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    if (this.player.facing === 'SOUTH') dy = 1;
    if (this.player.facing === 'EAST') dx = 1;
    if (this.player.facing === 'WEST') dx = -1;
    const targetX = this.player.x + dx, targetY = this.player.y + dy;
    if (this.isWalkable(targetX, targetY)) {
      this.player.x = targetX; this.player.y = targetY; return true;
    }
    return false;
  }

  moveBackward() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = 1;
    if (this.player.facing === 'SOUTH') dy = -1;
    if (this.player.facing === 'EAST') dx = -1;
    if (this.player.facing === 'WEST') dx = 1;
    const targetX = this.player.x + dx, targetY = this.player.y + dy;
    if (this.isWalkable(targetX, targetY)) {
      this.player.x = targetX; this.player.y = targetY; return true;
    }
    return false;
  }

  rotate(direction) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(this.player.facing);
    index = direction === 'RIGHT' ? (index + 1) % 4 : (index - 1 + 4) % 4;
    this.player.facing = directions[index];
  }

  markDoorOpen(x, y) { this.openedDoors.add(`${x},${y}`); }

  openChest(x, y) {
    const key = `${x},${y}`;
    if (this.openedChests.has(key)) return null;
    this.openedChests.add(key);
    let generatedLoot = null;
    if (this.spec.chests && this.spec.chests[key]) {
      generatedLoot = JSON.parse(JSON.stringify(this.spec.chests[key]));
    } else {
      generatedLoot = [{ name: "Healing Potion", type: "consumable" }, { name: "Gold Pieces", amount: 75, type: "currency" }];
    }
    generatedLoot.forEach(item => {
      this.addPartyItem(item.name, item.amount || 1);
    });
    return generatedLoot;
  }

  checkInteractionTrigger(x, y) {
    if (!this.spec.interactions) return null;
    const key = `${x},${y}`;
    if (this.triggeredEvents.has(key)) return null;
    const trigger = this.spec.interactions.find(t => t.x === x && t.y === y);
    if (trigger) { this.triggeredEvents.add(key); return trigger; }
    return null;
  }

  getLockInFront() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;
    const tx = this.player.x + dx, ty = this.player.y + dy;
    if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) return null;
    
    const tileId = this.spec.map[ty][tx];
    const tileDef = this.spec.legend[tileId];
    const key = `${tx},${ty}`;
    
    if (tileDef && tileDef.locked && !this.unlockedDoors.has(key) && !this.unlockedChests.has(key)) {
      return { x: tx, y: ty, methods: tileDef.locked.methods, dc: tileDef.locked.dc, type: (tileId === 2 || tileId === 8) ? 'door' : 'chest', tileDef: tileDef };
    }
    return null;
  }

  attemptBash(fighter) {
    const target = this.getSkillTarget(fighter, 'bash');
    const roll = Math.floor(Math.random() * 20) + 1;
    return { success: (roll <= target) && (roll !== 20), roll, target };
  }

  attemptReadMagic(mage, lock) {
    const cogCost = 15;
    if (mage.cognition < cogCost) return { success: false, reason: "Insufficient cognition!" };
    mage.cognition -= cogCost;
    const target = this.getSkillTarget(mage, 'read_magic');
    const roll = Math.floor(Math.random() * 20) + 1;
    return { success: (roll <= target) && (roll !== 20), roll, target };
  }

  // ===========================================================================
  // MAGIC & REST SYSTEMS
  // ===========================================================================

  restParty() {
    if (!this.inventory) this.inventory = [];
    let rationItem = this.inventory.find(i => {
      const name = (i.name || "").toLowerCase();
      return name.includes("ration") || name.includes("food");
    });

    if (!rationItem) return { success: false, reason: "The party has no Rations left to camp!" };

    const qtyKey = rationItem.amount !== undefined ? 'amount' : (rationItem.count !== undefined ? 'count' : 'amount');
    const currentQty = rationItem[qtyKey] !== undefined ? rationItem[qtyKey] : 0;

    if (currentQty <= 0) return { success: false, reason: "The party has no Rations left to camp!" };

    rationItem[qtyKey] = currentQty - 1;
    if (rationItem[qtyKey] <= 0) this.inventory = this.inventory.filter(i => i !== rationItem);

    const recoveries = [];
    this.party.forEach(member => {
      if (member.hp <= 0) {
        recoveries.push({ name: member.name, hpGained: 0, note: 'stabilized only' });
        return;
      }

      const conBonus = Math.floor(((member.attributes && member.attributes.constitution) || 10) - 10) / 2;
      const base = Math.max(3, Math.floor(member.maxHp * 0.35));
      const gained = Math.max(2, Math.floor(base + conBonus));
      const before = member.hp;
      member.hp = Math.min(member.maxHp, member.hp + gained);

      member.tempAcBonus = 0; member.tempAcRounds = 0;
      member.tempAttackBonus = 0; member.tempAttackRounds = 0;

      if (member.classKey === 'mage') {
        member.cognition = member.maxCognition;
        member.hasStudiedSinceRest = false;
      }
      if (member.classKey === 'cleric') {
        member.divineFavor = Math.min(member.maxDivineFavor, (member.divineFavor || 0) + 12);
        if (member.divineFavor > 0) member.absoluteSilence = false;
        member.hasPrayedSinceRest = false;
        this.#syncClericEthos(member);
      }

      recoveries.push({ name: member.name, hpGained: member.hp - before, hp: member.hp, maxHp: member.maxHp });
    });

    return { success: true, remainingRations: rationItem[qtyKey] || 0, recoveries };
  }

  checkRestAmbush() {
    const incomplete = (this.spec.encounters || []).filter(e => !e.completed);
    if (incomplete.length === 0) return null;

    const px = this.player.x, py = this.player.y;
    const nearby = incomplete.filter(e => Math.abs((e.x || 0) - px) + Math.abs((e.y || 0) - py) <= 4);

    const chance = nearby.length > 0 ? 35 : 12;
    if (Math.random() * 100 >= chance) return null;

    const pool = nearby.length > 0 ? nearby : incomplete;
    pool.sort((a, b) => (Math.abs(a.x - px) + Math.abs(a.y - py)) - (Math.abs(b.x - px) + Math.abs(b.y - py)));
    return pool[0];
  }

  applyMoralTax(baseTax, activeSpeaker, customMultiplier = null) {
    if (!baseTax || baseTax === 0) return;
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric || cleric.hp <= 0) {
      this.addLog("The Cleric is unconscious; spiritual consequences pass unheeded.", "warning");
      return;
    }

    const isClericSpeaker = (activeSpeaker && activeSpeaker.classKey === 'cleric');
    const effectiveMultiplier = customMultiplier !== null ? customMultiplier : (isClericSpeaker ? 2.0 : 1.0);
    const finalDelta = Math.round(baseTax * effectiveMultiplier);
    const previousFavor = cleric.divineFavor;

    cleric.divineFavor = Math.min(100, Math.max(0, cleric.divineFavor + finalDelta));
    const actualDelta = cleric.divineFavor - previousFavor;

    if (actualDelta < 0) {
      if (isClericSpeaker) this.addLog(`DIRECT TRANSGRESSION! The Cleric's personal action lost ${Math.abs(actualDelta)}% Divine Favor!`, "danger");
      else this.addLog(`Complicity Tax: The Cleric loses ${Math.abs(actualDelta)}% Divine Favor for allowing this act.`, "danger");
    } else if (actualDelta > 0) {
      if (isClericSpeaker) this.addLog(`DIVINE EXALTATION! The Cleric's holy leadership restored +${actualDelta}% Divine Favor!`, "success");
      else this.addLog(`Virtuous Conduct: The party's decision pleases the gods (+${actualDelta}% Divine Favor).`, "success");
    }

    if (cleric.divineFavor === 0) {
      cleric.absoluteSilence = true;
      this.addLog("CRITICAL WARNING: Absolute Silence triggered! Divine communion is severed!", "danger");
    } else if (cleric.divineFavor > 0 && cleric.absoluteSilence) {
      cleric.absoluteSilence = false;
      this.addLog("The Cleric's Divine Link has been restored.", "success");
    }
    this.#syncClericEthos(cleric);
  }

  modifyDivineFavor(delta) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return;
    cleric.divineFavor = Math.max(0, Math.min(cleric.maxDivineFavor, cleric.divineFavor + delta));
    this.#syncClericEthos(cleric);
  }

  studyClericPrayers() {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (this.combat.active) return { success: false, reason: "Cannot petition during combat!" };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return { success: false, reason: "Absolute Silence — the deity does not answer." };
    if (!cleric.spells.some(s => s.spent)) return { success: false, reason: "Today's prayers are already granted and held." };

    let restored = 0;
    if (cleric.divineFavor < 25) {
      const spent = cleric.spells.filter(s => s.spent);
      const allow = Math.max(1, Math.ceil(spent.length / 2));
      spent.slice(0, allow).forEach(s => { s.spent = false; restored++; });
    } else {
      cleric.spells.forEach(s => { if (s.spent) { s.spent = false; restored++; } });
    }
    cleric.hasPrayedSinceRest = true;
    this.#syncClericEthos(cleric);
    return { success: true, restored, status: cleric.ethosStatus, divineFavor: cleric.divineFavor };
  }

  castClericPrayer(spellIndex, targetHeroIndex = null) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (cleric.hp <= 0) return { success: false, reason: "The cleric is incapacitated and cannot invoke prayers." };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return { success: false, reason: "Absolute Silence — no divine power flows." };
    if (!cleric.spells[spellIndex] || cleric.spells[spellIndex].spent) return { success: false, reason: "That prayer was already invoked today." };
    
    const spell = cleric.spells[spellIndex];
    const effect = spell.effect || {};

    if (effect.type === 'heal') {
      let target = null;
      let targetIdx = targetHeroIndex;

      // If no target index provided, auto-select the most wounded hero
      if (targetIdx == null || targetIdx < 0 || targetIdx >= this.party.length) {
        let lowestHpRatio = 1.0;
        let candidateIdx = null;
        this.party.forEach((h, i) => {
          if (h.hp < h.maxHp) {
            const ratio = h.hp / h.maxHp;
            if (ratio < lowestHpRatio) {
              lowestHpRatio = ratio;
              candidateIdx = i;
            }
          }
        });
        if (candidateIdx === null) {
          return { success: false, reason: "All party members are already at full health." };
        }
        targetIdx = candidateIdx;
      }

      target = this.party[targetIdx];
      if (!target) return { success: false, reason: "Invalid target ally." };
      if (target.hp >= target.maxHp) {
        return { success: false, reason: `${target.name} is already at full health.` };
      }

      const healAmt = effect.amount || 15;
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + healAmt);
      const actualHealed = target.hp - before;
      spell.spent = true;

      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        effect: spell.effect,
        target: spell.target,
        targetHeroIndex: targetIdx,
        targetHeroName: target.name,
        hpHealed: actualHealed,
        currentHp: target.hp,
        maxHp: target.maxHp,
        wasIncapacitated: before <= 0
      };
    } else if (effect.type === 'party_heal') {
      let totalHealed = 0;
      const healedMembers = [];
      this.party.forEach((h, i) => {
        if (h.hp < h.maxHp) {
          const healAmt = effect.amount || 20;
          const before = h.hp;
          h.hp = Math.min(h.maxHp, h.hp + healAmt);
          const gained = h.hp - before;
          totalHealed += gained;
          healedMembers.push({ name: h.name, gained, hp: h.hp, maxHp: h.maxHp });
        }
      });
      spell.spent = true;
      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        effect: spell.effect,
        target: spell.target,
        totalHealed,
        healedMembers
      };
    } else if (effect.type === 'buff_attack') {
      this.party.forEach(h => {
        if (h.hp > 0) {
          h.tempAttackBonus = effect.amount || 1;
          h.tempAttackRounds = effect.duration_rounds || 4;
        }
      });
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, effect: spell.effect, target: spell.target };
    } else if (effect.type === 'buff_ac') {
      cleric.tempAcBonus = effect.amount || 2;
      cleric.tempAcRounds = effect.duration_rounds || 3;
      spell.spent = true;
      return { success: true, spellName: spell.name, spellId: spell.id, effect: spell.effect, target: spell.target };
    }

    spell.spent = true;
    return { success: true, spellName: spell.name, spellId: spell.id, effect: spell.effect, target: spell.target };
  }

  #syncClericEthos(cleric) {
    const thresholds = this.classesSpec.archetypes.cleric.divine_favor.thresholds;
    const current = thresholds.find(t => cleric.divineFavor >= t.min && cleric.divineFavor <= t.max);
    if (current) cleric.ethosStatus = current.status;
  }

  castMageSpell(spellIndex) {
    const mage = this.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (mage.hp <= 0) return { success: false, reason: "The mage is incapacitated!" };
    if (!mage.spells[spellIndex] || mage.spells[spellIndex].spent) return { success: false, reason: "Spell already spent or invalid!" };
    
    const spell = mage.spells[spellIndex];
    const load = spell.cognitive_load || 20;
    const refund = Math.floor(load * 0.8);
    spell.spent = true;
    mage.cognition = Math.min(mage.maxCognition, mage.cognition + refund);

    if (spell.id === 'light' || (spell.effect && spell.effect.type === 'illumination')) {
      const durationSeconds = spell.effect?.duration_seconds || 240;
      this.lightSpellUntil = Date.now() + durationSeconds * 1000;
      return {
        success: true,
        spellName: spell.name,
        spellId: spell.id,
        isLightSpell: true,
        refund,
        residualBurn: load - refund,
        currentCognition: mage.cognition,
        effect: spell.effect,
        target: spell.target,
        log: `✨ ${mage.name} casts Arcane Light! An eerie sphere of radiant luminescence hovers above the party for 4 minutes.`
      };
    }
    
    return { success: true, spellName: spell.name, spellId: spell.id, refund, residualBurn: load - refund, currentCognition: mage.cognition, effect: spell.effect, target: spell.target };
  }

  studyGrimoire() {
    const mage = this.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (this.combat.active) return { success: false, reason: "Cannot study the grimoire during combat!" };

    const spent = mage.spells.filter(s => s.spent);
    if (spent.length === 0) return { success: false, reason: "All prepared constructs are still held in mind." };

    const cognitiveCost = spent.reduce((sum, s) => sum + (s.cognitive_load || 20), 0);
    let brainBurnDamage = 0;
    mage.cognition -= cognitiveCost;
    
    if (mage.cognition < 0) {
      brainBurnDamage = Math.abs(mage.cognition);
      mage.cognition = 0;
      mage.hp = Math.max(0, mage.hp - brainBurnDamage);
    }
    
    spent.forEach(s => { s.spent = false; });
    mage.hasStudiedSinceRest = true;

    return { success: true, cognitiveCost, brainBurnDamage, rememorized: spent.map(s => s.name), currentCognition: mage.cognition, mageHp: mage.hp };
  }
}