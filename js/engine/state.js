import { resolveSavingThrow } from './saving_throws.js';
import { SpellRegistry } from './spell_registry.js';
import { CombatCalculator } from './combat/combat_calculator.js';
import { CombatActions } from './combat/combat_actions.js';
import { CombatEngine } from './combat/combat_engine.js';
import { ItemCatalog } from './items/item_catalog.js';
import { InventoryManager } from './items/inventory_manager.js';
import { ProgressionManager } from './characters/progression_manager.js';
import { CharacterFactory } from './characters/character_factory.js';

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

  /** Master weapon catalog delegate */
  static WEAPON_CATALOG = ItemCatalog.WEAPONS;

  /** Master item catalog delegate */
  static ITEM_CATALOG = ItemCatalog.ITEMS;

  /** Attack Bonus Growth per class, purely dependent on current level. */
  static ATTACK_BONUS_GROWTH = ProgressionManager.ATTACK_BONUS_GROWTH;

  /** Progression gates for standard weapon mastery. */
  static MASTERY_TIERS = ProgressionManager.MASTERY_TIERS;

  /** Progression gates for Thief scouting/stealth track. */
  static SHADOW_TIERS = ProgressionManager.SHADOW_TIERS;

  /** Progression gates for Thief backstab track. */
  static BACKSTAB_TIERS = ProgressionManager.BACKSTAB_TIERS;

  /**
   * AD&D 2nd Edition Dexterity Defensive Adjustment Table (PHB Table 8).
   */
  static getDexDefensiveAdjustment(dexterity) {
    return ProgressionManager.getDexDefensiveAdjustment(dexterity);
  }

  /**
   * Derives AD&D 2nd Edition THAC0 for a monster.
   */
  getMonsterThaco(mob) {
    return ProgressionManager.getMonsterThaco(mob);
  }

  /**
   * Calculates a hero's effective AC in AD&D 2e (lower is better),
   * accounting for base armor, shield, DEX, temporary magical wards, and tactical Guard stance.
   */
  getHeroEffectiveAC(hero, isGuarding = false) {
    return ProgressionManager.getHeroEffectiveAC(hero, isGuarding);
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
      { name: "Arrows", amount: 20, type: "ammo" },
      { name: "Bolts", amount: 15, type: "ammo" },
      { name: "Sling Bullets", amount: 20, type: "ammo" }
    ];

    this.openedDoors = new Set();
    this.openedChests = new Set();
    this.unlockedDoors = new Set();
    this.unlockedChests = new Set();
    this.detectedTraps = new Set();
    this.disarmedTraps = new Set();
    this.triggeredEvents = new Set();
    this.exploredTiles = new Set();
    this.failedLockAttempts = new Set(); // Tracks "${x},${y}:${thiefLevel}" lockout
    this.spawnedPatrolZones = new Set(); // Tracks unique area patrol spawns so patrols do not spawn infinitely
    this.explorationTurnCounter = 0;     // Accumulates 10-minute exploration turns for periodic 30-min hazard checks
    this.consecratedSteps = 0;
    
    this.activeNpc = null;
    this.selectedSpeaker = null;
    this.npcStates = {};
    this.surrenderedEnemy = null;

    this.combat = {
      active: false,
      round: 1,
      encounterId: null,
      enemies: [],               // Active monster instances
      queuedCommands: {},        // Pending orders for the turn
      previousCommands: {},      // Smart Action Memory
      channelingCast: null,      // Track multi-turn casting
      moraleCheckedFirstBlood: false,
      moraleCheckedHalfSquad: false,
      moraleCheckedLeader: false
    };

    this.torchLitUntil = 0;
    this.lightSpellUntil = 0;

    this.onLog = null; // UI Event Delegate Hook

    // Initialize initial exploration vision for starting tile
    this.revealExploration();
  }

  /**
   * Fog of War: Unveils explored coordinates in line-of-sight around the party.
   */
  revealExploration(px = this.player.x, py = this.player.y, facing = this.player.facing) {
    if (!this.spec || !this.spec.map) return;
    const rows = this.spec.map.length;
    const cols = this.spec.map[0].length;

    const addTile = (x, y) => {
      if (x >= 0 && x < cols && y >= 0 && y < rows) {
        this.exploredTiles.add(`${x},${y}`);
      }
    };

    // Always reveal current standing position
    addTile(px, py);

    // Reveal immediate 8 surrounding tiles (radius 1 around party)
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        addTile(px + dx, py + dy);
      }
    }

    // Directional vector mapping
    const fVecs = {
      'NORTH': { fx: 0, fy: -1, lx: -1, ly: 0, rx: 1, ry: 0 },
      'SOUTH': { fx: 0, fy: 1, lx: 1, ly: 0, rx: -1, ry: 0 },
      'EAST': { fx: 1, fy: 0, lx: 0, ly: -1, rx: 0, ry: 1 },
      'WEST': { fx: -1, fy: 0, lx: 0, ly: 1, rx: 0, ry: -1 }
    };

    const v = fVecs[facing] || fVecs['NORTH'];

    // Cast line of sight forward (up to 4 tiles ahead)
    let curX = px;
    let curY = py;
    for (let dist = 1; dist <= 4; dist++) {
      curX += v.fx;
      curY += v.fy;
      if (curX < 0 || curX >= cols || curY < 0 || curY >= rows) break;

      addTile(curX, curY);
      addTile(curX + v.lx, curY + v.ly);
      addTile(curX + v.rx, curY + v.ry);

      // Line of sight stops at solid opaque walls (tile 1) or closed doors
      const tileId = this.spec.map[curY][curX];
      const isDoor = tileId === 2 || tileId === 8;
      const isClosedDoor = isDoor && !this.openedDoors.has(`${curX},${curY}`);
      if (tileId === 1 || isClosedDoor) {
        break;
      }
    }

    // If on surface/wilderness or lit by torch, reveal wider open perimeter (radius 3)
    if (this.isWildernessTile(px, py)) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          addTile(px + dx, py + dy);
        }
      }
    }
  }

  isTileExplored(x, y) {
    if (!this.exploredTiles) return true;
    return this.exploredTiles.has(`${x},${y}`);
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

  getCurrentZone(x = this.player.x, y = this.player.y) {
    if (y < 0 || y >= this.spec.map.length || x < 0 || x >= this.spec.map[0].length) return 'dungeon';
    const tileId = this.spec.map[y][x];
    const legendEntry = this.spec.legend && this.spec.legend[String(tileId)];

    // 1. Explicit tile legend zone markers
    if (legendEntry) {
      if (legendEntry.zone === 'town' || legendEntry.zone === 'village' || legendEntry.action === 'shop' || legendEntry.action === 'atonement') {
        return 'town';
      }
      if (legendEntry.zone === 'wilderness') {
        return 'wilderness';
      }
      if (legendEntry.zone === 'dungeon') {
        return 'dungeon';
      }
    }

    // 2. Proximity to shop / merchants
    if (this.isNearShop(x, y)) return 'town';

    // 3. Adventure spec town / village y boundaries
    if (this.spec.town_y_min !== undefined && y >= this.spec.town_y_min) {
      return 'town';
    }

    // 4. Default surface/village heuristics (NPC mentor presence or town coords)
    if (this.spec.npcs) {
      const nearNpc = Object.values(this.spec.npcs).some(npc => {
        if (!npc.tile || npc.tile.length < 2) return false;
        const isPatronOrMentor = npc.id === 'lord_albright' || npc.id === 'baron_vane' || npc.id?.includes('patron') || npc.id?.includes('mentor') || npc.id === 'captain_valerius' || npc.id === 'archmage_cynthia' || npc.id === 'priestess_kaelen' || npc.id === 'master_jax';
        if (!isPatronOrMentor) return false;
        const dist = Math.abs(npc.tile[0] - x) + Math.abs(npc.tile[1] - y);
        return dist <= 3;
      });
      if (nearNpc) return 'town';
    }

    // 5. Wilderness check (surface moors, forest, trees)
    if (tileId === 4 || tileId === 5) return 'wilderness';
    if (this.spec.surface_y_min !== undefined && y >= this.spec.surface_y_min) return 'wilderness';
    if (this.spec.dungeon_y_max !== undefined && y > this.spec.dungeon_y_max) return 'wilderness';

    // 6. Default to dungeon
    return 'dungeon';
  }

  isTownTile(x = this.player.x, y = this.player.y) {
    return this.getCurrentZone(x, y) === 'town';
  }

  isDungeonTile(x = this.player.x, y = this.player.y) {
    return this.getCurrentZone(x, y) === 'dungeon';
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
  createPartyMember(classKey, customName, chosenSpells = [], options = {}) {
    return CharacterFactory.createPartyMember(classKey, customName, chosenSpells, this.classesSpec, options);
  }

  // ===========================================================================
  // PROGRESSION & STAT RESOLUTION
  // ===========================================================================

  getXPForNextLevel(classKey, currentLevel) {
    return ProgressionManager.getXPForNextLevel(classKey, currentLevel, this.classesSpec);
  }

  getConHpModifier(hero) {
    return ProgressionManager.getConHpModifier(hero);
  }

  getTrainingCost(hero) {
    return ProgressionManager.getTrainingCost(hero);
  }

  getTrainingLocation(hero) {
    return ProgressionManager.getTrainingLocation(hero, this.spec);
  }

  canPartyTrain() {
    return ProgressionManager.canPartyTrain(this);
  }

  getLevelAttackBonus(hero) {
    return ProgressionManager.getLevelAttackBonus(hero);
  }

  trackWeaponUsage(hero, weaponName) {
    return ProgressionManager.trackWeaponUsage(hero, weaponName);
  }

  getWeaponMastery(hero, weaponName) {
    return CombatCalculator.calculateWeaponMastery(hero, weaponName, GameState.MASTERY_TIERS);
  }

  isHeroSpecialistWithEquipped(hero) {
    return CombatCalculator.isHeroSpecialistWithEquipped(hero);
  }

  getSkillTarget(hero, skillKey) {
    return ProgressionManager.getSkillTarget(hero, skillKey);
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
  // INVENTORY MANAGEMENT (Catalog & Definition Helpers)
  // ===========================================================================

  isKnownWeapon(weaponName) {
    return ItemCatalog.isKnownWeapon(weaponName, this.spec);
  }

  static isClassAllowedItem(classKey, itemName, itemDef = null) {
    return ItemCatalog.isClassAllowedItem(classKey, itemName, itemDef);
  }

  getItemDef(name) {
    return ItemCatalog.getItemDef(name, this.spec);
  }
  
  isRangedWeapon(weaponName) {
    return ItemCatalog.isRangedWeapon(weaponName, this.spec);
  }

  getWeaponAmmoType(weaponName) {
    return ItemCatalog.getWeaponAmmoType(weaponName, this.spec);
  }

  getAmmoCount(ammoName, hero = null) {
    return InventoryManager.getAmmoCount(this, ammoName, hero);
  }

  consumeAmmo(param1, param2, count = 1) {
    return InventoryManager.consumeAmmo(this, param1, param2, count);
  }

  hasRangedWeapon(hero) {
    return InventoryManager.hasRangedWeapon(this, hero);
  }

  canHeroShoot(hero) {
    return InventoryManager.canHeroShoot(this, hero);
  }

  getAvailableWeapons(heroIndex) {
    return InventoryManager.getAvailableWeapons(this, heroIndex);
  }

  swapHeroWeapon(heroIndex, targetWeaponName = null) {
    return InventoryManager.swapHeroWeapon(this, heroIndex, targetWeaponName);
  }
  
  canHeroMelee(hero) {
    return ItemCatalog.canHeroMelee(hero, this.spec);
  }

  getWeaponDamageType(weaponName, fallback = 'slashing') {
    return ItemCatalog.getWeaponDamageType(weaponName, fallback, this.spec);
  }

  getWeaponMaxDamage(weaponName, fallback = 8) {
    return ItemCatalog.getWeaponMaxDamage(weaponName, fallback, this.spec);
  }

  getMonsterMaxDamage(dmgStr) {
    return CombatCalculator.parseMaxDamage(dmgStr, 8);
  }

  evaluateAttackOutcome(params) {
    return CombatCalculator.evaluateAttackOutcome(params);
  }

  evaluateHeroMissOutcome(params) {
    return CombatCalculator.evaluateHeroMissOutcome(params);
  }

  equipHeroWeapon(heroIndex, weaponName) {
    return InventoryManager.equipHeroWeapon(this, heroIndex, weaponName);
  }

  equipHeroArmor(heroIndex, armorName) {
    return InventoryManager.equipHeroArmor(this, heroIndex, armorName, GameState.getDexDefensiveAdjustment);
  }

  equipHeroShield(heroIndex, shieldName) {
    return InventoryManager.equipHeroShield(this, heroIndex, shieldName, GameState.getDexDefensiveAdjustment);
  }

  recalculateHeroAC(hero) {
    return InventoryManager.recalculateHeroAC(hero, GameState.getDexDefensiveAdjustment);
  }

  getPartyItem(name) {
    return InventoryManager.getPartyItem(this, name);
  }

  getPartyItemQty(name) {
    return InventoryManager.getPartyItemQty(this, name);
  }

  getPartyGold() {
    return InventoryManager.getPartyGold(this);
  }

  addPartyItem(name, amount = 1) {
    return InventoryManager.addPartyItem(this, name, amount);
  }

  removePartyItem(name, amount = 1) {
    return InventoryManager.removePartyItem(this, name, amount);
  }

  spendGold(amount) {
    return InventoryManager.spendGold(this, amount);
  }

  useConsumable(itemName, heroIndex = null) {
    return InventoryManager.useConsumable(this, itemName, heroIndex);
  }

  cureIncapacitatedHeroAtTemple(heroIndex) {
    return InventoryManager.cureIncapacitatedHeroAtTemple(this, heroIndex);
  }

  getIncapacitatedHeroes() {
    return (this.party || []).filter(h => h && h.hp <= 0 && h.hp > -10);
  }

  getDeadHeroes() {
    return (this.party || []).filter(h => h && h.hp <= -10);
  }

  isNearShop() {
    return InventoryManager.isNearShop(this);
  }

  getShopTile() {
    return InventoryManager.getShopTile(this);
  }

  sellItem(itemName, qty = 1, heroIndex = null) {
    return InventoryManager.sellItem(this, itemName, qty, heroIndex, GameState.getDexDefensiveAdjustment);
  }

  buyItem(itemName, qty = 1, heroIndex = null) {
    return InventoryManager.buyItem(this, itemName, qty, heroIndex);
  }

  // ===========================================================================
  // COMBAT ENGINE (Delegated to CombatEngine)
  // ===========================================================================

  startEncounter(encounterId) {
    return CombatEngine.startEncounter(this, encounterId);
  }

  queueHeroCommand(heroIndex, command) {
    CombatEngine.queueHeroCommand(this, heroIndex, command);
  }

  getTurnUndeadTarget(clericLevel, undeadTier) {
    return CombatCalculator.getTurnUndeadTarget(clericLevel, undeadTier);
  }

  applyArmorMitigation(rawDamage, damageType, armorType) {
    return CombatCalculator.applyArmorMitigation(rawDamage, damageType, armorType);
  }

  rollMonsterDamage(dmgStr) {
    return CombatCalculator.rollDice(dmgStr, 4);
  }

  resolveCombatRound() {
    return CombatEngine.resolveCombatRound(this);
  }

  commitCombatRoundResults(finalMobHp, finalHeroHp, victory, totalXp) {
    return CombatEngine.commitCombatRoundResults(this, finalMobHp, finalHeroHp, victory, totalXp);
  }

  checkMorale(simMobHp, simHeroHp, combatEvents) {
    return CombatEngine.checkMorale(this, simMobHp, simHeroHp, combatEvents);
  }

  resolveSingleMonsterMorale(mob, triggerReason, simMobHp, simHeroHp, combatEvents) {
    return CombatEngine.resolveSingleMonsterMorale(this, mob, triggerReason, simMobHp, simHeroHp, combatEvents);
  }

  attemptIntimidate(enemy) {
    return CombatEngine.attemptIntimidate(this, enemy);
  }

  attemptStealSurrendered(enemy) {
    return CombatEngine.attemptStealSurrendered(this, enemy);
  }

  fleeSurrenderedEnemy() {
    return CombatEngine.fleeSurrenderedEnemy(this);
  }

  strikeSurrenderedEnemy() {
    return CombatEngine.strikeSurrenderedEnemy(this);
  }

  /**
   * Awards quest / combat XP divided equally among living party members.
   * Marks heroes as eligible for level-up rather than auto-advancing them in the dungeon.
   */
  awardQuestXP(amount) {
    return ProgressionManager.awardQuestXP(this, amount);
  }

  /**
   * Prepares the options and rolled metrics for a hero's training advancement modal.
   */
  calculateLevelUpOptions(heroIndex) {
    return ProgressionManager.calculateLevelUpOptions(this, heroIndex);
  }

  /**
   * Applies the finalized training advancement choices made by the player.
   */
  applyLevelUp(heroIndex, choices) {
    return ProgressionManager.applyLevelUp(this, heroIndex, choices);
  }

  // ===========================================================================
  // EXPLORATION & DUNGEONEERING
  // ===========================================================================

  advanceExplorationTurn(minutes = 10, sourceAction = "Exploration", isLoud = false) {
    // 1. Advance torch and light spell duration counters
    if (this.torchLitUntil > 0) {
      this.torchLitUntil = Math.max(0, this.torchLitUntil - minutes);
      if (this.torchLitUntil === 0) {
        this.addLog(`🔥 The party's torch flickers violently and burns out! Darkness closes in.`, "warning");
      }
    }
    if (this.lightSpellUntil > 0) {
      this.lightSpellUntil = Math.max(0, this.lightSpellUntil - minutes);
      if (this.lightSpellUntil === 0) {
        this.addLog(`✨ The radiant glow of the Light spell fades away.`, "info");
      }
    }

    // 2. Wandering monster check: only in exploration areas (dungeon/wilderness), never in town
    const zone = this.getCurrentZone ? this.getCurrentZone() : (this.isWildernessTile() ? 'wilderness' : 'dungeon');
    if (zone === 'town' || this.combat.active) {
      return { minutes, wanderingSpawned: false, zone };
    }

    // Accumulate quiet 10-minute actions towards a 30-minute interval check
    this.explorationTurnCounter = (this.explorationTurnCounter || 0) + (minutes / 10);
    
    // Check wandering monsters if action was loud (bashing) OR if 3 turns (30 mins) have accumulated
    const shouldCheck = isLoud || this.explorationTurnCounter >= 3;
    if (!shouldCheck) {
      return { minutes, wanderingSpawned: false, zone, turnsAccumulated: this.explorationTurnCounter };
    }

    // Reset accumulator on check
    this.explorationTurnCounter = 0;

    // 1-in-6 chance on a d6 check (or 2-in-6 if loud bashing)
    const d6Roll = Math.floor(Math.random() * 6) + 1;
    const triggerThreshold = isLoud ? 2 : 1;
    let wanderingSpawned = false;
    let isAmbush = false;
    let chosenPatrolName = null;

    if (d6Roll <= triggerThreshold) {
      const areaKey = `${zone}_${this.player.x},${this.player.y}`;
      if (!this.spawnedPatrolZones.has(areaKey)) {
        this.spawnedPatrolZones.add(areaKey);
        const table = this.spec.wandering_monsters ? (this.spec.wandering_monsters[zone] || this.spec.wandering_monsters['dungeon']) : null;
        if (table && table.length > 0) {
          const chosenPatrol = table[Math.floor(Math.random() * table.length)];
          const monsterDef = this.spec.monsters ? this.spec.monsters[chosenPatrol.monsterId] : null;
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
            const facingBlocked = this.isFacingClosedObstacle();
            if (facingBlocked) {
              // Rear ambush! Enemies come from the open hall behind the party
              isAmbush = true;
              this.turnAround();
              this.addLog(`⚠️ REAR AMBUSH! Clattering footsteps and guttural snarls echo from the corridor behind you! A patrol of ${chosenPatrol.name} has cornered the party against the obstacle!`, "danger");
            } else {
              this.addLog(`⚠️ WANDERING PATROL SPOTTED! The corridor echoes with approaching danger: ${chosenPatrol.name}!`, "danger");
            }

            this.combat = {
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
    
    // Blind roll: hide exact dice roll in blind mode
    const turnResult = this.advanceExplorationTurn(10, "Hide in Shadows");
    return { success, roll, chance, turnResult };
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

  isFacingClosedObstacle() {
    if (this.isFacingWall()) return true;
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;
    const tx = this.player.x + dx, ty = this.player.y + dy;
    if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) return true;
    const tileId = this.spec.map[ty][tx];
    const key = `${tx},${ty}`;
    if ((tileId === 2 || tileId === 8) && !this.openedDoors.has(key)) return true;
    if (tileId === 7) return true;
    return false;
  }

  turnAround() {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(this.player.facing);
    if (index === -1) index = 0;
    index = (index + 2) % 4;
    this.player.facing = directions[index];
    this.revealExploration();
    this.isDirty = true;
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
    if (success) {
      this.detectedTraps.add(`${target.x},${target.y}`);
      this.awardQuestXP(100);
    }
    const turnResult = this.advanceExplorationTurn(10, "Find Traps");
    return { success, roll, chance, turnResult };
  }

  attemptDisarmTrap(target) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, triggered: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, triggered: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    thief.toolsDurability = Math.max(0, thief.toolsDurability - 4);
    const chance = this.getSkillTarget(thief, 'disarm_traps');
    const roll = Math.floor(Math.random() * 100) + 1;
    const key = `${target.x},${target.y}`;
    
    const turnResult = this.advanceExplorationTurn(10, "Disarm Trap");

    if (roll <= chance) {
      this.disarmedTraps.add(key);
      this.awardQuestXP(200);
      return { success: true, triggered: false, roll, chance, durability: thief.toolsDurability, turnResult };
    } 
    // In AD&D 2e, a trap only springs inadvertently on a fumble (roll > 95)
    if (roll > 95) {
      this.disarmedTraps.add(key);
      // Fumble when disarming: roll specifically for the thief attempting the disarm!
      const trapResult = this.triggerTrap(target, thief);
      return { success: false, triggered: true, roll, chance, trapResult, durability: thief.toolsDurability, turnResult };
    } else {
      // Normal failure: the mechanism resists, but the trap is not sprung
      return { success: false, triggered: false, roll, chance, durability: thief.toolsDurability, turnResult };
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
    const turnResult = this.advanceExplorationTurn(10, "Scout Ahead", false);

    // If a wandering patrol spawned while scouting, the thief spotted them approaching ahead!
    // Party gains awareness/advantage rather than being ambushed.
    if (turnResult && turnResult.wanderingSpawned && this.combat.active) {
      this.combat.surpriseRound = false;
      this.combat.alertedRound = true;
      discoveries.unshift({ type: 'patrol', name: turnResult.patrolName || 'Wandering Patrol' });
    }

    return { success, roll, chance, discoveries, turnResult };
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

  triggerTrap(trapDef, specificTarget = null) {
    const totalDamage = trapDef.damage || 15;
    const category = trapDef.saveCategory || 'breath';
    const subCategory = trapDef.subCategory || trapDef.name;
    const activeMembers = this.party.filter(p => p.hp > 0);
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
      const save = this.checkSavingThrow(member, category, subCategory);
      const damage = save.success ? Math.ceil(damagePerPlayer / 2) : damagePerPlayer;
      member.hp = Math.max(-10, member.hp - damage);
      const isDead = member.hp <= -10;
      const isIncapacitated = member.hp <= 0 && !isDead;
      return { heroName: member.name, heroIndex: this.party.indexOf(member), save, damage, isDead, isIncapacitated, hp: member.hp };
    });

    const partyWiped = this.party.every(h => h.hp <= 0);
    return { totalDamage, category, damagePerPlayer, results, partyWiped };
  }

  isPartyWiped() {
    return !this.party || this.party.length === 0 || this.party.every(h => h.hp <= 0);
  }

  checkSavingThrow(hero, category, subCategory = null, dcBonus = 0) {
    return resolveSavingThrow(hero, category, subCategory, dcBonus);
  }

  attemptPickLock(target) {
    const thief = this.party.find(p => p.classKey === 'thief' && p.hp > 0);
    if (!thief) return { success: false, reason: "The thief is incapacitated!" };
    if (thief.toolsDurability <= 0) return { success: false, reason: "Thieves' tools are blunted or broken! Refurbish them at Grimm's Outfitter." };
    
    const lockKey = target ? `${target.x},${target.y}:${thief.level}` : null;
    if (lockKey && this.failedLockAttempts.has(lockKey)) {
      return { 
        success: false, 
        lockedOut: true, 
        reason: `${thief.name} has already tried this lock at Level ${thief.level} and found the tumblers beyond their current skill. Try again after leveling up or bash the obstacle.` 
      };
    }

    const roll = Math.floor(Math.random() * 100) + 1;
    const wear = (roll > 95) ? 10 : 4;
    thief.toolsDurability = Math.max(0, thief.toolsDurability - wear);

    const chance = this.getSkillTarget(thief, 'pick_locks');
    const success = roll <= chance;
    
    const turnResult = this.advanceExplorationTurn(10, "Pick Lock");

    if (success) {
      this.awardQuestXP(150);
    } else {
      if (lockKey) {
        this.failedLockAttempts.add(lockKey);
      }
    }
    return { success, roll, chance, durability: thief.toolsDurability, fumbled: roll > 95, turnResult };
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
      if (this.surrenderedEnemy) {
        this.fleeSurrenderedEnemy();
      }
      this.player.x = targetX;
      this.player.y = targetY;
      this.revealExploration();
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
    const targetX = this.player.x + dx, targetY = this.player.y + dy;
    if (this.isWalkable(targetX, targetY)) {
      this.player.x = targetX;
      this.player.y = targetY;
      this.revealExploration();
      return true;
    }
    return false;
  }

  rotate(direction) {
    const directions = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    let index = directions.indexOf(this.player.facing);
    index = direction === 'RIGHT' ? (index + 1) % 4 : (index - 1 + 4) % 4;
    this.player.facing = directions[index];
    this.revealExploration();
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
    this.awardQuestXP(150);
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

  getInteractiveTargetInFront() {
    let dx = 0, dy = 0;
    if (this.player.facing === 'NORTH') dy = -1;
    else if (this.player.facing === 'SOUTH') dy = 1;
    else if (this.player.facing === 'EAST') dx = 1;
    else if (this.player.facing === 'WEST') dx = -1;

    const tx = this.player.x + dx;
    const ty = this.player.y + dy;
    if (ty < 0 || ty >= this.spec.map.length || tx < 0 || tx >= this.spec.map[0].length) return null;

    const tileId = this.spec.map[ty][tx];
    const key = `${tx},${ty}`;

    // Grid Doors (tiles 2 and 8)
    if ((tileId === 2 || tileId === 8) && !this.openedDoors.has(key)) {
      const tileDef = this.spec.legend[tileId];
      const isLocked = Boolean(tileDef?.locked && !this.unlockedDoors.has(key));
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
    if (tileId === 3 && !this.openedChests.has(key)) {
      const tileDef = this.spec.legend[tileId];
      const isLocked = Boolean(tileDef?.locked && !this.unlockedChests.has(key));
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
    if (!this.openedChests.has(key) && this.spec.entities) {
      const entity = this.spec.entities.find(e => (e.model === 'chest' || e.type === 'chest' || e.type === 'prop') && e.x === tx && e.y === ty);
      if (entity) {
        const tileDef = this.spec.legend[3] || { name: entity.name || 'Chest', locked: null };
        const isLocked = Boolean(tileDef.locked && !this.unlockedChests.has(key));
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
    const tileDef = this.spec.legend[tileId];
    if (tileDef && (tileDef.interactive || tileDef.puzzle || tileDef.runes || tileDef.inscription || tileDef.locked)) {
      const isLocked = Boolean(tileDef.locked && !this.unlockedDoors.has(key) && !this.unlockedChests.has(key));
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

  canOpenObjectInFront() {
    const target = this.getInteractiveTargetInFront();
    if (!target) return false;
    return target.type === 'door' || target.type === 'chest' || target.type === 'prop';
  }

  isFacingPropFront(entity) {
    if (!entity || !entity.facing) return true;
    const requiredPlayerFacing = {
      'SOUTH': 'NORTH',
      'NORTH': 'SOUTH',
      'EAST': 'WEST',
      'WEST': 'EAST'
    }[entity.facing.toUpperCase()];

    if (!requiredPlayerFacing) return true;
    return this.player.facing === requiredPlayerFacing;
  }

  getLockInFront() {
    const target = this.getInteractiveTargetInFront();
    return (target && target.locked) ? target : null;
  }

  attemptBash(fighter) {
    const target = this.getSkillTarget(fighter, 'bash');
    const roll = Math.floor(Math.random() * 20) + 1;
    const success = (roll <= target) && (roll !== 20);
    
    // Bashing makes violent noise — advance exploration turn and check wandering patrol / alert nearby
    const turnResult = this.advanceExplorationTurn(10, "Bash Door");

    // Also alert any nearby encounters within 3 tiles
    const nearby = (this.spec.encounters || []).find(e => !e.completed && Math.max(Math.abs(e.x - this.player.x), Math.abs(e.y - this.player.y)) <= 3);
    if (nearby) nearby.alerted = true;

    return { success, roll, target, turnResult };
  }

  attemptReadMagic(mage, lock) {
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
        if (member.tempIntDrain) {
          member.attributes.intelligence = (member.attributes.intelligence || 10) + member.tempIntDrain;
          member.tempIntDrain = 0;
        }
      }
      if (member.classKey === 'cleric') {
        member.divineFavor = Math.min(member.maxDivineFavor, (member.divineFavor || 0) + 12);
        if (member.divineFavor > 0) member.absoluteSilence = false;
        member.hasPrayedSinceRest = false;
        this.syncClericEthos(member);
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
    this.syncClericEthos(cleric);
  }

  modifyDivineFavor(delta) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return;
    cleric.divineFavor = Math.max(0, Math.min(cleric.maxDivineFavor, cleric.divineFavor + delta));
    this.syncClericEthos(cleric);
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
    this.syncClericEthos(cleric);
    return { success: true, restored, status: cleric.ethosStatus, divineFavor: cleric.divineFavor };
  }

  castClericPrayer(spellIndex, targetHeroIndex = null) {
    const cleric = this.party.find(p => p.classKey === 'cleric');
    if (!cleric) return { success: false, reason: "No cleric in party." };
    if (cleric.hp <= 0) return { success: false, reason: "The cleric is incapacitated and cannot invoke prayers." };
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return { success: false, reason: "Absolute Silence — no divine power flows." };
    if (!cleric.spells[spellIndex] || cleric.spells[spellIndex].spent) return { success: false, reason: "That prayer was already invoked today." };

    const spell = cleric.spells[spellIndex];
    return SpellRegistry.resolveExplorationSpell(cleric, spell, {
      party: this.party,
      targetHeroIndex,
      state: this
    });
  }

  syncClericEthos(cleric) {
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
    const res = SpellRegistry.resolveExplorationSpell(mage, spell, {
      party: this.party,
      targetHeroIndex: null,
      state: this
    });

    if (res.success) {
      // No burden refund. Spent construct still occupies capacity until rest.
      return {
        ...res,
        currentCognition: mage.cognition,
        log: res.log
          ? `${res.log} The construct is gone; its burden remains until rest.`
          : `✨ ${mage.name} releases ${spell.name}! The construct is gone; its burden remains until rest.`
      };
    }

    return res;
  }

  studyGrimoire(targetSpellIndex = null) {
    const mage = this.party.find(p => p.classKey === 'mage');
    if (!mage) return { success: false, reason: "No mage in party." };
    if (this.combat.active) return { success: false, reason: "Cannot study the grimoire during combat!" };

    // Synchronize spells array with grimoire if needed
    if (mage.grimoire && Array.isArray(mage.grimoire)) {
      if (!mage.spells) mage.spells = [];
      mage.grimoire.forEach(gSpell => {
        if (!mage.spells.some(s => s.id === gSpell.id)) {
          mage.spells.push({ ...gSpell, spent: true });
        }
      });
    }

    let toMemorize = [];
    if (targetSpellIndex !== null && targetSpellIndex !== undefined) {
      const sp = mage.spells[targetSpellIndex];
      if (!sp) return { success: false, reason: "Spell construct not found in grimoire." };
      if (!sp.spent) return { success: false, reason: `${sp.name} is already memorized in active mind.` };
      toMemorize = [sp];
    } else {
      toMemorize = mage.spells.filter(s => s.spent);
      if (toMemorize.length === 0) return { success: false, reason: "All prepared constructs from the grimoire are already held in mind." };
    }

    const zone = this.getCurrentZone ? this.getCurrentZone() : 'dungeon';
    const inField = zone !== 'town';
    if (inField && toMemorize.length > 1) {
      return {
        success: false,
        reason: "In the field, seat one formula at a time. Study All is for sanctuary."
      };
    }

    const minutes = toMemorize.reduce((sum, s) => sum + 10 * Math.max(1, s.level || s.tier || 1), 0);
    const turnResult = this.advanceExplorationTurn(minutes, "Study Grimoire", false);

    const cognitiveCost = toMemorize.reduce((sum, s) => sum + (s.cognitive_load || 20), 0);
    let brainBurnDamage = 0;
    let intBruise = false;
    const overflow = Math.max(0, cognitiveCost - (mage.cognition || 0));

    if (overflow > 0) {
      brainBurnDamage = overflow;
      mage.cognition = 0;
      mage.hp = Math.max(0, mage.hp - brainBurnDamage);
      if (!mage.tempIntDrain) {
        mage.tempIntDrain = 1;
        mage.attributes.intelligence = Math.max(3, (mage.attributes.intelligence || 10) - 1);
        intBruise = true;
      }
      if (mage.hp <= 0) {
        return {
          success: false,
          reason: `${mage.name} collapses mid-formula. The construct was not seated.`,
          brainBurnDamage,
          intBruise,
          minutes,
          turnResult,
          collapsed: true,
          currentCognition: mage.cognition,
          mageHp: mage.hp
        };
      }
    } else {
      mage.cognition -= cognitiveCost;
    }

    toMemorize.forEach(s => { s.spent = false; });
    mage.hasStudiedSinceRest = true;

    return {
      success: true,
      cognitiveCost,
      brainBurnDamage,
      intBruise,
      minutes,
      turnResult,
      rememorized: toMemorize.map(s => s.name),
      currentCognition: mage.cognition,
      mageHp: mage.hp
    };
  }
}