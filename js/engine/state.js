import { resolveSavingThrow } from './saving_throws.js';
import { SpellRegistry } from './spell_registry.js';
import { CombatCalculator } from './combat/combat_calculator.js';
import { CombatActions } from './combat/combat_actions.js';
import { CombatEngine } from './combat/combat_engine.js';
import { ItemCatalog } from './items/item_catalog.js';
import { InventoryManager } from './items/inventory_manager.js';
import { ProgressionManager } from './characters/progression_manager.js';
import { CharacterFactory } from './characters/character_factory.js';
import { RestManager } from './magic/rest_manager.js';
import { ExplorationManager } from './dungeon/exploration_manager.js';

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
  // EXPLORATION & DUNGEONEERING (Delegated to ExplorationManager)
  // ===========================================================================

  advanceExplorationTurn(minutes = 10, sourceAction = "Exploration", isLoud = false) {
    return ExplorationManager.advanceExplorationTurn(this, minutes, sourceAction, isLoud);
  }

  attemptPickpocket(npc) {
    return ExplorationManager.attemptPickpocket(this, npc);
  }

  attemptHideInShadows() {
    return ExplorationManager.attemptHideInShadows(this);
  }

  isFacingWall() {
    return ExplorationManager.isFacingWall(this);
  }

  isFacingClosedObstacle() {
    return ExplorationManager.isFacingClosedObstacle(this);
  }

  turnAround() {
    return ExplorationManager.turnAround(this);
  }

  getTrapInFront() {
    return ExplorationManager.getTrapInFront(this);
  }

  attemptFindTrap(target) {
    return ExplorationManager.attemptFindTrap(this, target);
  }

  attemptDisarmTrap(target) {
    return ExplorationManager.attemptDisarmTrap(this, target);
  }

  attemptScout(range = 3) {
    return ExplorationManager.attemptScout(this, range);
  }

  checkPassiveHearNoise() {
    return ExplorationManager.checkPassiveHearNoise(this);
  }

  attemptSneakPastEncounter(encounter) {
    return ExplorationManager.attemptSneakPastEncounter(this, encounter);
  }

  triggerTrap(trapDef, specificTarget = null) {
    return ExplorationManager.triggerTrap(this, trapDef, specificTarget);
  }

  isPartyWiped() {
    return !this.party || this.party.length === 0 || this.party.every(h => h.hp <= 0);
  }

  checkSavingThrow(hero, category, subCategory = null, dcBonus = 0) {
    return resolveSavingThrow(hero, category, subCategory, dcBonus);
  }

  attemptPickLock(target) {
    return ExplorationManager.attemptPickLock(this, target);
  }

  unlockTarget(x, y, type) {
    return ExplorationManager.unlockTarget(this, x, y, type);
  }

  isWalkable(x, y) {
    return ExplorationManager.isWalkable(this, x, y);
  }

  moveForward() {
    return ExplorationManager.moveForward(this);
  }

  moveBackward() {
    return ExplorationManager.moveBackward(this);
  }

  rotate(direction) {
    return ExplorationManager.rotate(this, direction);
  }

  markDoorOpen(x, y) {
    return ExplorationManager.markDoorOpen(this, x, y);
  }

  openChest(x, y) {
    return ExplorationManager.openChest(this, x, y);
  }

  checkInteractionTrigger(x, y) {
    return ExplorationManager.checkInteractionTrigger(this, x, y);
  }

  getInteractiveTargetInFront() {
    return ExplorationManager.getInteractiveTargetInFront(this);
  }

  canOpenObjectInFront() {
    return ExplorationManager.canOpenObjectInFront(this);
  }

  isFacingPropFront(entity) {
    return ExplorationManager.isFacingPropFront(this, entity);
  }

  getLockInFront() {
    return ExplorationManager.getLockInFront(this);
  }

  attemptBash(fighter) {
    return ExplorationManager.attemptBash(this, fighter);
  }

  attemptReadMagic(mage, lock) {
    return ExplorationManager.attemptReadMagic(this, mage, lock);
  }


  // ===========================================================================
  // MAGIC & REST SYSTEMS (Delegated to RestManager)
  // ===========================================================================

  restParty() {
    return RestManager.restParty(this);
  }

  checkRestAmbush() {
    return RestManager.checkRestAmbush(this);
  }

  applyMoralTax(baseTax, activeSpeaker, customMultiplier = null) {
    return RestManager.applyMoralTax(this, baseTax, activeSpeaker, customMultiplier);
  }

  modifyDivineFavor(delta) {
    return RestManager.modifyDivineFavor(this, delta);
  }

  syncClericEthos(cleric) {
    return RestManager.syncClericEthos(this, cleric);
  }

  studyClericPrayers() {
    return RestManager.studyClericPrayers(this);
  }

  castClericPrayer(spellIndex, targetHeroIndex = null) {
    return RestManager.castClericPrayer(this, spellIndex, targetHeroIndex);
  }

  castMageSpell(spellIndex) {
    return RestManager.castMageSpell(this, spellIndex);
  }

  studyGrimoire(targetSpellIndex = null) {
    return RestManager.studyGrimoire(this, targetSpellIndex);
  }
}