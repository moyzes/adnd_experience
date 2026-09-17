import { ProgressionManager } from './progression_manager.js';
import { SpellRegistry } from '../spell_registry.js';

/**
 * CharacterFactory handles the instantiation and configuration of party members,
 * custom 3d6 ability rolls, race selections and adjustments, starting equipment loadouts,
 * spells/prayers, and stats based on classes.json archetypes.
 */
export class CharacterFactory {
  /**
   * Generates a standard set of 3d6 ability scores in order (STR, DEX, CON, INT, WIS, CHA).
   */
  static roll3d6Attributes() {
    const roll3d6 = () => {
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
      const d3 = Math.floor(Math.random() * 6) + 1;
      return d1 + d2 + d3;
    };

    return {
      strength: roll3d6(),
      dexterity: roll3d6(),
      constitution: roll3d6(),
      intelligence: roll3d6(),
      wisdom: roll3d6(),
      charisma: roll3d6()
    };
  }

  /**
   * Returns racial attribute adjustments and restrictions.
   */
  static getRaces() {
    return {
      human: {
        name: 'Human',
        description: 'Adaptable and versatile mortals without attribute penalties or class restrictions.',
        adjustments: {},
        allowedClasses: ['fighter', 'thief', 'cleric', 'mage']
      },
      elf: {
        name: 'Elf',
        description: '+1 Dexterity, -1 Constitution. Graceful and keen-eyed woodland folk.',
        adjustments: { dexterity: 1, constitution: -1 },
        allowedClasses: ['fighter', 'thief', 'cleric', 'mage']
      },
      dwarf: {
        name: 'Dwarf',
        description: '+1 Constitution, -1 Charisma. Hardy underground warriors and craftsmen.',
        adjustments: { constitution: 1, charisma: -1 },
        allowedClasses: ['fighter', 'thief', 'cleric'] // In AD&D 2e standard, Dwarves cannot be Mages
      }
    };
  }

  /**
   * Applies racial adjustments to a base set of attributes.
   */
  static applyRaceAdjustments(baseAttributes, raceKey = 'human') {
    const race = this.getRaces()[raceKey] || this.getRaces().human;
    const finalAttrs = { ...baseAttributes };

    if (race.adjustments) {
      Object.entries(race.adjustments).forEach(([attr, mod]) => {
        if (finalAttrs[attr] != null) {
          finalAttrs[attr] = Math.max(3, Math.min(19, finalAttrs[attr] + mod));
        }
      });
    }

    return finalAttrs;
  }

  /**
   * Validates available classes given attributes and selected race.
   * AD&D 2e Minimum Class Prereqs:
   * - Fighter: STR >= 9
   * - Mage: INT >= 9
   * - Cleric: WIS >= 9
   * - Thief: DEX >= 9
   */
  static getClassAvailability(attributes, raceKey = 'human') {
    const race = this.getRaces()[raceKey] || this.getRaces().human;
    const str = attributes.strength || 10;
    const dex = attributes.dexterity || 10;
    const int = attributes.intelligence || 10;
    const wis = attributes.wisdom || 10;

    return {
      fighter: {
        available: str >= 9 && race.allowedClasses.includes('fighter'),
        reason: str < 9 ? 'Requires STR 9+' : (!race.allowedClasses.includes('fighter') ? 'Restricted by race' : 'Available')
      },
      thief: {
        available: dex >= 9 && race.allowedClasses.includes('thief'),
        reason: dex < 9 ? 'Requires DEX 9+' : (!race.allowedClasses.includes('thief') ? 'Restricted by race' : 'Available')
      },
      cleric: {
        available: wis >= 9 && race.allowedClasses.includes('cleric'),
        reason: wis < 9 ? 'Requires WIS 9+' : (!race.allowedClasses.includes('cleric') ? 'Restricted by race' : 'Available')
      },
      mage: {
        available: int >= 9 && race.allowedClasses.includes('mage'),
        reason: int < 9 ? 'Requires INT 9+' : (!race.allowedClasses.includes('mage') ? 'Dwarves cannot be Mages' : 'Available')
      }
    };
  }

  /**
   * Returns list of available weapons for a given class.
   */
  static getWeaponOptions(classKey) {
    const key = (classKey || '').toLowerCase();
    if (key === 'fighter') {
      return [
        { name: 'Longsword', category: 'melee', damage: '1d8 Slashing', twoHanded: false, desc: 'Versatile martial blade (1d8 dmg).' },
        { name: 'Two-Handed Sword', category: 'melee', damage: '1d10 Slashing', twoHanded: true, desc: 'Massive greatsword (1d10 dmg, requires 2 hands).' },
        { name: 'Warhammer', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Crushing war hammer (1d6 dmg).' },
        { name: 'Halberd', category: 'melee', damage: '1d10 Slashing', twoHanded: true, desc: 'Heavy polearm combining axe and spear (1d10 dmg, 2 hands).' },
        { name: 'Mace', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Flanged iron bludgeon (1d6 dmg).' },
        { name: 'Short Sword', category: 'melee', damage: '1d6 Slashing', twoHanded: false, desc: 'Agile short blade (1d6 dmg).' },
        { name: 'Short Bow', category: 'ranged', damage: '1d6 Piercing', twoHanded: true, ammo: 'Arrows', desc: 'Ranged war bow (1d6 dmg, requires arrows).' },
        { name: 'Long Bow', category: 'ranged', damage: '1d8 Piercing', twoHanded: true, ammo: 'Arrows', desc: 'Powerful long-range war bow (1d8 dmg, requires arrows).' },
        { name: 'Crossbow', category: 'ranged', damage: '1d8 Piercing', twoHanded: true, ammo: 'Bolts', desc: 'Mechanical crossbow (1d8 dmg, requires bolts).' }
      ];
    }
    if (key === 'thief') {
      return [
        { name: 'Short Sword', category: 'melee', damage: '1d6 Slashing', twoHanded: false, desc: 'Light rogue blade favored for backstabbing (1d6 dmg).' },
        { name: 'Dagger', category: 'melee', damage: '1d4 Piercing', twoHanded: false, desc: 'Concealable quick blade (1d4 dmg).' },
        { name: 'Longsword', category: 'melee', damage: '1d8 Slashing', twoHanded: false, desc: 'Martial sidearm (1d8 dmg).' },
        { name: 'Short Bow', category: 'ranged', damage: '1d6 Piercing', twoHanded: true, ammo: 'Arrows', desc: 'Quiet hunting bow (1d6 dmg, requires arrows).' },
        { name: 'Crossbow', category: 'ranged', damage: '1d8 Piercing', twoHanded: true, ammo: 'Bolts', desc: 'Heavy mechanical bolt thrower (1d8 dmg).' },
        { name: 'Sling', category: 'ranged', damage: '1d4 Bludgeoning', twoHanded: false, ammo: 'Sling Bullets', desc: 'Compact leather bullet sling (1d4 dmg).' }
      ];
    }
    if (key === 'cleric') {
      return [
        { name: 'Warhammer', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Sanctified war hammer (1d6 dmg, respects holy vows).' },
        { name: 'Mace', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Heavy clerical iron flanged mace (1d6 dmg).' },
        { name: 'Quarterstaff', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Stout ash staff (1d6 dmg).' },
        { name: 'Sling', category: 'ranged', damage: '1d4 Bludgeoning', twoHanded: false, ammo: 'Sling Bullets', desc: 'Ranged stone/lead hurler (1d4 dmg).' }
      ];
    }
    if (key === 'mage') {
      return [
        { name: 'Quarterstaff', category: 'melee', damage: '1d6 Bludgeoning', twoHanded: false, desc: 'Simple walking staff (1d6 dmg).' },
        { name: 'Dagger', category: 'melee', damage: '1d4 Piercing', twoHanded: false, desc: 'Utility casting blade (1d4 dmg).' },
        { name: 'Sling', category: 'ranged', damage: '1d4 Bludgeoning', twoHanded: false, ammo: 'Sling Bullets', desc: 'Light leather sling (1d4 dmg).' }
      ];
    }
    return [];
  }

  /**
   * Returns list of weapon specializations available for Fighters.
   */
  static getFighterSpecializations() {
    return [
      { name: 'Longsword', desc: 'Mastery of the Longsword (+1 to-hit, +2 damage).' },
      { name: 'Two-Handed Sword', desc: 'Mastery of the Two-Handed Greatsword (+1 to-hit, +2 damage).' },
      { name: 'Warhammer', desc: 'Mastery of the Warhammer (+1 to-hit, +2 damage).' },
      { name: 'Halberd', desc: 'Mastery of the Halberd Polearm (+1 to-hit, +2 damage).' },
      { name: 'Mace', desc: 'Mastery of the Heavy Mace (+1 to-hit, +2 damage).' },
      { name: 'Short Sword', desc: 'Mastery of the Short Sword (+1 to-hit, +2 damage).' },
      { name: 'Short Bow', desc: 'Mastery of the Short Bow (+1 to-hit, +2 damage).' },
      { name: 'Long Bow', desc: 'Mastery of the Long Bow (+1 to-hit, +2 damage).' },
      { name: 'Crossbow', desc: 'Mastery of the Heavy Crossbow (+1 to-hit, +2 damage).' }
    ];
  }

  /**
   * Returns list of armor choices permitted for a given class.
   */
  static getArmorOptions(classKey) {
    const key = (classKey || '').toLowerCase();
    const catalog = [
      { id: 'banded_mail', name: 'Banded Mail', type: 'heavy', baseAc: 4, desc: 'Heavy steel bands on leather (Base AC 4).', allowed: ['fighter'] },
      { id: 'chain_mail', name: 'Chain Mail', type: 'medium', baseAc: 5, desc: 'Interlinked steel rings over gambeson (Base AC 5).', allowed: ['fighter', 'cleric'] },
      { id: 'scale_mail', name: 'Scale Mail', type: 'medium', baseAc: 6, desc: 'Overlapping bronze/iron scales (Base AC 6).', allowed: ['fighter', 'cleric'] },
      { id: 'studded_leather', name: 'Studded Leather', type: 'light', baseAc: 7, desc: 'Boiled leather with steel rivets (Base AC 7).', allowed: ['fighter', 'cleric', 'thief'] },
      { id: 'leather_armor', name: 'Leather Armor', type: 'light', baseAc: 8, desc: 'Cured hide jerkin (Base AC 8).', allowed: ['fighter', 'cleric', 'thief'] },
      { id: 'scholars_robes', name: "Scholar's Robes", type: 'unarmored', baseAc: 10, desc: 'Unarmored silk/wool robes (Base AC 10).', allowed: ['fighter', 'cleric', 'thief', 'mage'] }
    ];
    return catalog.filter(a => a.allowed.includes(key));
  }

  /**
   * Returns list of shield choices permitted for a given class.
   */
  static getShieldOptions(classKey) {
    const key = (classKey || '').toLowerCase();
    if (key === 'mage' || key === 'thief') return [];

    const shields = [
      { id: 'medium_shield', name: 'Medium Shield (+1 AC)', type: 'shield', acBonus: 1, desc: 'Iron-banded heater shield (-1 AC bonus).' },
      { id: 'small_shield', name: 'Small Shield (+1 AC)', type: 'shield', acBonus: 1, desc: 'Light forearm buckler (-1 AC bonus).' },
      { id: 'none', name: 'None (No Shield)', type: 'none', acBonus: 0, desc: 'Two-handed fighting stance or free hand.' }
    ];

    if (key === 'cleric') {
      shields.unshift({
        id: 'consecrated_shield',
        name: 'Consecrated Shield (+1 AC)',
        type: 'shield',
        acBonus: 1,
        desc: 'Sanctified heraldic kite shield (-1 AC bonus).'
      });
    }

    return shields;
  }

  /**
   * Master base rogue skill table before discretionary point distribution.
   * AD&D 2e specifies 60 discretionary points at 1st level, with max 30 points to any single skill.
   * Default starter distribution (+60 pts total) matches the built-in Thief archetype:
   * Pick Locks: 10 + 15 = 25%
   * Find/Disarm Traps: 5 + 15 = 20%
   * Pick Pockets: 15 + 15 = 30%
   * Hide in Shadows: 10 + 5 = 15%
   * Hear Noise: 10 + 10 = 20%
   */
  static getThiefBaseSkills() {
    return {
      pick_locks: { name: 'Pick Locks', rawBase: 10, defaultAdded: 15, maxAdded: 30, desc: 'Manipulating pins, tumblers, and chest mechanisms.' },
      find_traps: { name: 'Find/Disarm Traps', rawBase: 5, defaultAdded: 15, maxAdded: 30, desc: 'Spotting tripwires, spring-needles, and pressure plates.' },
      pick_pockets: { name: 'Pick Pockets', rawBase: 15, defaultAdded: 15, maxAdded: 30, desc: 'Filching pouches, keys, and amulets without detection.' },
      hide_in_shadows: { name: 'Hide in Shadows', rawBase: 10, defaultAdded: 5, maxAdded: 30, desc: 'Melting into darkness and silent stalking.' },
      hear_noise: { name: 'Hear Noise', rawBase: 10, defaultAdded: 10, maxAdded: 30, desc: 'Listening through closed dungeon doors and echoing halls.' }
    };
  }

  /**
   * Constructs a fully initialized AD&D 2e party member from archetype specification,
   * supporting custom rolled attributes, race selection, customized gear, fighter specialization,
   * rogue discretionary skill point allocation, and chosen starting spells.
   */
  static createPartyMember(classKey, customName, chosenSpells = [], classesSpec = null, options = {}) {
    const archetype = classesSpec?.archetypes?.[classKey];
    if (!archetype) throw new Error(`Archetype '${classKey}' not found in classes spec.`);

    const raceKey = options.race || 'human';
    const raceData = this.getRaces()[raceKey] || this.getRaces().human;

    // Attributes: Custom attributes provided or archetype defaults
    let finalAttributes;
    if (options.attributes) {
      finalAttributes = { ...options.attributes };
    } else {
      finalAttributes = { ...archetype.attributes };
    }

    // Determine Chosen or Default Weapon
    const availableWeapons = this.getWeaponOptions(classKey);
    let chosenWeapon = options.equippedWeapon || archetype.default_weapon ||
      (classKey === 'fighter' ? 'Longsword' : classKey === 'thief' ? 'Short Sword' : classKey === 'cleric' ? 'Warhammer' : 'Quarterstaff');

    // Fighter Weapon Specialization
    let specializedWeapon = null;
    if (classKey === 'fighter') {
      specializedWeapon = options.specializedWeapon || archetype.weapon_specialization?.default || chosenWeapon || 'Longsword';
    }

    // Determine Armor & Shield
    let equippedArmor = null;
    let equippedShield = null;
    let baseArmorAc = 10;

    const armorCatalog = this.getArmorOptions(classKey);
    const shieldCatalog = this.getShieldOptions(classKey);

    if (options.equippedArmor) {
      if (typeof options.equippedArmor === 'object') {
        equippedArmor = { ...options.equippedArmor };
        baseArmorAc = equippedArmor.baseAc || 10;
      } else if (typeof options.equippedArmor === 'string') {
        const found = armorCatalog.find(a => a.id === options.equippedArmor || a.name.toLowerCase() === options.equippedArmor.toLowerCase());
        if (found) {
          equippedArmor = {
            id: found.id,
            name: found.name,
            type: found.type,
            baseAc: found.baseAc,
            description: found.desc
          };
          baseArmorAc = found.baseAc;
        }
      }
    } else {
      // Default class armor
      if (classKey === 'fighter') {
        equippedArmor = {
          id: 'banded_mail',
          name: 'Banded Mail',
          type: 'heavy',
          baseAc: 4,
          description: 'Overlapping horizontal steel bands riveted to leather backing.'
        };
        baseArmorAc = 4;
      } else if (classKey === 'cleric') {
        equippedArmor = {
          id: 'chain_mail',
          name: 'Chain Mail',
          type: 'medium',
          baseAc: 5,
          description: 'Interlinked hardened steel rings worn over padded gambeson.'
        };
        baseArmorAc = 5;
      } else if (classKey === 'thief') {
        equippedArmor = {
          id: 'leather_armor',
          name: 'Leather Armor',
          type: 'light',
          baseAc: 8,
          description: 'Supple boiled leather allowing silent movement and acrobatic evasion.'
        };
        baseArmorAc = 8;
      } else if (classKey === 'mage') {
        equippedArmor = {
          id: 'scholars_robes',
          name: "Scholar's Robes",
          type: 'unarmored',
          baseAc: 10,
          description: 'Heavy wool and silk embroidered with protective warding threads.'
        };
        baseArmorAc = 10;
      }
    }

    if (options.equippedShield !== undefined) {
      if (options.equippedShield === null || options.equippedShield === 'none' || options.equippedShield?.id === 'none') {
        equippedShield = null;
      } else if (typeof options.equippedShield === 'object') {
        equippedShield = { ...options.equippedShield };
      } else if (typeof options.equippedShield === 'string') {
        const foundShield = shieldCatalog.find(s => s.id === options.equippedShield || s.name.toLowerCase().includes(options.equippedShield.toLowerCase()));
        if (foundShield && foundShield.id !== 'none') {
          equippedShield = {
            id: foundShield.id,
            name: foundShield.name.replace(/\s*\(\+1\s*AC\)/i, ''),
            type: 'shield',
            acBonus: foundShield.acBonus || 1,
            description: foundShield.desc
          };
        } else {
          equippedShield = null;
        }
      }
    } else {
      // Default shields
      if (classKey === 'fighter') {
        equippedShield = {
          id: 'medium_shield',
          name: 'Medium Shield',
          type: 'shield',
          acBonus: 1,
          description: 'Iron-rimmed oak heater shield bearing martial heraldry.'
        };
      } else if (classKey === 'cleric') {
        equippedShield = {
          id: 'consecrated_shield',
          name: 'Consecrated Shield',
          type: 'shield',
          acBonus: 1,
          description: 'Blessed kite shield inscribed with sacred holy heraldry.'
        };
      } else {
        equippedShield = null;
      }
    }

    // Starting Inventory Provisions
    let inventory = options.inventory ? [...options.inventory] : [];
    if (inventory.length === 0) {
      if (classKey === 'fighter') {
        inventory.push({ name: 'Short Bow', amount: 1 });
        inventory.push({ name: 'Arrows', amount: 20 });
        inventory.push({ name: 'Dagger', amount: 1 });
      } else if (classKey === 'thief') {
        inventory.push({ name: 'Thief Tools', amount: 1 });
        if (chosenWeapon !== 'Short Bow' && chosenWeapon !== 'Crossbow') {
          inventory.push({ name: 'Short Bow', amount: 1 });
          inventory.push({ name: 'Arrows', amount: 20 });
        } else {
          inventory.push({ name: 'Dagger', amount: 1 });
        }
      } else if (classKey === 'cleric') {
        inventory.push({ name: 'Holy Water', amount: 1 });
      } else if (classKey === 'mage') {
        if (chosenWeapon !== 'Dagger') {
          inventory.push({ name: 'Dagger', amount: 1 });
        }
      }
    }

    // Hit Points: Hit die + CON mod
    const hitDie = archetype.hit_die || (classKey === 'fighter' ? 10 : classKey === 'cleric' ? 8 : classKey === 'thief' ? 6 : 4);
    const conBonus = ProgressionManager.getConHpModifier({ classKey, attributes: finalAttributes });
    const calculatedHp = Math.max(1, hitDie + conBonus);

    // Armor Class: Base Armor + Dex Modifier - Shield
    const dexMod = ProgressionManager.getDexDefensiveAdjustment(finalAttributes.dexterity);
    let calculatedAc = baseArmorAc + dexMod;
    if (equippedShield) {
      calculatedAc -= (equippedShield.acBonus || 1);
    }

    const xpTable = archetype.xp_table || (
      classKey === 'thief' ? [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000] :
      classKey === 'cleric' ? [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000] :
      classKey === 'fighter' ? [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000] :
      [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000]
    );
    const nextLevelXp = xpTable[1] || 2000;

    // Build Skills Object (with custom thief discretionary point allocation if provided)
    let skillsObj = JSON.parse(JSON.stringify(archetype.skills || {}));
    if (classKey === 'thief' && options.thiefSkillPoints) {
      const thiefBases = this.getThiefBaseSkills();
      Object.entries(thiefBases).forEach(([sKey, sDef]) => {
        const added = Math.max(0, Math.min(30, options.thiefSkillPoints[sKey] != null ? options.thiefSkillPoints[sKey] : sDef.defaultAdded));
        skillsObj[sKey] = {
          name: sDef.name,
          type: 'percentile',
          base: sDef.rawBase + added,
          perLevel: 0
        };
      });
    }

    const member = {
      name: customName || archetype.name,
      classKey: classKey,
      className: archetype.name,
      race: raceData.name,
      raceKey: raceKey,
      group: archetype.group,
      level: 1,
      xp: 0,
      nextLevelXp: nextLevelXp,
      canLevelUp: false,
      hp: calculatedHp,
      maxHp: calculatedHp,
      armorClass: calculatedAc,
      baseArmorClass: baseArmorAc,
      attackBonus: archetype.attack_bonus || (classKey === 'fighter' ? 2 : 1),
      attributes: { ...finalAttributes },
      skills: skillsObj,
      equippedWeapon: chosenWeapon,
      specializedWeapon: specializedWeapon,
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
      member.hasStudiedSinceRest = false;
      member.tempIntDrain = 0;
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;

      // Starting Mage spells
      let initialSpells;
      if (chosenSpells && chosenSpells.length > 0) {
        initialSpells = chosenSpells;
      } else {
        const tier1Mage = SpellRegistry.getSpellsForClass('mage', 1);
        initialSpells = tier1Mage.length > 0 ? [tier1Mage[0]] : [];
      }

      member.grimoire = initialSpells.map(s => ({
        id: s.id,
        name: s.name,
        level: s.level || s.tier || 1,
        tier: s.tier || s.level || 1,
        cognitive_load: s.cognitive_load || 20,
        casting_time: s.casting_time || 'normal',
        target: s.target || 'single_enemy',
        effect: s.effect ? { ...s.effect } : null,
        description: s.description || '',
        sfx: s.sfx || 'magic_missile'
      }));

      // Active prepared spells start unmemorized so cognitive load is 0
      member.spells = member.grimoire.map(s => ({ ...s, spent: true }));
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
        const tier1 = SpellRegistry.getSpellsForClass('cleric', 1);
        member.spells = tier1.slice(0, 1).map(s => ({ ...s, spent: false }));
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

  /**
   * Pre-built standard characters for rapid selection.
   */
  static getPrebuiltCharacters(classesSpec) {
    return [
      {
        id: 'prebuilt_fighter',
        name: 'Valeros',
        classKey: 'fighter',
        race: 'human',
        attributes: { strength: 16, dexterity: 12, constitution: 15, intelligence: 9, wisdom: 10, charisma: 11 },
        chosenSpells: []
      },
      {
        id: 'prebuilt_thief',
        name: 'Merisiel',
        classKey: 'thief',
        race: 'elf',
        attributes: { strength: 11, dexterity: 18, constitution: 11, intelligence: 12, wisdom: 10, charisma: 10 },
        chosenSpells: []
      },
      {
        id: 'prebuilt_cleric',
        name: 'Kyra',
        classKey: 'cleric',
        race: 'human',
        attributes: { strength: 14, dexterity: 9, constitution: 13, intelligence: 11, wisdom: 16, charisma: 14 },
        chosenSpells: ['cure_wounds']
      },
      {
        id: 'prebuilt_mage',
        name: 'Elminster',
        classKey: 'mage',
        race: 'human',
        attributes: { strength: 8, dexterity: 14, constitution: 11, intelligence: 18, wisdom: 13, charisma: 12 },
        chosenSpells: ['magic_missile']
      }
    ];
  }

  /**
   * Assembles the canonical 4-person starting party.
   */
  static buildDefaultParty(classesSpec) {
    const prebuilts = this.getPrebuiltCharacters(classesSpec);
    return prebuilts.map(p => {
      const spells = p.chosenSpells.map(sid => SpellRegistry.getSpell(sid)).filter(Boolean);
      return this.createPartyMember(p.classKey, p.name, spells, classesSpec, {
        race: p.race,
        attributes: p.attributes
      });
    });
  }
}
