/**
 * GameState acts as the central data store and rules engine for the dungeon crawler.
 * It manages player position, party metrics, skill resolution (d100 tradecraft for Thieves,
 * d20 roll-under ability checks for other classes), Vancian cognition, Divine favor,
 * level progression, inventory, and dungeon interactions.
 */
export class GameState {
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

    // Combat State Manager
    this.combat = {
      active: false,
      round: 1,
      encounterId: null,
      enemies: [],               // Active monster instances in fight
      queuedCommands: {},        // { [heroIndex]: { type, targetId, spellIndex, phase } }
      previousCommands: {},      // Smart Action Memory for repeat orders
      channelingCast: null       // Track multi-turn casting { heroIndex, spell, turnsRemaining }
    };

    // UI Event Delegate Hook for narrative logging
    this.onLog = null;
  }

  /**
   * Logger delegate routing state events to the UI presentation log
   */
  addLog(message, type = 'info') {
    if (typeof this.onLog === 'function') {
      this.onLog(message, type);
    }
  }

  /**
   * Retrieves or initializes persistent state memory for a given NPC
   */
  getNPCState(npcId) {
    if (!this.npcStates[npcId]) {
      this.npcStates[npcId] = {
        attitude: 0,          // Scalar (-100 to +100)
        currentNode: null,    // Remembers current conversation node
        met: false,           // Has the party interacted before
        completed: false,     // Has the conversation tree concluded
        despawned: false,     // Has the NPC departed the map
        endBehavior: null,    // "despawn" | "stay_silent" | "repeat_terminal"
        flags: {}             // Narrative milestone flags
      };
    }
    return this.npcStates[npcId];
  }

  /**
   * Factory method to initialize individual party members based on class archetypes.
   */
  /** Minimal weapon table — category drives Shoot availability; damageType feeds mitigation. */
  static WEAPON_CATALOG = {
    'Longsword': { category: 'melee', damageType: 'slashing' },
    'Short Sword': { category: 'melee', damageType: 'slashing' },
    'Dagger': { category: 'melee', damageType: 'piercing' },
    'Warhammer': { category: 'melee', damageType: 'bludgeoning' },
    'Quarterstaff': { category: 'melee', damageType: 'bludgeoning' },
    'Short Bow': { category: 'ranged', damageType: 'piercing' },
    'Long Bow': { category: 'ranged', damageType: 'piercing' },
    'Crossbow': { category: 'ranged', damageType: 'piercing' },
    'Sling': { category: 'ranged', damageType: 'bludgeoning' }
  };

  /**
   * Master item catalog. Shops, loot, starting kits and use-handlers all key off this.
   * scope: 'party' = shared pack | 'personal' = hero inventory
   * kind: currency | consumable | ammo | gear | weapon
   */
  static ITEM_CATALOG = {
    'Gold Pieces': {
      id: 'gold', kind: 'currency', scope: 'party',
      description: 'Coin of the realm.',
      stackable: true, usable: false, price: 1
    },
    'Rations': {
      id: 'rations', kind: 'consumable', scope: 'party',
      description: 'Dried meat, hardtack and watered wine. Required to camp.',
      stackable: true, usable: false, price: 2
    },
    'Torch': {
      id: 'torch', kind: 'consumable', scope: 'party',
      description: 'Burns for a short while. Keeps the dark at bay (light system forthcoming).',
      stackable: true, usable: true, useEffect: 'light', price: 1
    },
    'Healing Potion': {
      id: 'healing_potion', kind: 'consumable', scope: 'party',
      description: 'A bitter red draught. Restores 1d4+1 hit points.',
      stackable: true, usable: true, useEffect: 'heal', healDice: '1d4+1', price: 25
    },
    'Holy Water': {
      id: 'holy_water', kind: 'consumable', scope: 'party',
      description: 'Blessed vial. 2d4 damage vs undead when used in combat (or as a blessing out of combat).',
      stackable: true, usable: true, useEffect: 'holy_water', price: 20
    },
    'Arrows': {
      id: 'arrows', kind: 'ammo', scope: 'party',
      description: 'Bundle of arrows for bows.',
      stackable: true, usable: false, price: 1, unitLabel: 'arrow'
    },
    'Bolts': {
      id: 'bolts', kind: 'ammo', scope: 'party',
      description: 'Crossbow bolts.',
      stackable: true, usable: false, price: 1, unitLabel: 'bolt'
    },
    'Thief Tools': {
      id: 'thief_tools', kind: 'gear', scope: 'personal',
      description: 'Picks, probes and oil. Required for lockpicking and trap work. Degrades with use.',
      stackable: false, usable: true, useEffect: 'repair_tools', price: 30
    },
    'Short Bow': {
      id: 'short_bow', kind: 'weapon', scope: 'personal',
      description: 'Light bow. Requires arrows.',
      stackable: false, usable: false, price: 25
    },
    'Longsword': {
      id: 'longsword', kind: 'weapon', scope: 'personal',
      description: 'Standard martial blade.',
      stackable: false, usable: false, price: 15
    },
    'Dagger': {
      id: 'dagger', kind: 'weapon', scope: 'personal',
      description: 'Small blade, easily concealed.',
      stackable: false, usable: false, price: 2
    },
    'Warhammer': {
      id: 'warhammer', kind: 'weapon', scope: 'personal',
      description: 'Bludgeoning weapon favored by clerics.',
      stackable: false, usable: false, price: 8
    },
    'Quarterstaff': {
      id: 'quarterstaff', kind: 'weapon', scope: 'personal',
      description: 'Simple wooden staff.',
      stackable: false, usable: false, price: 2
    },
    'Short Sword': {
      id: 'short_sword', kind: 'weapon', scope: 'personal',
      description: 'Light blade preferred by thieves.',
      stackable: false, usable: false, price: 8
    }
  };

  isKnownWeapon(weaponName) {
    return !!GameState.WEAPON_CATALOG[weaponName];
  }

  getItemDef(name) {
    return GameState.ITEM_CATALOG[name] || null;
  }

  isRangedWeapon(weaponName) {
    const def = GameState.WEAPON_CATALOG[weaponName];
    return !!(def && def.category === 'ranged');
  }

  canHeroShoot(hero) {
    return !!(hero && this.isRangedWeapon(hero.equippedWeapon));
  }

  /** Strike requires a melee weapon in hand (not a bow/crossbow/sling). */
  canHeroMelee(hero) {
    if (!hero || !hero.equippedWeapon) return false;
    const def = GameState.WEAPON_CATALOG[hero.equippedWeapon];
    return !!(def && def.category === 'melee');
  }

  getWeaponDamageType(weaponName, fallback = 'slashing') {
    const def = GameState.WEAPON_CATALOG[weaponName];
    return (def && def.damageType) || fallback;
  }

  /**
   * Equip a weapon from the hero's personal inventory.
   * Current weapon (if any) is moved back into inventory.
   */
  equipHeroWeapon(heroIndex, weaponName) {
    const hero = this.party[heroIndex];
    if (!hero || !weaponName) return { success: false, reason: 'Invalid hero or weapon.' };
    if (!GameState.WEAPON_CATALOG[weaponName]) {
      return { success: false, reason: `"${weaponName}" is not a known weapon.` };
    }

    const inv = hero.inventory || (hero.inventory = []);
    const slot = inv.find(i => i.name === weaponName);
    if (!slot || (slot.amount || 1) < 1) {
      return { success: false, reason: `${hero.name} does not carry ${weaponName}.` };
    }

    // Remove one from inventory
    if ((slot.amount || 1) <= 1) {
      hero.inventory = inv.filter(i => i !== slot);
    } else {
      slot.amount -= 1;
    }

    // Stash previously equipped weapon (if any)
    if (hero.equippedWeapon) {
      const existing = hero.inventory.find(i => i.name === hero.equippedWeapon);
      if (existing) existing.amount = (existing.amount || 1) + 1;
      else hero.inventory.push({ name: hero.equippedWeapon, amount: 1 });
    }

    hero.equippedWeapon = weaponName;
    return { success: true, equipped: weaponName };
  }

  // ─── Party inventory helpers (shared pack) ───────────────────────────

  getPartyItem(name) {
    if (!this.inventory) this.inventory = [];
    return this.inventory.find(i => i.name === name) || null;
  }

  getPartyItemQty(name) {
    const item = this.getPartyItem(name);
    if (!item) return 0;
    return item.amount ?? item.count ?? 0;
  }

  getPartyGold() {
    return this.getPartyItemQty('Gold Pieces');
  }

  /**
   * Add (or stack) an item into the shared party inventory.
   */
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

  /**
   * Remove quantity from party inventory. Returns false if not enough.
   */
  removePartyItem(name, amount = 1) {
    const item = this.getPartyItem(name);
    if (!item) return false;
    const qtyKey = item.amount !== undefined ? 'amount' : 'count';
    const have = item[qtyKey] ?? 0;
    if (have < amount) return false;
    item[qtyKey] = have - amount;
    if (item[qtyKey] <= 0) {
      this.inventory = this.inventory.filter(i => i !== item);
    }
    return true;
  }

  spendGold(amount) {
    return this.removePartyItem('Gold Pieces', amount);
  }

  /**
   * Use a consumable from the party pack, targeting a specific hero when relevant.
   * Returns { success, reason?, log?, healed? }
   */
  useConsumable(itemName, heroIndex = null) {
    const def = this.getItemDef(itemName);
    if (!def || !def.usable) {
      return { success: false, reason: `${itemName} cannot be used.` };
    }
    if (this.getPartyItemQty(itemName) < 1) {
      return { success: false, reason: `No ${itemName} left in the pack.` };
    }
    if (this.combat.active && def.useEffect === 'light') {
      return { success: false, reason: 'Cannot light a torch in the middle of a melee.' };
    }

    const hero = (heroIndex != null) ? this.party[heroIndex] : null;

    if (def.useEffect === 'heal') {
      if (!hero || hero.hp <= 0) {
        return { success: false, reason: 'Choose a living hero to drink the potion.' };
      }
      if (hero.hp >= hero.maxHp) {
        return { success: false, reason: `${hero.name} is already at full health.` };
      }
      // 1d4+1
      const healed = Math.floor(Math.random() * 4) + 1 + 1;
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + healed);
      const actual = hero.hp - before;
      this.removePartyItem(itemName, 1);
      return {
        success: true,
        healed: actual,
        log: `${hero.name} drinks a Healing Potion and recovers ${actual} HP (${hero.hp}/${hero.maxHp}).`
      };
    }

    if (def.useEffect === 'holy_water') {
      if (!hero) {
        return { success: false, reason: 'Choose a hero to apply the blessing.' };
      }
      // Out of combat: minor favor tick for cleric or a small bless for anyone
      this.removePartyItem(itemName, 1);
      if (hero.classKey === 'cleric') {
        hero.divineFavor = Math.min(hero.maxDivineFavor || 100, (hero.divineFavor || 0) + 8);
        if (hero.divineFavor > 0) hero.absoluteSilence = false;
        this.#syncClericEthos(hero);
        return {
          success: true,
          log: `${hero.name} anoints themselves with Holy Water. Divine Favor rises (+8).`
        };
      }
      hero.tempAttackBonus = (hero.tempAttackBonus || 0) + 1;
      hero.tempAttackRounds = Math.max(hero.tempAttackRounds || 0, 3);
      return {
        success: true,
        log: `${hero.name} is blessed with Holy Water (+1 to hit for a short time).`
      };
    }

    if (def.useEffect === 'light') {
      this.removePartyItem(itemName, 1);
      // Light system placeholder — for now just narrative + a short-lived flag
      this.torchLitUntil = Date.now() + 3 * 60 * 1000; // 3 minutes real-time
      return {
        success: true,
        log: `A torch is lit. The darkness retreats for a while.`
      };
    }

    if (def.useEffect === 'repair_tools') {
      // Personal item path — tools live on the thief
      const thief = this.party.find(p => p.classKey === 'thief');
      if (!thief) return { success: false, reason: 'No thief in the party.' };
      if ((thief.toolsDurability || 0) >= 100) {
        return { success: false, reason: 'Tools are already in perfect condition.' };
      }
      // Spending a spare kit restores durability
      const personal = (thief.inventory || []).find(i => i.name === 'Thief Tools');
      // Allow using from party pack OR personal
      const fromParty = this.getPartyItemQty('Thief Tools') > 0;
      if (!fromParty && !personal) {
        return { success: false, reason: 'No spare Thief Tools available.' };
      }
      if (fromParty) this.removePartyItem('Thief Tools', 1);
      else {
        if ((personal.amount || 1) <= 1) {
          thief.inventory = thief.inventory.filter(i => i !== personal);
        } else personal.amount -= 1;
      }
      thief.toolsDurability = 100;
      return {
        success: true,
        log: `${thief.name} refits a fresh set of tools. Durability restored to 100%.`
      };
    }

    return { success: false, reason: 'Unknown use effect.' };
  }

  /**
   * True when the party is on or adjacent to the outfitter stall.
   */
  isNearShop() {
    const shop = this.spec.shop;
    if (!shop || !shop.tile) return false;
    const [sx, sy] = shop.tile;
    const r = shop.radius != null ? shop.radius : 1;
    return Math.abs(this.player.x - sx) + Math.abs(this.player.y - sy) <= r;
  }

  getShopTile() {
    return (this.spec.shop && this.spec.shop.tile) ? this.spec.shop.tile : null;
  }

  /**
   * Purchase an item from a shop. Deducts gold and places the item in the correct inventory.
   */
  buyItem(itemName, qty = 1, heroIndex = null) {
    const def = this.getItemDef(itemName);
    if (!def) return { success: false, reason: `Unknown item: ${itemName}` };
    if (def.kind === 'currency') return { success: false, reason: 'Cannot buy gold with gold.' };

    const total = (def.price || 0) * qty;
    if (this.getPartyGold() < total) {
      return { success: false, reason: `Not enough gold (need ${total} gp).` };
    }
    if (!this.spendGold(total)) {
      return { success: false, reason: 'Payment failed.' };
    }

    if (def.scope === 'personal') {
      const hero = heroIndex != null ? this.party[heroIndex] : this.party.find(p => p.classKey === 'thief') || this.party[0];
      if (!hero) return { success: false, reason: 'No hero to receive the item.' };
      if (!hero.inventory) hero.inventory = [];
      const existing = hero.inventory.find(i => i.name === itemName);
      if (existing && def.stackable) {
        existing.amount = (existing.amount || 1) + qty;
      } else if (existing && !def.stackable) {
        // already has unique gear
        existing.amount = (existing.amount || 1) + qty;
      } else {
        hero.inventory.push({ name: itemName, amount: qty });
      }
      // Special: buying Thief Tools also tops up durability if thief
      if (itemName === 'Thief Tools' && hero.classKey === 'thief') {
        hero.toolsDurability = 100;
      }
      return { success: true, total, destination: 'personal', heroName: hero.name };
    }

    this.addPartyItem(itemName, qty);
    return { success: true, total, destination: 'party' };
  }

  createPartyMember(classKey, customName, chosenSpells = []) {
    const archetype = this.classesSpec.archetypes[classKey];
    if (!archetype) {
      throw new Error(`Archetype '${classKey}' not found in classes spec.`);
    }

    const defaultWeapon = archetype.default_weapon ||
      (classKey === 'fighter' ? 'Longsword' : classKey === 'thief' ? 'Short Sword' : classKey === 'cleric' ? 'Warhammer' : 'Quarterstaff');

    // Personal kit — thief starts with a Short Bow in pack so Shoot can be unlocked by equipping
    let inventory = [];
    if (classKey === 'thief') {
      inventory = [
        { name: 'Thief Tools', amount: 1 },
        { name: 'Short Bow', amount: 1 }
      ];
    } else if (classKey === 'fighter') {
      inventory = [
        { name: 'Short Bow', amount: 1 }
      ];
    }

    const member = {
      name: customName,
      classKey: classKey,
      className: archetype.name,
      group: archetype.group,
      level: 1,
      xp: 0,
      nextLevelXp: 500,
      hp: archetype.starting_hp,
      maxHp: archetype.starting_hp,
      armorClass: archetype.armor_class || 5,
      attackBonus: archetype.attack_bonus || 1,
      attributes: { ...archetype.attributes },
      skills: JSON.parse(JSON.stringify(archetype.skills || {})),
      equippedWeapon: defaultWeapon,
      inventory
    };

    if (classKey === 'mage' && archetype.vancian_magic) {
      const maxCog = archetype.vancian_magic.cognition_max || 100;
      member.maxCognition = maxCog;
      // Known + prepared from setup (already studied before the expedition)
      member.spells = chosenSpells.map(s => ({
        id: s.id,
        name: s.name,
        level: s.level || 1,
        cognitive_load: s.cognitive_load || 20,
        casting_time: s.casting_time || 'normal',
        target: s.target || 'enemy',
        effect: s.effect ? { ...s.effect } : null,
        description: s.description || '',
        spent: false
      }));
      const initialLoad = member.spells.reduce((sum, sp) => sum + (sp.cognitive_load || 0), 0);
      member.cognition = Math.max(0, maxCog - initialLoad);
      member.hasStudiedSinceRest = true;
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;
    }

    if (classKey === 'cleric' && archetype.divine_favor) {
      const maxFav = archetype.divine_favor.max_favor || 100;
      member.divineFavor = maxFav;
      member.maxDivineFavor = maxFav;
      member.ethosStatus = "Full Communion";
      member.absoluteSilence = false;
      member.hasPrayedSinceRest = true; // dawn petitions already granted at expedition start
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;
      member.tempAttackBonus = 0;
      member.tempAttackRounds = 0;
      member.spells = chosenSpells.map(s => ({
        id: s.id,
        name: s.name,
        level: s.level || 1,
        target: s.target || 'ally',
        effect: s.effect ? { ...s.effect } : null,
        description: s.description || '',
        spent: false
      }));
    }

    if (classKey === 'thief') {
      member.toolsDurability = 100;
      member.isStealth = false;
    }

    return member;
  }

  /**
   * Calculates Target Threshold for Roll-Under Checks:
   * - Thief Percentile: Returns skill % (e.g., 35%)
   * - Attribute/Skill Check: Returns Raw Attribute + Base Skill Bonus + Level Scaling
   */
  getSkillTarget(hero, skillKey) {
    const skill = hero.skills ? hero.skills[skillKey] : null;
    if (!skill) return 10;
    const levelBonus = (hero.level - 1) * (skill.perLevel || 1);

    if (skill.type === 'percentile') {
      return Math.min(99, skill.base + levelBonus);
    } else {
      const rawAttr = hero.attributes[skill.attribute] || 10;
      return rawAttr + skill.base + levelBonus;
    }
  }
  // ---------------------------------------------------------------------------
  // Combat Engine Methods
  // ---------------------------------------------------------------------------

  /**
   * Initializes a combat encounter from an encounter spec definition
   */
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

    this.combat = {
      active: true,
      round: 1,
      encounterId: encounterId,
      enemies: spawnedEnemies,
      queuedCommands: {},
      previousCommands: {},
      channelingCast: null,
      surpriseRound: !!encSpec.scouted,
      alertedRound: !!encSpec.alerted
    };

    this.addLog(`⚔️ COMBAT ENGAGED! ${encSpec.name} (${spawnedEnemies.length} hostiles present).`, "danger");
    return true;
  }

  /**
   * Queues an action command for a specific hero index
   */
  queueHeroCommand(heroIndex, command) {
    // command: { type: 'ATTACK'|'SHOOT'|'CAST'|'GUARD'|'BACKSTAB',
    //            targetInstanceId?, guardTargetIndex?, spellIndex? }
    this.combat.queuedCommands[heroIndex] = command;
  }

  /**
   * Compact AD&D-style Turn Undead table: cleric level × undead tier.
   * Returns d20 target number, 'D' (destroy), or null (immune).
   */
  getTurnUndeadTarget(clericLevel, undeadTier) {
    const lvl = Math.max(1, Math.min(10, clericLevel || 1));
    // Tiers: weak (skel/zombie), medium (ghoul), strong (wight), greater (vampire+)
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

  /**
   * Evaluates armor damage mitigation based on weapon damage type
   */
  applyArmorMitigation(rawDamage, damageType, armorType) {
    if (damageType === 'bludgeoning') return rawDamage; // Bypasses armor!

    if (armorType === 'chain') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 2);
    } else if (armorType === 'plate') {
      if (damageType === 'slashing') return Math.max(1, rawDamage - 5);
      if (damageType === 'piercing') return Math.max(1, rawDamage - 3);
    }
    return rawDamage;
  }

  /**
   * Parses simple dice strings ("1d6", "1d4+1", "2d4") for monster damage.
   * Falls back to a soft 1–4 if the string is missing or unparseable (level-1 friendly).
   */
  rollMonsterDamage(dmgStr) {
    if (!dmgStr || typeof dmgStr !== 'string') {
      return Math.floor(Math.random() * 4) + 1;
    }
    const m = dmgStr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
    if (!m) {
      return Math.floor(Math.random() * 4) + 1;
    }
    const num = Math.max(1, parseInt(m[1], 10) || 1);
    const die = Math.max(1, parseInt(m[2], 10) || 4);
    const bonus = parseInt(m[3] || '0', 10) || 0;
    let total = bonus;
    for (let i = 0; i < num; i++) {
      total += Math.floor(Math.random() * die) + 1;
    }
    return Math.max(1, total);
  }
  // Add to GameState class in engine/state.js
  checkSavingThrow(hero, category) {
    // Standard AD&D 2e baseline targets by category (can scale with level later)
    // Categories: poison (Paralyzation/Poison/Death), wand, petrification, breath, spell
    const baseTargets = {
      fighter: { poison: 14, wand: 16, petrification: 15, breath: 17, spell: 17 },
      thief: { poison: 13, wand: 14, petrification: 12, breath: 16, spell: 15 },
      cleric: { poison: 10, wand: 13, petrification: 13, breath: 16, spell: 15 },
      mage: { poison: 14, wand: 11, petrification: 13, breath: 15, spell: 12 }
    };

    const classSaves = baseTargets[hero.classKey] || { poison: 14 };
    const targetNumber = (classSaves[category] || 14) - Math.floor((hero.level - 1) / 3); // Level progression adjustment

    const roll = Math.floor(Math.random() * 20) + 1;
    // Natural 20 always succeeds, Natural 1 always fails; otherwise roll >= target
    const success = roll === 20 || (roll !== 1 && roll >= targetNumber);

    return { roll, target: targetNumber, success };
  }
  /**
   * Master combat round execution algorithm
   */
  resolveCombatRound() {
    if (!this.combat.active) {
      return { events: [], finalMobHp: {}, finalHeroHp: {}, victory: false, partyWiped: false, totalXp: 0 };
    }

    const actionQueue = [];
    const combatEvents = [];

    // Track simulated HP during round calculation to support redirection & mid-round death
    const simMobHp = {};
    this.combat.enemies.forEach(e => { simMobHp[e.instanceId] = e.hp; });

    const simHeroHp = {};
    this.party.forEach((h, idx) => { simHeroHp[idx] = h.hp; });

    // Concentration: hero index → true if they took damage earlier this round (before their CAST)
    const castInterrupted = {};

    // Guard map built from declarations (one guardian per protected hero; later overwrites earlier)
    // selfGuardAc[heroIndex] = 1 when guarding self
    // guardedBy[protectedIndex] = guardianIndex when ally-guarding
    const selfGuardAc = {};
    const guardedBy = {};
    this.party.forEach((hero, index) => {
      if (this.combat.round === 1 && this.combat.alertedRound) return; // ambushed — party skips round 1
      if (hero.hp <= 0) return;
      const cmd = this.combat.queuedCommands[index] || this.combat.previousCommands[index];
      if (!cmd || cmd.type !== 'GUARD') return;
      const targetIdx = cmd.guardTargetIndex;
      if (targetIdx == null || targetIdx < 0 || targetIdx >= this.party.length) return;
      if (this.party[targetIdx].hp <= 0) return;
      if (targetIdx === index) {
        selfGuardAc[index] = 1;
      } else {
        guardedBy[targetIdx] = index;
      }
    });

    // 1. Queue Party Member Commands
    this.party.forEach((hero, index) => {
      if (hero.hp <= 0) return;

      let cmd = this.combat.queuedCommands[index] || this.combat.previousCommands[index];
      if (!cmd) {
        const defaultTarget = this.combat.enemies.find(e => e.hp > 0);
        cmd = { type: 'ATTACK', targetInstanceId: defaultTarget ? defaultTarget.instanceId : null };
      }

      this.combat.previousCommands[index] = cmd;
      // BACKSTAB fastest → SHOOT / instant CAST fast → ATTACK/GUARD/PRAY/normal CAST medium → slow CAST last
      let phaseTier = 2;
      if (cmd.type === 'BACKSTAB') phaseTier = 0;
      else if (cmd.type === 'SHOOT') phaseTier = 1;
      else if (cmd.type === 'CAST') {
        const sp = hero.spells && hero.spells[cmd.spellIndex];
        const ct = (sp && sp.casting_time) || 'normal';
        phaseTier = ct === 'instant' ? 1 : ct === 'slow' ? 3 : 2;
      } else if (cmd.type === 'PRAY') phaseTier = 2; // divine channel — medium, no concentration interrupt
      else if (cmd.type === 'TURN') phaseTier = 1; // brandish holy symbol — fast
      else if (cmd.type === 'GUARD') phaseTier = 2;

      actionQueue.push({
        sourceType: 'HERO',
        heroIndex: index,
        hero: hero,
        command: cmd,
        phaseTier: phaseTier
      });
    });

    // 2. Queue Monster Commands (skip magical sleep / turned undead)
    this.combat.enemies.forEach(mob => {
      if (this.combat.round === 1 && this.combat.surpriseRound) return; // scouted — monsters skip round 1
      if (mob.hp <= 0) return;
      if ((mob.asleepRounds || 0) > 0) return;
      if ((mob.turnedRounds || 0) > 0) return;
      const consciousParty = this.party.filter(p => p.hp > 0);
      if (consciousParty.length === 0) return;

      const targetHero = consciousParty[Math.floor(Math.random() * consciousParty.length)];
      let phaseTier = mob.actionPhase === 'FAST' ? 1 : mob.actionPhase === 'SLOW' ? 3 : 2;

      actionQueue.push({
        sourceType: 'MONSTER',
        mob: mob,
        targetHero: targetHero,
        targetHeroIndex: this.party.indexOf(targetHero),
        phaseTier: phaseTier
      });
    });

    // 3. Sort by Speed Phase
    actionQueue.sort((a, b) => a.phaseTier - b.phaseTier);

    // 4. Resolve Actions Step-by-Step with Auto-Redirection & Early Victory Suspension
    for (const act of actionQueue) {
      const livingMobs = this.combat.enemies.filter(e => simMobHp[e.instanceId] > 0);

      // Suspend remaining queued actions if all monsters are already slain
      if (livingMobs.length === 0) {
        break;
      }

      if (act.sourceType === 'HERO') {
        const { hero, heroIndex, command } = act;
        if (simHeroHp[heroIndex] <= 0) continue; // Hero incapacitated earlier in round

        // --- GUARD: no attack, just declare (effects already in selfGuardAc / guardedBy) ---
        if (command.type === 'GUARD') {
          const gIdx = command.guardTargetIndex;
          const gName = (gIdx != null && this.party[gIdx]) ? this.party[gIdx].name : 'an ally';
          if (gIdx === heroIndex) {
            combatEvents.push({
              eventType: 'GUARD',
              sourceName: hero.name,
              logText: `🛡️ ${hero.name} raises a guard (+1 AC this round).`,
              logType: 'info'
            });
          } else {
            combatEvents.push({
              eventType: 'GUARD',
              sourceName: hero.name,
              logText: `🛡️ ${hero.name} steps in to shield ${gName}!`,
              logType: 'info'
            });
          }
          continue;
        }

        // Offensive actions need a living monster target
        let target = livingMobs.find(e => e.instanceId === command.targetInstanceId);
        if (!target) target = livingMobs[0];
        if (!target) break;

        if (command.type === 'BACKSTAB' && hero.isStealth) {
          hero.isStealth = false;
          const roll = Math.floor(Math.random() * 100) + 1;
          const chance = this.getSkillTarget(hero, 'hide_in_shadows') + 20;

          if (roll <= chance) {
            const rawDmg = (Math.floor(Math.random() * 8) + 2) * 2;
            const netDmg = this.applyArmorMitigation(rawDmg, 'slashing', target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              logText: `🗡️ ${hero.name} CRITICAL BACKSTAB on ${target.name} for ${netDmg} damage!`,
              logType: 'success'
            });
          } else {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              logText: `🗡️ ${hero.name}'s backstab missed ${target.name}!`,
              logType: 'warning'
            });
          }
        } else if (command.type === 'SHOOT') {
          // Requires a ranged weapon equipped (bow, crossbow, sling, …)
          if (!this.canHeroShoot(hero)) {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              logText: `🏹 ${hero.name} has no ranged weapon ready — shot aborted!`,
              logType: 'warning'
            });
            continue;
          }

          // Fast ranged shot — Dex-based to-hit; damage type from weapon catalog
          const roll = Math.floor(Math.random() * 20) + 1;
          const dexVal = hero.attributes.dexterity || 10;
          const bless = hero.tempAttackBonus || 0;
          const targetNum = dexVal + (hero.attackBonus || 0) + bless;
          const dmgType = this.getWeaponDamageType(hero.equippedWeapon, 'piercing');

          if (roll <= targetNum && roll !== 20) {
            const rawDmg = Math.floor(Math.random() * 6) + 2; // 2–7, slightly lighter than melee
            const netDmg = this.applyArmorMitigation(rawDmg, dmgType, target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              attackMode: 'ranged',
              logText: `🏹 ${hero.name} looses a shot at ${target.name} for ${netDmg} damage!`,
              logType: 'info'
            });
          } else {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              attackMode: 'ranged',
              logText: `🏹 ${hero.name}'s shot at ${target.name} goes wide!`,
              logType: 'muted'
            });
          }
        } else if (command.type === 'ATTACK' || !command.type) {
          // Melee Strike — requires a melee weapon equipped
          if (!this.canHeroMelee(hero)) {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              logText: `⚔️ ${hero.name} has no melee weapon ready — cannot strike!`,
              logType: 'warning'
            });
            continue;
          }

          const roll = Math.floor(Math.random() * 20) + 1;
          const strVal = hero.attributes.strength || 10;
          const bless = hero.tempAttackBonus || 0;
          const targetNum = strVal + (hero.attackBonus || 1) + bless;
          const dmgType = this.getWeaponDamageType(hero.equippedWeapon, 'slashing');

          if (roll <= targetNum && roll !== 20) {
            const rawDmg = Math.floor(Math.random() * 8) + 2;
            const netDmg = this.applyArmorMitigation(rawDmg, dmgType, target.armorType);
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - netDmg);
            const isDead = simMobHp[target.instanceId] <= 0;

            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: netDmg,
              isDead: isDead,
              attackMode: 'melee',
              logText: `⚔️ ${hero.name} strikes ${target.name} for ${netDmg} damage!`,
              logType: 'info'
            });
          } else {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              targetName: target.name,
              attackMode: 'melee',
              logText: `⚔️ ${hero.name} swings at ${target.name}... Missed!`,
              logType: 'muted'
            });
          }
        } else if (command.type === 'CAST') {
          // Vancian release — phase from casting_time; interrupt if damaged earlier this round
          const spellIndex = command.spellIndex;
          const spell = hero.spells && hero.spells[spellIndex];
          if (!spell || spell.spent) {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              logText: `🔮 ${hero.name}'s mind reaches for a spell that is no longer there...`,
              logType: 'warning'
            });
            continue;
          }

          const load = spell.cognitive_load || 20;
          const refund = Math.floor(load * 0.8);
          // Construct always unravels on attempt (success or fizzle)
          spell.spent = true;
          hero.cognition = Math.min(hero.maxCognition || 100, (hero.cognition || 0) + refund);

          if (castInterrupted[heroIndex]) {
            combatEvents.push({
              eventType: 'SPELL_FIZZLE',
              sourceName: hero.name,
              spellId: spell.id,
              targetHeroIndex: heroIndex,
              logText: `💫 ${hero.name}'s ${spell.name} collapses! Concentration broken — construct erased (mind eases +${refund}).`,
              logType: 'danger'
            });
            continue;
          }

          const effect = spell.effect || {};
          const spellTarget = spell.target || 'enemy';

          if (effect.type === 'damage' && spellTarget === 'enemy') {
            let target = livingMobs.find(e => e.instanceId === command.targetInstanceId);
            if (!target) target = livingMobs[0];
            if (!target) {
              combatEvents.push({
                eventType: 'SPELL_CAST',
                sourceName: hero.name,
                logText: `🔮 ${hero.name} casts ${spell.name} — but no foes remain!`,
                logType: 'muted'
              });
              continue;
            }
            const dmg = effect.amount || 12;
            simMobHp[target.instanceId] = Math.max(0, simMobHp[target.instanceId] - dmg);
            const isDead = simMobHp[target.instanceId] <= 0;
            combatEvents.push({
              eventType: 'MONSTER_HIT',
              sourceName: hero.name,
              targetInstanceId: target.instanceId,
              targetName: target.name,
              damage: dmg,
              isDead,
              attackMode: 'spell',
              spellId: spell.id,
              logText: `🔮 ${hero.name} unleashes ${spell.name} on ${target.name} for ${dmg} damage! (mind eases +${refund})`,
              logType: 'success'
            });
          } else if (effect.type === 'sleep' && spellTarget === 'enemy') {
            let target = livingMobs.find(e => e.instanceId === command.targetInstanceId);
            if (!target) target = livingMobs[0];
            if (!target) continue;
            const threshold = effect.max_hp_threshold || 30;
            const curHp = simMobHp[target.instanceId];
            if (curHp <= threshold) {
              target.asleepRounds = effect.duration_rounds || 2;
              combatEvents.push({
                eventType: 'SPELL_CAST',
                sourceName: hero.name,
                spellId: spell.id,
                logText: `💤 ${hero.name} casts Sleep — ${target.name} collapses into slumber! (mind eases +${refund})`,
                logType: 'success'
              });
            } else {
              combatEvents.push({
                eventType: 'SPELL_CAST',
                sourceName: hero.name,
                spellId: spell.id,
                logText: `💤 ${hero.name} casts Sleep — ${target.name} resists the drowse (too hardy). (mind eases +${refund})`,
                logType: 'warning'
              });
            }
          } else if (effect.type === 'buff_ac') {
            hero.tempAcBonus = effect.amount || 2;
            hero.tempAcRounds = effect.duration_rounds || 4;
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `🛡️ ${hero.name} casts Shield — a shimmering barrier forms! (+${hero.tempAcBonus} AC, ${hero.tempAcRounds} rounds) (mind eases +${refund})`,
              logType: 'success'
            });
          } else {
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `🔮 ${hero.name} casts ${spell.name}. (mind eases +${refund})`,
              logType: 'info'
            });
          }
        } else if (command.type === 'PRAY') {
          // Divine channel — no cognitive burden, no interrupt fizzle (deity supplies the power)
          const spellIndex = command.spellIndex;
          const spell = hero.spells && hero.spells[spellIndex];
          if (!spell || spell.spent || hero.divineFavor <= 0 || hero.absoluteSilence) {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              logText: `✨ ${hero.name}'s petition goes unanswered...`,
              logType: 'warning'
            });
            continue;
          }
          spell.spent = true;
          const effect = spell.effect || {};

          if (effect.type === 'heal') {
            // Heal lowest-HP living ally (or targeted hero index if provided)
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
            const actual = simHeroHp[targetIdx] - before;
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `✨ ${hero.name} invokes ${spell.name} — ${this.party[targetIdx].name} recovers ${actual} HP!`,
              logType: 'success'
            });
          } else if (effect.type === 'buff_attack') {
            this.party.forEach((h, i) => {
              if (simHeroHp[i] > 0) {
                h.tempAttackBonus = effect.amount || 1;
                h.tempAttackRounds = effect.duration_rounds || 4;
              }
            });
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `✨ ${hero.name} invokes Bless — the party is heartened (+${effect.amount || 1} attack, ${effect.duration_rounds || 4} rounds)!`,
              logType: 'success'
            });
          } else if (effect.type === 'buff_ac') {
            hero.tempAcBonus = effect.amount || 2;
            hero.tempAcRounds = effect.duration_rounds || 3;
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `✨ ${hero.name} invokes Sanctuary — a divine ward turns blows (+${hero.tempAcBonus} AC, ${hero.tempAcRounds} rounds)!`,
              logType: 'success'
            });
          } else {
            combatEvents.push({
              eventType: 'SPELL_CAST',
              sourceName: hero.name,
              spellId: spell.id,
              logText: `✨ ${hero.name} invokes ${spell.name}.`,
              logType: 'info'
            });
          }
        } else if (command.type === 'TURN') {
          // Turn Undead — eviction notice, not damage. Requires communion.
          if (hero.classKey !== 'cleric' || hero.divineFavor <= 0 || hero.absoluteSilence) {
            combatEvents.push({
              eventType: 'HERO_MISS',
              sourceName: hero.name,
              logText: `✨ ${hero.name} raises the holy symbol — but the heavens are silent.`,
              logType: 'warning'
            });
            continue;
          }

          const undead = livingMobs.filter(e => e.creatureType === 'undead' && simMobHp[e.instanceId] > 0);
          if (undead.length === 0) {
            combatEvents.push({
              eventType: 'TURN_UNDEAD',
              sourceName: hero.name,
              logText: `✨ ${hero.name} brandishes the holy symbol — no undead abominations present.`,
              logType: 'muted'
            });
            continue;
          }

          const roll = Math.floor(Math.random() * 20) + 1;
          // Wisdom skill turn_undead softens hard targets slightly (not full 2e table)
          const skillBonus = Math.floor((this.getSkillTarget(hero, 'turn_undead') - 14) / 3);
          const effectiveRoll = roll + Math.max(0, skillBonus);

          let destroyed = 0;
          let fled = 0;
          let resisted = 0;

          undead.forEach(mob => {
            const tier = mob.undeadTier || 'weak';
            const need = this.getTurnUndeadTarget(hero.level || 1, tier);
            if (need == null) {
              resisted++;
              return;
            }
            if (need === 'D' || effectiveRoll >= 20) {
              simMobHp[mob.instanceId] = 0;
              destroyed++;
            } else if (effectiveRoll >= need) {
              mob.turnedRounds = 3;
              fled++;
            } else {
              resisted++;
            }
          });

          let detail = [];
          if (destroyed) detail.push(`${destroyed} destroyed`);
          if (fled) detail.push(`${fled} flee in terror`);
          if (resisted) detail.push(`${resisted} unfazed`);
          combatEvents.push({
            eventType: 'TURN_UNDEAD',
            sourceName: hero.name,
            logText: `✨ ${hero.name} asserts divine authority! (d20=${roll}${skillBonus > 0 ? `+${skillBonus}` : ''}) — ${detail.join(', ') || 'no effect'}.`,
            logType: destroyed || fled ? 'success' : 'warning'
          });
        }

      } else if (act.sourceType === 'MONSTER') {
        const { mob, targetHero, targetHeroIndex } = act;
        if (simMobHp[mob.instanceId] <= 0) continue;
        if (simHeroHp[targetHeroIndex] <= 0) continue;

        // Ally-guard redirect: blow lands on the guardian if they are still up
        let finalHeroIndex = targetHeroIndex;
        let finalHero = targetHero;
        let redirected = false;
        const guardianIdx = guardedBy[targetHeroIndex];
        if (guardianIdx != null && simHeroHp[guardianIdx] > 0) {
          finalHeroIndex = guardianIdx;
          finalHero = this.party[guardianIdx];
          redirected = true;
        }

        // Self-guard + Shield / temp AC → monster's roll-under target is harder
        const guardBonus = selfGuardAc[finalHeroIndex] || 0;
        const spellAc = (this.party[finalHeroIndex] && this.party[finalHeroIndex].tempAcBonus) || 0;
        const acBonus = guardBonus + spellAc;
        const effectiveTarget = (mob.attackTarget || 10) - acBonus;

        const roll = Math.floor(Math.random() * 20) + 1;
        if (roll <= effectiveTarget) {
          // Use monster's declared damage die when present (e.g. "1d6", "1d4+1"); fallback soft 1–4
          const rawDmg = this.rollMonsterDamage(mob.damage);
          simHeroHp[finalHeroIndex] = Math.max(0, simHeroHp[finalHeroIndex] - rawDmg);
          const isDead = simHeroHp[finalHeroIndex] <= 0;

          let logText;
          if (redirected) {
            logText = `💥 ${mob.name} strikes at ${targetHero.name} — ${finalHero.name} interposes and takes ${rawDmg} damage!`;
          } else {
            logText = `💥 ${mob.name} strikes ${finalHero.name} for ${rawDmg} damage!`;
          }

          // Any damage before a pending CAST collapses concentration
          castInterrupted[finalHeroIndex] = true;

          combatEvents.push({
            eventType: 'HERO_HIT',
            sourceName: mob.name,
            targetHeroIndex: finalHeroIndex,
            targetHeroName: finalHero.name,
            damage: rawDmg,
            isDead: isDead,
            redirected: redirected,
            logText: logText,
            logType: 'danger'
          });
        } else {
          const missName = redirected ? finalHero.name : targetHero.name;
          combatEvents.push({
            eventType: 'MONSTER_MISS',
            sourceName: mob.name,
            targetHeroName: missName,
            logText: redirected
              ? `🛡️ ${mob.name} attacks ${targetHero.name}, but ${finalHero.name} turns the blow aside!`
              : `🛡️ ${mob.name} attacks ${targetHero.name}... Misses!`,
            logType: 'muted'
          });
        }
      }
    }

    // 5. Evaluate Victory / Party Wipe (pure — no mutation of live HP / combat flags yet)
    const aliveAfter = this.combat.enemies.filter(e => (simMobHp[e.instanceId] ?? e.hp) > 0);
    const livingHeroes = Object.values(simHeroHp).filter(hp => hp > 0).length;
    let victory = false;
    let partyWiped = false;
    let totalXp = 0;
    if (aliveAfter.length === 0) {
      victory = true;
      totalXp = this.combat.enemies.reduce((sum, e) => sum + (e.xpReward || 0), 0);
      combatEvents.push({
        eventType: 'VICTORY',
        logText: `🏆 COMBAT VICTORIOUS! Acquired +${totalXp} XP!`,
        logType: 'success'
      });
    } else if (livingHeroes === 0) {
      partyWiped = true;
      combatEvents.push({
        eventType: 'PARTY_WIPED',
        logText: `💀 The last of the company falls. The flooded dark claims its due.`,
        logType: 'danger'
      });
    }

    // Clear orders for the next decision phase; round number & HP are committed later
    // by CombatController after the staged presentation finishes.
    this.combat.queuedCommands = {};

    return {
      events: combatEvents,
      finalMobHp: simMobHp,
      finalHeroHp: simHeroHp,
      victory,
      partyWiped,
      totalXp
    };
  }

  /**
   * Applies the final HP maps and victory side-effects after the staged
   * combat presentation has finished. Keeps resolveCombatRound pure so
   * UI can reveal damage in sync with logs / SFX / shakes.
   */
  commitCombatRoundResults(finalMobHp, finalHeroHp, victory, totalXp) {
    this.combat.enemies.forEach(e => {
      if (finalMobHp[e.instanceId] !== undefined) e.hp = finalMobHp[e.instanceId];
      // Tick magical sleep / turned undead
      if ((e.asleepRounds || 0) > 0) {
        e.asleepRounds -= 1;
        if (e.asleepRounds <= 0) e.asleepRounds = 0;
      }
      if ((e.turnedRounds || 0) > 0) {
        e.turnedRounds -= 1;
        if (e.turnedRounds <= 0) e.turnedRounds = 0;
      }
    });
    this.party.forEach((h, idx) => {
      if (finalHeroHp[idx] !== undefined) h.hp = finalHeroHp[idx];
      // Tick Shield / Sanctuary AC and Bless attack
      if ((h.tempAcRounds || 0) > 0) {
        h.tempAcRounds -= 1;
        if (h.tempAcRounds <= 0) {
          h.tempAcRounds = 0;
          h.tempAcBonus = 0;
        }
      }
      if ((h.tempAttackRounds || 0) > 0) {
        h.tempAttackRounds -= 1;
        if (h.tempAttackRounds <= 0) {
          h.tempAttackRounds = 0;
          h.tempAttackBonus = 0;
        }
      }
    });

    this.combat.round += 1;

    if (victory) {
      this.combat.active = false;
      this.awardQuestXP(totalXp || 0);
    }
  }



  /**
   * Awards XP to all active party members and checks for level progression.
   */
  awardQuestXP(amount) {
    this.party.forEach(hero => {
      hero.xp = (hero.xp || 0) + amount;
      while (hero.xp >= hero.nextLevelXp) {
        hero.level += 1;
        hero.nextLevelXp = Math.round(hero.nextLevelXp * 2.2);
        const hpBonus = hero.classKey === 'fighter' ? 15 : hero.classKey === 'cleric' ? 10 : 8;
        hero.maxHp += hpBonus;
        hero.hp = Math.min(hero.maxHp, hero.hp + hpBonus);
        this.addLog(`LEVEL UP! ${hero.name} reached Level ${hero.level}! (+${hpBonus} HP, Skill Thresholds expanded)`, "success");
      }
    });
  }

  /**
   * Evaluates and applies moral taxes or rewards to Cleric's Divine Favor
   * 
   * @param {number} baseTax - Signed integer (+ for virtue, - for transgression)
   * @param {Object} activeSpeaker - Character object of the active orator
   * @param {number} customMultiplier - Optional choice-specific multiplier override
   */
  applyMoralTax(baseTax, activeSpeaker, customMultiplier = null) {
    if (!baseTax || baseTax === 0) return;

    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric || cleric.hp <= 0) {
      this.addLog("The Cleric is unconscious; spiritual consequences pass unheeded.", "warning");
      return;
    }

    const isClericSpeaker = (activeSpeaker && activeSpeaker.classKey === 'cleric');
    const defaultMultiplier = isClericSpeaker ? 2.0 : 1.0;
    const effectiveMultiplier = customMultiplier !== null ? customMultiplier : defaultMultiplier;

    const finalDelta = Math.round(baseTax * effectiveMultiplier);
    const previousFavor = cleric.divineFavor;

    cleric.divineFavor = Math.min(100, Math.max(0, cleric.divineFavor + finalDelta));
    const actualDelta = cleric.divineFavor - previousFavor;

    if (actualDelta < 0) {
      if (isClericSpeaker) {
        this.addLog(`DIRECT TRANSGRESSION! The Cleric's personal action lost ${Math.abs(actualDelta)}% Divine Favor!`, "danger");
      } else {
        this.addLog(`Complicity Tax: The Cleric loses ${Math.abs(actualDelta)}% Divine Favor for allowing this act.`, "danger");
      }
    } else if (actualDelta > 0) {
      if (isClericSpeaker) {
        this.addLog(`DIVINE EXALTATION! The Cleric's holy leadership restored +${actualDelta}% Divine Favor!`, "success");
      } else {
        this.addLog(`Virtuous Conduct: The party's decision pleases the gods (+${actualDelta}% Divine Favor).`, "success");
      }
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

  attemptPickpocket(npc) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief || thief.hp <= 0) return { success: false, reason: "Thief is incapacitated or missing." };
    if (!npc.inventory_to_steal || npc.inventory_to_steal.length === 0) {
      return { success: false, reason: "Target has nothing left to steal." };
    }
    const chance = this.getSkillTarget(thief, 'pick_pockets');
    const roll = Math.floor(Math.random() * 100) + 1;
    if (roll <= chance) {
      const stolenItem = npc.inventory_to_steal.shift();
      this.inventory.push(stolenItem);
      return { success: true, roll, chance, stolenItem };
    } else {
      const npcState = this.getNPCState(npc.id);
      npcState.attitude = Math.max(-100, npcState.attitude - 40);
      npcState.endBehavior = 'despawn'; // they won't stick around to be robbed again
      const nearby = (this.spec.encounters || []).find(e => {
        if (e.completed) return false;
        const dist = Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y));
        return dist <= 2;
      });
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

  /** True when the tile immediately ahead is solid stone (blocks Scout). Doors do not count. */
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
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;
    if (targetY >= 0 && targetY < this.spec.map.length && targetX >= 0 && targetX < this.spec.map[0].length) {
      const tileId = this.spec.map[targetY][targetX];
      const tileDef = this.spec.legend[tileId];
      const key = `${targetX},${targetY}`;
      if (tileDef && tileDef.trap && !this.disarmedTraps.has(key)) {
        return {
          x: targetX,
          y: targetY,
          ...tileDef.trap,
          detected: this.detectedTraps.has(key)
        };
      }
    }
    return null;
  }

  attemptFindTrap(target) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief) return { success: false, roll: 0, chance: 0 };
    const chance = this.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const key = `${target.x},${target.y}`;
    const success = roll <= chance;
    if (success) {
      this.detectedTraps.add(key);
    }
    return { success, roll, chance };
  }

  attemptDisarmTrap(target) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief || thief.toolsDurability <= 0) {
      return { success: false, triggered: false, reason: "No operational thieves' tools available!" };
    }
    thief.toolsDurability = Math.max(0, thief.toolsDurability - 10);
    const chance = this.getSkillTarget(thief, 'disarm_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const key = `${target.x},${target.y}`;
    if (roll <= chance) {
      this.disarmedTraps.add(key);
      return { success: true, triggered: false, roll, chance };
    } else {
      this.disarmedTraps.add(key);
      const fighter = this.party.find(p => p.classKey === 'fighter') || this.party[0];
      fighter.hp = Math.max(0, fighter.hp - (target.damage || 15));
      return { success: false, triggered: true, roll, chance, damage: target.damage || 15 };
    }
  }
  /**
 * Peers up to `range` tiles along the party's facing without moving the
 * party token. Stops at the first wall. Populates the same detectedTraps
 * set as attemptFindTrap, and marks encounters as scouted so they grant
 * a surprise round (or can be avoided via Hide in Shadows) on arrival.
 */
  attemptScout(range = 3) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "No conscious thief in the party." };
    if (this.isFacingWall()) return { success: false, reason: "Solid stone blocks the way ahead." };

    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;

    // Scout shares the find_traps rating: same acuity for spotting hidden devices and
    // hostiles along a line of sight. Distinct from adjacent Find Traps (targeted).
    const chance = this.getSkillTarget(thief, 'find_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    const discoveries = [];

    if (success) {
      for (let step = 1; step <= range; step++) {
        const tx = this.player.x + dx * step, ty = this.player.y + dy * step;
        if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) break;
        const tileId = this.spec.map[ty][tx];
        if (tileId === 1) break; // wall blocks line of sight

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
      // Failed scout can still tip off nearby hostiles within the same range.
      const nearby = (this.spec.encounters || []).find(e => {
        if (e.completed) return false;
        const dist = Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y));
        return dist <= range;
      });
      if (nearby) nearby.alerted = true;
    }
    return { success, roll, chance, discoveries };
  }

  /**
   * Automatic, fuzzy proximity check — fires on every party step. Never
   * reveals a tile, only a direction, and only within 2 tiles. This is
   * intentionally imprecise: it's a warning, not a radar.
   */
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

  /**
   * Attempt to sneak past an encounter while stealthed.
   * On success: stealth is spent and encounter is bypassed.
   * On failure: stealth is KEPT so the thief can still Backstab in the ensuing combat
   * (ambush from the shadows even after the alarm is raised).
   * Larger conscious party = harder to keep quiet.
   */
  attemptSneakPastEncounter(encounter) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief || !thief.isStealth) return { success: false, reason: "Not sneaking." };

    const consciousCount = this.party.filter(p => p.hp > 0).length;
    const penalty = Math.max(0, consciousCount - 1) * 5;
    const chance = Math.max(5, this.getSkillTarget(thief, 'hide_in_shadows') - penalty);
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;

    if (success) {
      thief.isStealth = false;
      encounter.completed = true;
    } else {
      // Keep isStealth so Backstab remains available for the first combat action
      encounter.alerted = true;
    }
    return { success, roll, chance, encounterName: encounter.name };
  }

  /**
 * Resolves a triggered trap against the whole conscious party.
 * Each member gets an individual saving throw; success halves their
 * share of the damage rather than negating it (matches 2e's usual
 * "save for half" convention for area/mechanical trap effects).
 *
 * @param {Object} trapDef - the trap definition from the map legend
 *   trapDef.saveCategory optionally selects poison/wand/petrification/breath/spell;
 *   defaults to 'breath' since most traps are mechanical/AoE in nature.
 */
  triggerTrap(trapDef) {
    const totalDamage = trapDef.damage || 15;
    const category = trapDef.saveCategory || 'breath';
    const activeMembers = this.party.filter(p => p.hp > 0);
    if (activeMembers.length === 0) {
      return { totalDamage, category, damagePerPlayer: 0, results: [] };
    }

    const damagePerPlayer = Math.ceil(totalDamage / activeMembers.length);

    const results = activeMembers.map(member => {
      const save = this.checkSavingThrow(member, category);
      const damage = save.success ? Math.ceil(damagePerPlayer / 2) : damagePerPlayer;
      member.hp = Math.max(0, member.hp - damage);
      return {
        heroName: member.name,
        heroIndex: this.party.indexOf(member),
        save,
        damage,
        isDead: member.hp <= 0
      };
    });

    return { totalDamage, category, damagePerPlayer, results };
  }

  attemptPickLock(targetType) {
    const thief = this.party.find(p => p.classKey === 'thief');
    if (!thief || thief.toolsDurability <= 0) {
      return { success: false, reason: "No operational thieves' tools available!" };
    }
    thief.toolsDurability = Math.max(0, thief.toolsDurability - 15);
    const chance = this.getSkillTarget(thief, 'pick_locks');
    const roll = Math.floor(Math.random() * 100) + 1;
    const success = roll <= chance;
    return { success, roll, chance };
  }

  unlockTarget(x, y, type) {
    const key = `${x},${y}`;
    if (type === 'door') this.unlockedDoors.add(key);
    if (type === 'chest') this.unlockedChests.add(key);
  }

  modifyDivineFavor(delta) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return;
    cleric.divineFavor = Math.max(0, Math.min(cleric.maxDivineFavor, cleric.divineFavor + delta));
    const thresholds = this.classesSpec.archetypes.cleric.divine_favor.thresholds;
    const current = thresholds.find(t => cleric.divineFavor >= t.min && cleric.divineFavor <= t.max);
    if (current) {
      cleric.ethosStatus = current.status;
    }
  }

  isWalkable(x, y) {
    if (y < 0 || y >= this.spec.map.length || x < 0 || x >= this.spec.map[0].length) {
      return false;
    }
    const tileId = this.spec.map[y][x];
    const key = `${x},${y}`;
    if (tileId === 2 && this.openedDoors.has(key)) {
      return true;
    }
    const tileDef = this.spec.legend[tileId];
    return tileDef && tileDef.walkable;
  }

  moveForward() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    if (this.player.facing === 'SOUTH') dy = 1;
    if (this.player.facing === 'EAST') dx = 1;
    if (this.player.facing === 'WEST') dx = -1;
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;
    if (this.isWalkable(targetX, targetY)) {
      this.player.x = targetX;
      this.player.y = targetY;
      return true;
    }
    return false;
  }

  moveBackward() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = 1;
    if (this.player.facing === 'SOUTH') dy = -1;
    if (this.player.facing === 'EAST') dx = -1;
    if (this.player.facing === 'WEST') dx = 1;
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;
    if (this.isWalkable(targetX, targetY)) {
      this.player.x = targetX;
      this.player.y = targetY;
      return true;
    }
    return false;
  }

  rotate(direction) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(this.player.facing);
    if (direction === 'RIGHT') {
      index = (index + 1) % 4;
    } else {
      index = (index - 1 + 4) % 4;
    }
    this.player.facing = directions[index];
  }

  markDoorOpen(x, y) {
    this.openedDoors.add(`${x},${y}`);
  }

  openChest(x, y) {
    const key = `${x},${y}`;
    if (this.openedChests.has(key)) return null;
    this.openedChests.add(key);
    const generatedLoot = [
      { name: "Potion of Healing", type: "consumable" },
      { name: "Gold Pieces", amount: 75, type: "currency" }
    ];
    this.inventory.push(...generatedLoot);
    return generatedLoot;
  }

  /**
   * Completes a successful rest. Called only when the camp timer finishes
   * without interruption. Consumes 1 ration and applies partial recovery
   * (2e-style: never a full heal at 1st level).
   */
  restParty() {
    if (!this.inventory) this.inventory = [];

    let rationItem = this.inventory.find(i => {
      const name = (i.name || "").toLowerCase();
      return name.includes("ration") || name.includes("food");
    });

    if (!rationItem) {
      return { success: false, reason: "The party has no Rations left to camp!" };
    }

    const qtyKey = rationItem.amount !== undefined ? 'amount' : (rationItem.count !== undefined ? 'count' : 'amount');
    const currentQty = rationItem[qtyKey] !== undefined ? rationItem[qtyKey] : 0;

    if (currentQty <= 0) {
      return { success: false, reason: "The party has no Rations left to camp!" };
    }

    rationItem[qtyKey] = currentQty - 1;
    if (rationItem[qtyKey] <= 0) {
      this.inventory = this.inventory.filter(i => i !== rationItem);
    }

    const recoveries = [];

    this.party.forEach(member => {
      if (member.hp <= 0) {
        // Incapacitated members stabilize but do not regain fighting strength from a short rest
        recoveries.push({ name: member.name, hpGained: 0, note: 'stabilized only' });
        return;
      }

      // Modest recovery: ~30–40% of max HP + small Con contribution (never full heal)
      const conBonus = Math.floor(((member.attributes && member.attributes.constitution) || 10) - 10) / 2;
      const base = Math.max(3, Math.floor(member.maxHp * 0.35));
      const gained = Math.max(2, Math.floor(base + conBonus));
      const before = member.hp;
      member.hp = Math.min(member.maxHp, member.hp + gained);
      const actual = member.hp - before;

      // Clear temporary combat buffs
      member.tempAcBonus = 0;
      member.tempAcRounds = 0;
      member.tempAttackBonus = 0;
      member.tempAttackRounds = 0;

      if (member.classKey === 'mage') {
        // Clears residual cognitive burn; spent constructs stay erased until Study Grimoire
        member.cognition = member.maxCognition;
        member.hasStudiedSinceRest = false;
      }
      if (member.classKey === 'cleric') {
        // Quiet devotion restores a little favor; prayers stay closed until petition
        member.divineFavor = Math.min(member.maxDivineFavor, (member.divineFavor || 0) + 12);
        if (member.divineFavor > 0) member.absoluteSilence = false;
        member.hasPrayedSinceRest = false;
        this.#syncClericEthos(member);
      }

      recoveries.push({ name: member.name, hpGained: actual, hp: member.hp, maxHp: member.maxHp });
    });

    return {
      success: true,
      remainingRations: rationItem[qtyKey] || 0,
      recoveries
    };
  }

  /**
   * Returns an incomplete encounter that can ambush a resting party, or null.
   * Nearby unfinished encounters raise the chance significantly.
   */
  checkRestAmbush() {
    const incomplete = (this.spec.encounters || []).filter(e => !e.completed);
    if (incomplete.length === 0) return null;

    const px = this.player.x;
    const py = this.player.y;
    const nearby = incomplete.filter(e =>
      Math.abs((e.x || 0) - px) + Math.abs((e.y || 0) - py) <= 4
    );

    // 35% if hostiles still active nearby, otherwise 12%
    const chance = nearby.length > 0 ? 35 : 12;
    if (Math.random() * 100 >= chance) return null;

    // Prefer the nearest
    const pool = nearby.length > 0 ? nearby : incomplete;
    pool.sort((a, b) => {
      const da = Math.abs(a.x - px) + Math.abs(a.y - py);
      const db = Math.abs(b.x - px) + Math.abs(b.y - py);
      return da - db;
    });
    return pool[0];
  }

  checkInteractionTrigger(x, y) {
    if (!this.spec.interactions) return null;
    const key = `${x},${y}`;
    if (this.triggeredEvents.has(key)) return null;
    const trigger = this.spec.interactions.find(t => t.x === x && t.y === y);
    if (trigger) {
      this.triggeredEvents.add(key);
      return trigger;
    }
    return null;
  }

  /**
   * Morning / camp petition — deity grants the day's allotment.
   * No favor cost (favor is moral standing, not a cast resource).
   * Requires communion (favor > 0). Does not mirror Vancian cognition tax.
   */
  studyClericPrayers() {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (this.combat.active) return { success: false, reason: "Cannot petition during combat!" };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) {
      return { success: false, reason: "Absolute Silence — the deity does not answer." };
    }
    const hasSpent = cleric.spells.some(s => s.spent);
    if (!hasSpent) return { success: false, reason: "Today's prayers are already granted and held." };

    // Strained faith: only restore half the spent slots (deity withholds)
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

  /**
   * Exploration invocation — closes that daily allotment. No favor spent or refunded.
   */
  castClericPrayer(spellIndex) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) {
      return { success: false, reason: "Absolute Silence — no divine power flows." };
    }
    if (!cleric.spells[spellIndex] || cleric.spells[spellIndex].spent) {
      return { success: false, reason: "That prayer was already invoked today." };
    }
    const spell = cleric.spells[spellIndex];
    spell.spent = true;
    return {
      success: true,
      spellName: spell.name,
      spellId: spell.id,
      effect: spell.effect,
      target: spell.target
    };
  }

  #syncClericEthos(cleric) {
    const thresholds = this.classesSpec.archetypes.cleric.divine_favor.thresholds;
    const current = thresholds.find(t => cleric.divineFavor >= t.min && cleric.divineFavor <= t.max);
    if (current) cleric.ethosStatus = current.status;
  }

  /**
   * Exploration cast — erases the construct and refunds 80% of its cognitive load.
   * Residual 20% burn clears only on full rest.
   */
  castMageSpell(spellIndex) {
    const mage = this.party.find(p => p.classKey === 'mage');
    if (!mage || !mage.spells[spellIndex] || mage.spells[spellIndex].spent) {
      return { success: false, reason: "Spell already spent or invalid!" };
    }
    const spell = mage.spells[spellIndex];
    const load = spell.cognitive_load || 20;
    const refund = Math.floor(load * 0.8);
    spell.spent = true;
    mage.cognition = Math.min(mage.maxCognition, mage.cognition + refund);
    return {
      success: true,
      spellName: spell.name,
      spellId: spell.id,
      refund,
      residualBurn: load - refund,
      currentCognition: mage.cognition,
      effect: spell.effect,
      target: spell.target
    };
  }

  /**
   * Vancian rememorization: pay full cognitive_load for each spent spell to reload it.
   * Only out of combat. Cannot study more burden than free cognition allows
   * (overflow becomes brain-burn HP damage).
   */
  studyGrimoire() {
    const mage = this.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (this.combat.active) {
      return { success: false, reason: "Cannot study the grimoire during combat!" };
    }

    const spent = mage.spells.filter(s => s.spent);
    if (spent.length === 0) {
      return { success: false, reason: "All prepared constructs are still held in mind." };
    }

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

    return {
      success: true,
      cognitiveCost,
      brainBurnDamage,
      rememorized: spent.map(s => s.name),
      currentCognition: mage.cognition,
      mageHp: mage.hp
    };
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
      return {
        x: tx, y: ty,
        methods: tileDef.locked.methods,
        dc: tileDef.locked.dc,
        type: tileId == 2 ? 'door' : 'chest',
        tileDef: tileDef
      };
    }
    return null;
  }

  attemptBash(fighter) {
    const target = this.getSkillTarget(fighter, 'bash');
    const roll = Math.floor(Math.random() * 20) + 1;
    const success = (roll <= target) && (roll !== 20);
    return { success, roll, target };
  }

  attemptReadMagic(mage, lock) {
    const cogCost = 15;
    if (mage.cognition < cogCost) return { success: false, reason: "Insufficient cognition!" };
    mage.cognition -= cogCost;
    const target = this.getSkillTarget(mage, 'read_magic');
    const roll = Math.floor(Math.random() * 20) + 1;
    const success = (roll <= target) && (roll !== 20);
    return { success, roll, target };
  }
}