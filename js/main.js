import { loadJSON } from './engine/loader.js';
import { GameState } from './engine/state.js';
import { RendererThreeJS } from './engine/renderer_three.js';
import { Renderer2D } from './engine/renderer2d.js';
import { InputController } from './engine/input.js';
import { AudioManager } from './engine/audio.js';
import { CombatController } from './engine/combat_controller.js';
import { UIController } from './engine/ui_controller.js';
import { DialogueController } from './engine/dialogue_controller.js';
import { CharacterSheetUI } from './engine/character_sheet.js';
import { ShopUI } from './engine/shop_ui.js';

/**
 * Bootstraps the application data, populates spell/prayer selections,
 * and handles the transition from the setup screen to the main game.
 */
async function init() {
  const [adventureData, classesData] = await Promise.all([
    loadJSON('data/adventure.json'),
    loadJSON('data/classes.json')
  ]);

  const mageChoicesContainer = document.getElementById('mage-spells-choices');
  const clericChoicesContainer = document.getElementById('cleric-spells-choices');
  const mageAvailable = classesData.archetypes.mage.vancian_magic.spells_available;
  const clericAvailable = classesData.archetypes.cleric.spells_available;

  mageChoicesContainer.innerHTML = mageAvailable.map((spell, idx) => `
    <label class="spell-option-label">
      <input type="checkbox" name="mage-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
      <span><b>${spell.name}</b> (Load: ${spell.cognitive_load}) ${spell.description}</span>
    </label>`).join('');

  clericChoicesContainer.innerHTML = clericAvailable.map((spell, idx) => `
    <label class="spell-option-label">
      <input type="checkbox" name="cleric-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
      <span><b>${spell.name}</b> ${spell.description}</span>
    </label>`).join('');

  document.getElementById('start-adventure-btn').addEventListener('click', () => {
    const selectedMageIds = Array.from(document.querySelectorAll('input[name="mage-spell"]:checked')).map(cb => cb.value);
    const selectedClericIds = Array.from(document.querySelectorAll('input[name="cleric-spell"]:checked')).map(cb => cb.value);

    if (selectedMageIds.length !== 2 || selectedClericIds.length !== 2) {
      alert("Please select exactly 2 spells for the Mage and 2 prayers for the Cleric!");
      return;
    }

    const chosenMageSpells = mageAvailable.filter(s => selectedMageIds.includes(s.id));
    const chosenClericSpells = clericAvailable.filter(s => selectedClericIds.includes(s.id));

    document.getElementById('setup-screen').style.display = 'none';
    
    // Launch the orchestrator
    const game = new GameOrchestrator(adventureData, classesData, chosenMageSpells, chosenClericSpells);
    game.start();
  });
}

/**
 * GameOrchestrator acts as the central nerve center. It wires the state to the
 * renderers, manages the 60fps loop, and acts as the delegate for all controllers.
 */
class GameOrchestrator {
  constructor(adventureData, classesData, chosenMageSpells, chosenClericSpells) {
    this.spec = adventureData;
    this.classesSpec = classesData;
    this.isActionActive = false; // Locks inputs during cinematic actions
    
    // Timing properties
    this.lastFrameTime = performance.now();
    this.frameInterval = 1000 / 60; // Target 60 FPS

    this.bindUIElements();
    this.initializeState(chosenMageSpells, chosenClericSpells);
    this.initializeEngine();
    this.bindControllers();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  bindUIElements() {
    this.uiElements = {
      coordVal: document.getElementById('coord-val'),
      dirVal: document.getElementById('dir-val'),
      goldVal: document.getElementById('gold-val'),
      narrativeLog: document.getElementById('narrative-log'),
      partyContainer: document.getElementById('party-container'),
      globalActions: document.getElementById('global-actions'),
      interactionModal: document.getElementById('interaction-modal'),
      interactionTitle: document.getElementById('interaction-title'),
      interactionPrompt: document.getElementById('interaction-prompt'),
      interactionActions: document.getElementById('interaction-actions')
    };
  }

  initializeState(chosenMageSpells, chosenClericSpells) {
    this.state = new GameState(this.spec, this.classesSpec);
    this.state.onLog = (msg, type) => this.log(msg, type);
    
    this.state.party = [
      this.state.createPartyMember("fighter", "Valeros"),
      this.state.createPartyMember("thief", "Merisiel"),
      this.state.createPartyMember("cleric", "Kyra", chosenClericSpells),
      this.state.createPartyMember("mage", "Elminster", chosenMageSpells)
    ];

    this.camera = {
      x: this.state.player.x,
      y: this.state.player.y,
      angle: this.facingToAngle(this.state.player.facing),
      targetX: this.state.player.x,
      targetY: this.state.player.y,
      targetAngle: this.facingToAngle(this.state.player.facing)
    };
  }

  initializeEngine() {
    const container3D = document.getElementById('three-container');
    const canvasMini = document.getElementById('minimapCanvas');
    canvasMini.width = 150;
    canvasMini.height = 130;

    this.renderer3D = new RendererThreeJS(container3D);
    this.renderer3D.buildWorld(this.spec, this.state);
    
    this.renderer2D = new Renderer2D(canvasMini);
    this.audioManager = new AudioManager();
  }

  bindControllers() {
    // 1. Initialize the new UI class
    this.characterSheet = new CharacterSheetUI(this.state, {
      playSFX: (id) => this.playSFX(id),
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      onUIAction: (action, payload) => this.handleUIAction(action, payload)
    });

    this.shopUI = new ShopUI(this.state, {
      playSFX: (id) => this.playSFX(id),
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD()
    });

    this.combatController = new CombatController(this.state, this.renderer3D, {
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      playSFX: (id) => this.playSFX(id),
      playCombatBgm: (tracks) => this.audioManager.playCombatBgm(tracks),
      stopCombatBgm: () => this.audioManager.stopCombatBgm(),
      flashHeroCard: (idx) => this.flashHeroCardRed(idx),
      applyVisualCombatHp: (enemies, heroHp) => this.uiController.applyVisualCombatHp(enemies, heroHp),
      onPartyWiped: () => this.showGameOver()
    });

    this.uiController = new UIController(this.state, this.renderer2D, this.uiElements, {
      // 2. Delegate the open call to the new class
      onOpenSheet: (heroName) => this.characterSheet.open(heroName),
      onCommand: (hIdx, cmdType, extra) => this.handleCombatCommandQueue(hIdx, cmdType, extra),
      onTargetChange: (hIdx, targetId) => this.handleTargetChange(hIdx, targetId),
      onGlobalAction: (actionType) => this.handleGlobalAction(actionType),
      onUIAction: (actionType, payload) => this.handleUIAction(actionType, payload)
    });

    this.dialogueController = new DialogueController(this.spec, this.state, this.uiController, {
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      playSFX: (id) => this.playSFX(id)
    });

    new InputController((action) => this.handleInput(action));

    document.getElementById('close-sheet-btn')?.addEventListener('click', () => this.characterSheet.close());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        this.characterSheet.close();
        this.shopUI.close(); // Also close shop on Escape
      }
    });

    // 3. Delegate the close call to the new class
    document.getElementById('close-sheet-btn')?.addEventListener('click', () => this.characterSheet.close());
    document.getElementById('close-shop-btn')?.addEventListener('click', () => this.shopUI.close());
    
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') this.characterSheet.close();
    });

    // Global listeners
    document.getElementById('close-sheet-btn')?.addEventListener('click', () => this.closeCharacterSheet());
    document.getElementById('close-shop-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('shop-modal');
      if (modal) modal.style.display = 'none';
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') this.closeCharacterSheet();
    });
  }

  start() {
    this.uiController.initPartyDOM();
    this.uiController.updateHUD();

    if (this.spec.briefing) this.log(this.spec.briefing, "info");
    this.log("You stand on the chapel approach. The Thorn Outfitter stall is the gold tile on the minimap. Stock up before you descend.", "info");

    // Force resize measurement
    requestAnimationFrame(() => this.renderer3D.onResize());
    
    // Bind 'this' to the animation loop
    this.animationLoop = this.animationLoop.bind(this);
    requestAnimationFrame(this.animationLoop);
  }

  // ===========================================================================
  // MAIN RENDER LOOP
  // ===========================================================================

  animationLoop(currentTime) {
    requestAnimationFrame(this.animationLoop);
    if (!currentTime) return;

    const elapsedSinceLastRender = currentTime - this.lastFrameTime;
    if (elapsedSinceLastRender < this.frameInterval) return;

    const delta = elapsedSinceLastRender / 1000;
    this.lastFrameTime = currentTime - (elapsedSinceLastRender % this.frameInterval);

    if (delta > 0.1) return; // Prevent massive jumps if tab was inactive

    // Smooth Camera Interpolation
    const speed = 1 - Math.exp(-12 * delta);
    this.camera.x += (this.camera.targetX - this.camera.x) * speed;
    this.camera.y += (this.camera.targetY - this.camera.y) * speed;
    
    let angleDiff = this.camera.targetAngle - this.camera.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.camera.angle += angleDiff * speed;

    // Torch Lighting Hook (Now actively checks state memory to toggle 3D lights)
    const isTorchLit = this.state.torchLitUntil && this.state.torchLitUntil > Date.now();
    if (this.renderer3D.setTorchLight) {
        this.renderer3D.setTorchLight(isTorchLit);
    }

    this.renderer3D.render(this.camera);

    // Conditional Dirty Flag HUD Update
    if (this.state.isDirty) {
      this.uiController.updateHUD();
      this.state.isDirty = false;
    }
  }

  // ===========================================================================
  // INPUT & MOVEMENT PIPELINE
  // ===========================================================================

  handleInput(action) {
    if (this.isActionActive || this.state.combat.active) return;

    let updated = false;
    let didMove = false;

    if (action === 'MOVE_FORWARD') { updated = didMove = this.state.moveForward(); } 
    else if (action === 'MOVE_BACKWARD') { updated = didMove = this.state.moveBackward(); } 
    else if (action === 'ROTATE_LEFT') { this.state.rotate('LEFT'); updated = true; } 
    else if (action === 'ROTATE_RIGHT') { this.state.rotate('RIGHT'); updated = true; }

    if (updated) {
      this.state.isDirty = true;
      this.playSFX('footstep');
      this.camera.targetX = this.state.player.x;
      this.camera.targetY = this.state.player.y;
      this.camera.targetAngle = this.facingToAngle(this.state.player.facing);

      if (didMove) this.processMovementTriggers();
    }
  }

  processMovementTriggers() {
    const currentX = this.state.player.x;
    const currentY = this.state.player.y;

    // 1. Passive Thief checks
    const hint = this.state.checkPassiveHearNoise();
    if (hint) this.log(`${hint.heroName} catches a faint sound to the ${hint.direction}...`, "muted");

    // 2. Map Interaction Triggers (Previously Dead Code)
    const interaction = this.state.checkInteractionTrigger(currentX, currentY);
    if (interaction) {
        this.log(`Map Event: ${interaction.description || 'You triggered an event.'}`, "warning");
        // E.g., this.dialogueController.triggerEvent(interaction.id);
    }

    // 3. Encounters
    if (this.spec.encounters && !this.state.combat.active) {
      const activeEncounter = this.spec.encounters.find(e => e.x === currentX && e.y === currentY && !e.completed);
      if (activeEncounter) {
        const thief = this.state.party.find(p => p.classKey === 'thief');
        if (thief && thief.isStealth) {
          const sneak = this.state.attemptSneakPastEncounter(activeEncounter);
          if (sneak.success) {
            this.log(`${thief.name} leads the party past ${sneak.encounterName} unnoticed!`, "success");
            this.uiController.updateHUD();
            return;
          }
          this.log(`${thief.name}'s cover is blown!`, "danger");
        }
        this.combatController.triggerEncounter(activeEncounter.id);
        return;
      }
    }

    // 4. NPCs
    if (this.spec.npcs) {
      const matchingNpc = Object.values(this.spec.npcs).find(n => {
        const npcState = this.state.getNPCState(n.id);
        return n.tile && n.tile[0] === currentX && n.tile[1] === currentY && !npcState.despawned;
      });
      if (matchingNpc) this.dialogueController.startNPCInteraction(matchingNpc.id);
    }

    // 5. Shops
    const shopTile = this.state.getShopTile();
    if (shopTile && shopTile[0] === currentX && shopTile[1] === currentY) {
      this.log("Thorn Outfitter — lantern light and the smell of oil. Press 🏪 Outfitter to trade.", "info");
    }
  }

  // ===========================================================================
  // UI & ACTION DISPATCHERS
  // ===========================================================================

  handleGlobalAction(actionType) {
    if (actionType === 'RESOLVE_ROUND') this.combatController.resolveCombatRoundSequence();
    else if (actionType === 'OPEN_OBJECT') this.handleOpenObject();
    else if (actionType === 'OPEN_SHOP') this.shopUI.open(); // Delegated here
    else if (actionType === 'REST_CAMP') this.handleRestCamp();
  }

  handleUIAction(actionType, payload) {
    // Lockpicking
    if (actionType === 'PICK_LOCK') {
      const target = this.getLockInFront();
      if (!target || this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptPickLock(target.type);
      if (result.success) {
        this.state.unlockTarget(target.x, target.y, target.type);
        this.playSFX('unlock'); this.playSFX('reward');
        this.log("Success! Picked the lock.", "success");
      } else {
        this.playSFX('unlock_try');
        this.log("Pick lock failed.", "danger");
      }
      this.uiController.updateHUD();
    } 
    // Trap Detection & Disarm
    else if (actionType === 'FIND_TRAP') {
      const target = this.state.getTrapInFront();
      if (!target) return this.log(`No traps here.`, "info");
      const result = this.state.attemptFindTrap(target);
      if (result.success) {
        this.playSFX('trap_found');
        this.log(`Success! Trap detected: ${target.name}. Disarm unlocked!`, "warning");
      } else this.log(`Find traps failed.`, "info");
      this.uiController.updateHUD();
    } 
    else if (actionType === 'DISARM_TRAP') {
      const target = this.state.getTrapInFront();
      if (!target) return;
      const result = this.state.attemptDisarmTrap(target);
      if (result.success) {
        this.playSFX('unlock'); this.playSFX('reward');
        this.log(`Success! ${target.name} disarmed.`, "success");
      } else if (result.triggered) {
        this.playSFX('backstab'); setTimeout(() => this.playSFX('falling'), 500);
        this.log(`DISASTER! ${target.name} triggered, dealing ${result.damage} damage!`, "danger");
      }
      this.uiController.updateHUD();
    }
    // Rogue Skills
    else if (actionType === 'HIDE_SHADOWS') {
      const result = this.state.attemptHideInShadows();
      if (result.success) {
        this.playSFX('hide'); this.playSFX('reward');
        this.log(`Success! Slips into shadows (Stealth Active).`, "success");
      } else this.log(`Hide in shadows failed.`, "warning");
      this.uiController.updateHUD();
    } 
    else if (actionType === 'SCOUT_AHEAD') {
      const result = this.state.attemptScout();
      if (!result.success) return this.log(result.reason || `Scouting turned up nothing.`, "info");
      if (result.discoveries.length === 0) this.log(`The way ahead looks clear.`, "info");
      else result.discoveries.forEach(d => this.log(`Scouted ahead: ${d.name} detected.`, "warning"));
      this.uiController.updateHUD();
    } 
    else if (actionType === 'PICKPOCKET_NPC') {
      if (!this.state.activeNpc) return;
      const result = this.state.attemptPickpocket(this.state.activeNpc);
      if (result.success) this.log(`Pickpocketed ${result.stolenItem.name}!`, "success");
      else this.log(`Pickpocket failed! Caught in the act!`, "danger");
      this.uiController.updateHUD();
    }
    // Magic 
    else if (actionType === 'STUDY_GRIMOIRE') {
      const result = this.state.studyGrimoire();
      if (!result.success) return this.log(result.reason, "warning");
      if (result.brainBurnDamage > 0) this.log(`BRAIN BURN! Forced memory (-${result.cognitiveCost} Cog, ${result.brainBurnDamage} HP).`, "danger");
      else this.log(`Memorization complete. Cognitive burden -${result.cognitiveCost}.`, "warning");
      this.uiController.updateHUD(true);
    } 
    else if (actionType === 'CAST_MAGE_SPELL') {
      const res = this.state.castMageSpell(payload);
      if (res.success) this.log(`Released ${res.spellName}.`, "success");
      else this.log(res.reason, "warning");
      this.uiController.updateHUD(true);
    } 
    else if (actionType === 'STUDY_PRAYERS') {
      const result = this.state.studyClericPrayers();
      if (!result.success) return this.log(result.reason, "warning");
      this.log(`Dawn petition answered. Prayers granted anew.`, "success");
      this.uiController.updateHUD(true);
    } 
    else if (actionType === 'CAST_CLERIC_PRAYER') {
      const res = this.state.castClericPrayer(payload);
      if (res.success) this.log(`Divine invocation! ${res.spellName}`, "success");
      else this.log(res.reason, "warning");
      this.uiController.updateHUD(true);
    }
    // Force/Magic Interaction
    else if (actionType === 'BASH_DOOR') {
      const target = this.getLockInFront();
      if (!target || this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptBash(this.state.party.find(p => p.classKey === 'fighter'));
      this.playSFX('sheet');
      if (result.success) {
        this.state.unlockTarget(target.x, target.y, target.type);
        this.playSFX('bash'); this.log("Success! The door gives way.", "success");
      } else {
        this.playSFX('blocked'); this.log("Bash failed. Gate holds firm.", "danger");
      }
      this.uiController.updateHUD();
    }
    else if (actionType === 'READ_MAGIC') {
      const target = this.getLockInFront();
      if (!target || this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptReadMagic(this.state.party.find(p => p.classKey === 'mage'), target);
      if (result.success) {
        this.state.unlockTarget(target.x, target.y, target.type);
        this.log("Arcane runes deciphered! The seal fades.", "success");
      } else this.log("The arcane runes remain stubborn. Cognition drained.", "warning");
      this.uiController.updateHUD();
    }
  }

  handleCombatCommandQueue(hIdx, cmdType, extra) {
    this.playSFX('button');
    const hero = this.state.party[hIdx];
    const existing = this.state.combat.queuedCommands[hIdx];
    
    if (existing && existing.type === 'CAST' && cmdType !== 'CAST') return this.log(`${hero.name} is channeling — locked.`, "warning");
    if (cmdType === 'SHOOT' && !this.state.canHeroShoot(hero)) return this.log(`${hero.name} needs a ranged weapon.`, "warning");
    if (cmdType === 'ATTACK' && !this.state.canHeroMelee(hero)) return this.log(`${hero.name} needs a melee weapon.`, "warning");

    const selectEl = this.uiElements.partyContainer.querySelector(`.target-select[data-hero="${hIdx}"]`);
    const targetId = selectEl ? selectEl.value : null;
    
    this.state.queueHeroCommand(hIdx, { type: cmdType, targetInstanceId: targetId, ...extra });
    
    // Aesthetic UI logging
    if (cmdType === 'GUARD') this.log(`${hero.name} will guard.`, "info");
    else if (cmdType === 'CAST') this.log(`${hero.name} begins channeling…`, "info");
    else if (cmdType === 'PRAY') this.log(`${hero.name} invokes divine aid…`, "info");
    else if (cmdType === 'TURN') this.log(`${hero.name} brandishes holy symbol!`, "info");
    else this.log(`${hero.name} order set: ${cmdType}`, "info");
    
    this.uiController.updateHUD();
  }

  handleTargetChange(hIdx, targetId) {
    const currentCmd = this.state.combat.queuedCommands[hIdx] || { type: 'ATTACK' };
    this.state.queueHeroCommand(hIdx, { ...currentCmd, targetInstanceId: targetId });
    this.log(`${this.state.party[hIdx].name} targeted ${targetId}`, "muted");
  }

  // ===========================================================================
  // WORLD INTERACTIONS
  // ===========================================================================

  handleOpenObject() {
    if (this.isActionActive) return;
    const target = this.getInteractiveTargetInFront();
    if (!target) return this.log("There is nothing openable directly in front of you.", "warning");
    if (this.checkTrapBeforeAction(target)) return;
    if (target.locked) {
      this.playSFX('blocked');
      return this.log("It's locked! You need the correct tool or skill to bypass this seal.", "warning");
    }

    this.isActionActive = true;
    if (target.type === 'door') {
      this.audioManager.play('door_opening');
      this.log("Attempting to open heavy dungeon door...", "info");
      this.renderer3D.animateOpenDoor(target.x, target.y, () => {
        this.state.markDoorOpen(target.x, target.y);
        this.log("The door creaks open.", "success");
        this.uiController.updateHUD();
        this.isActionActive = false;
      });
    } else {
      this.audioManager.play('chest_opening');
      this.log("Unlocking and raising the chest lid...", "info");
      this.renderer3D.animateOpenChest(target.x, target.y, () => {
        const loot = this.state.openChest(target.x, target.y);
        if (loot) {
          if (loot.some(item => item.name === "Gold Pieces")) this.audioManager.play('coins');
          this.log(`Loot acquired: ${loot.map(i => i.amount ? `${i.amount}x ${i.name}` : i.name).join(', ')}`, "success");
        } else this.log("This chest has already been plundered.", "warning");
        this.uiController.updateHUD();
        this.isActionActive = false;
      });
    }
  }

  getInteractiveTargetInFront() {
    let dx = 0, dy = 0;
    if (this.state.player.facing === 'NORTH') dy = -1;
    if (this.state.player.facing === 'SOUTH') dy = 1;
    if (this.state.player.facing === 'EAST') dx = 1;
    if (this.state.player.facing === 'WEST') dx = -1;

    const targetX = this.state.player.x + dx;
    const targetY = this.state.player.y + dy;

    if (targetY >= 0 && targetY < this.spec.map.length && targetX >= 0 && targetX < this.spec.map[0].length) {
      const tileId = this.spec.map[targetY][targetX];
      const key = `${targetX},${targetY}`;
      if (tileId === 2 && !this.state.openedDoors.has(key)) {
        const tileDef = this.spec.legend[tileId];
        return { x: targetX, y: targetY, type: 'door', locked: tileDef?.locked && !this.state.unlockedDoors.has(key), tileDef };
      }
      if (tileId === 3 && !this.state.openedChests.has(key)) {
        const tileDef = this.spec.legend[tileId];
        return { x: targetX, y: targetY, type: 'chest', locked: tileDef?.locked && !this.state.unlockedChests.has(key), tileDef };
      }
      if (!this.state.openedChests.has(key) && this.spec.entities) {
        if (this.spec.entities.find(e => e.model === 'chest' && e.x === targetX && e.y === targetY)) {
          const tileDef = this.spec.legend[3] || { name: 'Chest', locked: null };
          return { x: targetX, y: targetY, type: 'chest', locked: !!tileDef.locked && !this.state.unlockedChests.has(key), tileDef };
        }
      }
    }
    return null;
  }

  getLockInFront() {
      const target = this.getInteractiveTargetInFront();
      return (target && target.locked) ? target : null;
  }

  checkTrapBeforeAction(target) {
    if (!target || !target.tileDef) return false;
    const trapKey = `${target.x},${target.y}`;
    if (target.tileDef.trap && !this.state.disarmedTraps.has(trapKey)) {
      this.state.disarmedTraps.add(trapKey);
      this.playSFX('backstab'); setTimeout(() => this.playSFX('falling'), 500);

      const trap = this.state.triggerTrap(target.tileDef.trap);
      this.log(`TRAP TRIGGERED! The ${target.tileDef.name} unleashes ${target.tileDef.trap.name}!`, "danger");

      trap.results.forEach(r => {
        const verdict = r.save.success
          ? `saves vs. ${trap.category} — takes ${r.damage} damage (halved)`
          : `fails the save vs. ${trap.category} — takes ${r.damage} damage!`;
        this.log(`${r.heroName} ${verdict}`, r.save.success ? "warning" : "danger");
        this.flashHeroCardRed(r.heroIndex);
        if (r.isDead) this.log(`${r.heroName} collapses!`, "danger");
      });

      this.uiController.updateHUD();
      return true;
    }
    return false;
  }

  // ===========================================================================
  // MENUS & CAMPING
  // ===========================================================================

  handleRestCamp() {
    if (this.isActionActive || this.state.combat.active) return;

    const cx = this.state.player.x;
    const cy = this.state.player.y;
    const tileDef = this.spec.legend ? this.spec.legend[this.spec.map[cy][cx]] : null;
    
    if (this.spec.map[cy][cx] === 1 || (tileDef && tileDef.walkable === false)) {
      return this.log("You can't camp here — no solid ground.", "warning");
    }

    const hasRations = (this.state.inventory || []).some(i => (i.name || '').toLowerCase().includes('ration') && (i.amount || 0) > 0);
    if (!hasRations) return this.log("The party has no Rations left to camp!", "danger");

    this.isActionActive = true;
    this.renderer3D.spawnCampfireModel(cx, cy);
    this.renderer3D.enableCampfireFlicker(true, cx, cy);
    this.audioManager.playLoop('crickets');
    this.audioManager.playLoop('campfire');
    this.log("The party makes camp, setting watches around the fire...", "info");

    let elapsedMs = 0;
    const durationSec = this.spec.rest_duration_seconds || 12;
    const totalMs = durationSec * 1000;
    
    const campModal = document.getElementById('camp-modal');
    if (campModal) campModal.style.display = 'flex';

    const timerInterval = setInterval(() => {
      elapsedMs += 100;
      const pct = Math.min(100, (elapsedMs / totalMs) * 100);
      document.getElementById('camp-progress-bar').style.width = `${pct}%`;

      if (elapsedMs >= totalMs) {
        clearInterval(timerInterval);
        const ambushEnc = this.state.checkRestAmbush();
        
        this.audioManager.stopLoop('crickets');
        this.audioManager.stopLoop('campfire');
        this.renderer3D.removeCampfireModel();
        this.renderer3D.enableCampfireFlicker(false);
        if (campModal) campModal.style.display = 'none';
        this.isActionActive = false;

        if (ambushEnc) {
          this.playSFX('combat_turn');
          this.log(`AMBUSH! Hostiles from ${ambushEnc.name} fall upon the camp!`, "danger");
          this.combatController.triggerEncounter(ambushEnc.id);
          this.uiController.updateHUD();
          return;
        }

        this.playSFX('rested');
        const restResult = this.state.restParty();
        if (restResult.success) this.log("The rest is complete. Camp broken down successfully.", "success");
        this.uiController.updateHUD();
      }
    }, 100);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  log(message, type = 'info') {
    const colorMap = { info: '#c9d1d9', success: '#3fb950', warning: '#d29922', danger: '#f85149', muted: '#8b949e' };
    this.uiElements.narrativeLog.innerHTML += `<div style="color: ${colorMap[type] || colorMap.info}; margin-bottom: 3px;">> ${message}</div>`;
    this.uiElements.narrativeLog.scrollTop = this.uiElements.narrativeLog.scrollHeight;
  }

  playSFX(id) { this.audioManager.play(id); }

  facingToAngle(facing) {
    switch (facing) {
      case 'EAST': return 0;
      case 'SOUTH': return Math.PI / 2;
      case 'WEST': return Math.PI;
      case 'NORTH': return -Math.PI / 2;
      default: return 0;
    }
  }

  flashHeroCardRed(heroIndex) {
    const card = this.uiElements.partyContainer.querySelectorAll('.hero-card')[heroIndex];
    if (card) {
      card.classList.remove('hit-flash');
      void card.offsetWidth;
      card.classList.add('hit-flash');
    }
  }

  showGameOver() {
    const wipedText = this.spec.endings?.party_wiped || 'The flooded dark keeps what it takes. The expedition is over.';
    this.uiElements.interactionTitle.textContent = '💀 PARTY WIPED';
    this.uiElements.interactionPrompt.textContent = wipedText;
    this.uiElements.interactionActions.innerHTML = `<button class="action-tab primary" style="width:100%; padding:12px;" onclick="location.reload()">RESTART EXPEDITION</button>`;
    this.uiElements.interactionModal.style.display = 'flex';
  }
}

init();