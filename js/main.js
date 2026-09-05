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
import { LevelUpUI } from './engine/level_up_ui.js';

/**
 * Bootstraps application data, initializes setup screen options,
 * and handles the transition from setup into the main game orchestrator.
 */
async function init() {
  const classesData = await loadJSON('data/classes.json');

  const mageChoicesContainer = document.getElementById('mage-spells-choices');
  const clericChoicesContainer = document.getElementById('cleric-spells-choices');

  const mageSpellTier1 = classesData.archetypes.mage.vancian_magic.spell_tiers["1"];
  const clericSpellTier1 = classesData.archetypes.cleric.spells_available_by_tier["1"];

  mageChoicesContainer.innerHTML = '';
  clericChoicesContainer.innerHTML = '';

  mageSpellTier1.forEach((spell, idx) => {
    mageChoicesContainer.innerHTML += `
      <label class="spell-option-label">
        <input type="checkbox" name="mage-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
        <span><b>${spell.name}</b> (Load: ${spell.cognitive_load}) ${spell.description}</span>
      </label>`;
  });

  clericSpellTier1.forEach((spell, idx) => {
    clericChoicesContainer.innerHTML += `
      <label class="spell-option-label">
        <input type="checkbox" name="cleric-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
        <span><b>${spell.name}</b> ${spell.description}</span>
      </label>`;
  });

  document.getElementById('start-adventure-btn').addEventListener('click', async () => {
    const selectedMageIds = Array.from(document.querySelectorAll('input[name="mage-spell"]:checked')).map(cb => cb.value);
    const selectedClericIds = Array.from(document.querySelectorAll('input[name="cleric-spell"]:checked')).map(cb => cb.value);

    if (selectedMageIds.length !== 2 || selectedClericIds.length !== 2) {
      alert("Please select exactly 2 starting spells for the Mage and 2 prayers for the Cleric!");
      return;
    }

    const selectedModulePath = document.querySelector('input[name="adventure-module"]:checked')?.value || 'data/adventure_goblin_relic.json';
    const adventureData = await loadJSON(selectedModulePath);

    const chosenMageSpells = mageSpellTier1.filter(s => selectedMageIds.includes(s.id));
    const chosenClericSpells = clericSpellTier1.filter(s => selectedClericIds.includes(s.id));

    document.getElementById('setup-screen').style.display = 'none';

    const game = new GameOrchestrator(adventureData, classesData, chosenMageSpells, chosenClericSpells);
    game.start();
  });
}

/**
 * GameOrchestrator acts as the central nerve center for the application.
 * It coordinates state changes, manages render cycles, and delegates UI controllers.
 */
class GameOrchestrator {
  constructor(adventureData, classesData, chosenMageSpells, chosenClericSpells) {
    this.spec = adventureData;
    this.classesSpec = classesData;
    this.isActionActive = false;

    this.lastFrameTime = performance.now();
    this.frameInterval = 1000 / 60; // Target 60 FPS

    this.bindUIElements();
    this.initializeState(chosenMageSpells, chosenClericSpells);
    this.initializeEngine();
    this.currentAmbientTrack = null;

    this.bindControllers();
  }

  // ===========================================================================
  // INITIALIZATION & BINDING
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

    // Override party with selected setup spells
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
    if (this.spec.audio) {
      AudioManager.registerCustomAudio(this.spec.audio);
    }
  }

  bindControllers() {
    // 1. Level-Up & Training UI Module
    this.levelUpUI = new LevelUpUI(this.state, {
      playSFX: (id) => this.playSFX(id),
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(true),
      flashLevelUpCard: (idx) => this.flashLevelUpCard(idx)
    });

    // 2. Isolated Character Sheet UI Module
    this.characterSheet = new CharacterSheetUI(this.state, {
      playSFX: (id) => this.playSFX(id),
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      onUIAction: (action, payload) => this.handleUIAction(action, payload),
      onLevelUpClick: (hIdx) => this.levelUpUI.open(hIdx)
    });

    // 3. Isolated Shop UI Module
    this.shopUI = new ShopUI(this.state, {
      playSFX: (id) => this.playSFX(id),
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD()
    });

    // 4. Combat Controller with Level-Up Notification Callbacks
    this.combatController = new CombatController(this.state, this.renderer3D, {
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      playSFX: (id) => this.playSFX(id),
      playCombatBgm: (tracks) => this.audioManager.playCombatBgm(tracks),
      stopCombatBgm: () => this.audioManager.stopCombatBgm(),
      flashHeroCard: (idx) => this.flashHeroCardRed(idx),
      showSavingThrowCue: (st) => this.uiController.showSavingThrowCue(st),
      showCombatFloatingCue: (badge, badgeClass, isHeroTarget) => this.uiController.showCombatFloatingCue(badge, badgeClass, isHeroTarget),
      showMasterstrokeCue: (feat) => this.uiController.showMasterstrokeCue(feat),
      applyVisualCombatHp: (enemies, heroHp) => this.uiController.applyVisualCombatHp(enemies, heroHp),
      onPartyWiped: () => this.showGameOver(),
      onCombatEnd: () => this.updateEnvironmentAudio(),
      onLevelUp: (levelUps) => {
        if (!levelUps || levelUps.length === 0) return;
        this.playSFX('level_up');
        levelUps.forEach(evt => {
          this.flashLevelUpCard(evt.heroIndex);
          this.log(`⭐ ${evt.heroName} has earned enough experience for Level ${evt.newLevel}! Visit a town or village mentor to train.`, "success");
        });
        this.uiController.updateHUD(true);
      }
    });

    // 5. Main UI HUD Controller
    this.uiController = new UIController(this.state, this.renderer2D, this.uiElements, {
      onOpenSheet: (heroName) => this.characterSheet.open(heroName),
      onCommand: (hIdx, cmdType, extra) => this.handleCombatCommandQueue(hIdx, cmdType, extra),
      onTargetChange: (hIdx, targetId) => this.handleTargetChange(hIdx, targetId),
      onGlobalAction: (actionType) => this.handleGlobalAction(actionType),
      onUIAction: (actionType, payload) => this.handleUIAction(actionType, payload),
      onLevelUpClick: (hIdx) => this.levelUpUI.open(hIdx),
      playSFX: (id) => this.playSFX(id)
    });

    // 6. Dialogue & Input Controllers
    this.dialogueController = new DialogueController(this.spec, this.state, this.uiController, {
      log: (msg, type) => this.log(msg, type),
      updateHUD: () => this.uiController.updateHUD(),
      playSFX: (id) => this.playSFX(id),
      onLevelUpClick: (hIdx) => this.levelUpUI.open(hIdx),
      onLevelUp: (levelUps) => {
        if (!levelUps || levelUps.length === 0) return;
        this.playSFX('level_up');
        levelUps.forEach(evt => {
          this.flashLevelUpCard(evt.heroIndex);
          this.log(`⭐ ${evt.heroName} has earned enough experience for Level ${evt.newLevel}! Visit a town or village mentor to train.`, "success");
        });
        this.uiController.updateHUD(true);
      }
    });

    new InputController((action) => this.handleInput(action));

    // Global UI listeners
    document.getElementById('close-sheet-btn')?.addEventListener('click', () => this.characterSheet.close());
    document.getElementById('close-shop-btn')?.addEventListener('click', () => this.shopUI.close());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        this.characterSheet.close();
        this.shopUI.close();
        this.levelUpUI.close();
      }
    });
  }

  start() {
    this.uiController.initPartyDOM();
    this.uiController.updateHUD();
    this.updateEnvironmentAudio();

    if (this.spec.name) {
      const titleEl = document.getElementById('main-panel-title');
      if (titleEl) titleEl.textContent = this.spec.name;
    }
    if (this.spec.briefing) this.log(this.spec.briefing, "info");
    const shopName = (this.spec.shop && this.spec.shop.name) || 'The Outfitter';
    this.log(`Expedition underway. Visit ${shopName} to stock up on gear before heading into danger.`, "info");

    requestAnimationFrame(() => this.renderer3D.onResize());

    this.animationLoop = this.animationLoop.bind(this);
    requestAnimationFrame(this.animationLoop);
  }

  // ===========================================================================
  // MAIN RENDER LOOP (60 FPS)
  // ===========================================================================

  animationLoop(currentTime) {
    requestAnimationFrame(this.animationLoop);
    if (!currentTime) return;

    const elapsedSinceLastRender = currentTime - this.lastFrameTime;
    if (elapsedSinceLastRender < this.frameInterval) return;

    const delta = elapsedSinceLastRender / 1000;
    this.lastFrameTime = currentTime - (elapsedSinceLastRender % this.frameInterval);

    if (delta > 0.1) return; // Prevent massive leaps on inactive tab focus

    const speed = 1 - Math.exp(-12 * delta);
    this.camera.x += (this.camera.targetX - this.camera.x) * speed;
    this.camera.y += (this.camera.targetY - this.camera.y) * speed;

    let angleDiff = this.camera.targetAngle - this.camera.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    this.camera.angle += angleDiff * speed;

    // Torch Lighting Renderer Hook
    const isTorchLit = this.state.torchLitUntil && this.state.torchLitUntil > Date.now();
    if (this.renderer3D.setTorchLight) {
      this.renderer3D.setTorchLight(isTorchLit);
    }

    this.renderer3D.render(this.camera, this.state);

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

      if (didMove) {
        this.processMovementTriggers();
        this.updateEnvironmentAudio();
      }
    }
  }

  updateEnvironmentAudio() {
    if (this.state.combat.active) return;
    const isWilderness = this.state.isWildernessTile();
    const desired = isWilderness ? 'wilderness' : 'dungeon';
    if (this.currentAmbientTrack !== desired) {
      if (this.currentAmbientTrack) {
        this.audioManager.stopLoop(this.currentAmbientTrack);
      }
      this.audioManager.playLoop(desired);
      this.currentAmbientTrack = desired;
    }
  }

  processMovementTriggers() {
    const currentX = this.state.player.x;
    const currentY = this.state.player.y;

    // 1. Passive Thief checks
    const hint = this.state.checkPassiveHearNoise();
    if (hint) this.log(`${hint.heroName} catches a faint sound to the ${hint.direction}...`, "muted");

    // 2. Map Interaction Triggers
    const interaction = this.state.checkInteractionTrigger(currentX, currentY);
    if (interaction) {
      this.log(`Map Event: ${interaction.description || 'You triggered an event.'}`, "warning");
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
      const shopName = (this.spec.shop && this.spec.shop.name) || 'Outfitter stall';
      this.log(`${shopName}. Press 🏪 Outfitter to trade.`, "info");
    }
  }

  // ===========================================================================
  // UI ACTION DISPATCHERS
  // ===========================================================================

  handleGlobalAction(actionType) {
    if (actionType === 'RESOLVE_ROUND') this.combatController.resolveCombatRoundSequence();
    else if (actionType === 'OPEN_OBJECT') this.handleOpenObject();
    else if (actionType === 'OPEN_SHOP') this.shopUI.open();
    else if (actionType === 'REST_CAMP') this.handleRestCamp();
  }

  handleUIAction(actionType, payload) {
    const fighter = this.state.party.find(p => p.classKey === 'fighter');
    const thief = this.state.party.find(p => p.classKey === 'thief');
    const cleric = this.state.party.find(p => p.classKey === 'cleric');
    const mage = this.state.party.find(p => p.classKey === 'mage');

    if (actionType === 'PICK_LOCK') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      const target = this.getLockInFront();
      if (!target) return this.log("There is no locked mechanism in front of you.", "info");
      if (this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptPickLock(target.type);
      if (result.reason) {
        this.playSFX('blocked');
        return this.log(result.reason, "warning");
      }
      if (result.success) {
        this.state.unlockTarget(target.x, target.y, target.type);
        this.playSFX('unlock'); this.playSFX('reward');
        this.log(`Success! Picked the lock. [d100=${result.roll} vs Target ${result.chance}%] (Tools: ${result.durability}%)`, "success");
      } else {
        this.playSFX('unlock_try');
        const fumbleMsg = result.fumbled ? " (CRITICAL JAM - extra tool wear)" : "";
        this.log(`Pick lock failed: Tumblers resisted [d100=${result.roll} vs Target ${result.chance}%]${fumbleMsg} (Tools: ${result.durability}%)`, "warning");
      }
      this.uiController.updateHUD();
    }
    else if (actionType === 'FIND_TRAP') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      const target = this.state.getTrapInFront();
      if (!target) return this.log("No traps detected in the immediate area.", "info");
      const result = this.state.attemptFindTrap(target);
      if (result.success) {
        this.playSFX('trap_found');
        this.log(`Success! Trap detected: ${target.name} [d100=${result.roll} vs Target ${result.chance}%]! Ready to disarm.`, "warning");
      } else {
        this.log(`Find traps: No signs found [d100=${result.roll} vs Target ${result.chance}%].`, "info");
      }
      this.uiController.updateHUD();
    }
    else if (actionType === 'DISARM_TRAP') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      const target = this.state.getTrapInFront();
      if (!target) return this.log("No detected trap in front of you to disarm.", "info");
      const result = this.state.attemptDisarmTrap(target);
      if (result.reason) {
        this.playSFX('blocked');
        return this.log(result.reason, "warning");
      }
      if (result.success) {
        this.playSFX('unlock'); this.playSFX('reward');
        this.log(`Success! ${target.name} safely disabled [d100=${result.roll} vs Target ${result.chance}%] (Tools: ${result.durability}%).`, "success");
      } else if (result.triggered) {
        this.playSFX('backstab'); setTimeout(() => this.playSFX('falling'), 500);
        this.log(`CRITICAL FUMBLE! [d100=${result.roll} vs Target ${result.chance}%] ${target.name} tripped!`, "danger");
      } else {
        this.playSFX('unlock_try');
        this.log(`Disarm failed: Mechanism resisted probes [d100=${result.roll} vs Target ${result.chance}%] (Tools: ${result.durability}%). Trap remains primed.`, "warning");
      }
      this.uiController.updateHUD();
    }
    else if (actionType === 'HIDE_SHADOWS') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      const result = this.state.attemptHideInShadows();
      if (result.success) {
        this.playSFX('hide'); this.playSFX('reward');
        this.log(`Success! Slips into shadows (Stealth Active).`, "success");
      } else this.log(`Hide in shadows failed.`, "warning");
      this.uiController.updateHUD();
    }
    else if (actionType === 'SCOUT_AHEAD') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      const result = this.state.attemptScout();
      if (!result.success) return this.log(result.reason || `Scouting turned up nothing.`, "info");
      if (result.discoveries.length === 0) this.log(`The way ahead looks clear.`, "info");
      else result.discoveries.forEach(d => this.log(`Scouted ahead: ${d.name} detected.`, "warning"));
      this.uiController.updateHUD();
    }
    else if (actionType === 'PICKPOCKET_NPC') {
      if (!thief || thief.hp <= 0) return this.log("The thief is incapacitated.", "warning");
      if (!this.state.activeNpc) return;
      const result = this.state.attemptPickpocket(this.state.activeNpc);
      if (result.success) this.log(`Pickpocketed ${result.stolenItem.name}!`, "success");
      else this.log(`Pickpocket failed! Caught in the act!`, "danger");
      this.uiController.updateHUD();
    }
    else if (actionType === 'STUDY_GRIMOIRE') {
      if (!mage || mage.hp <= 0) return this.log("The mage is incapacitated.", "warning");
      const result = this.state.studyGrimoire();
      if (!result.success) return this.log(result.reason, "warning");
      if (result.brainBurnDamage > 0) this.log(`BRAIN BURN! Forced memory (-${result.cognitiveCost} Cog, ${result.brainBurnDamage} HP).`, "danger");
      else this.log(`Memorization complete. Cognitive burden -${result.cognitiveCost}.`, "warning");
      this.uiController.updateHUD(true);
    }
    else if (actionType === 'CAST_MAGE_SPELL') {
      if (!mage || mage.hp <= 0) return this.log("The mage is incapacitated.", "warning");
      const res = this.state.castMageSpell(payload);
      if (res.success) {
        this.playSFX('magic_missile');
        this.log(res.log || `Released ${res.spellName}.`, "success");
      } else {
        this.log(res.reason, "warning");
      }
      this.uiController.updateHUD(true);
    }
    else if (actionType === 'STUDY_PRAYERS') {
      if (!cleric || cleric.hp <= 0) return this.log("The cleric is incapacitated.", "warning");
      const result = this.state.studyClericPrayers();
      if (!result.success) return this.log(result.reason, "warning");
      this.log(`Dawn petition answered. Prayers granted anew.`, "success");
      this.uiController.updateHUD(true);
    }
    else if (actionType === 'CAST_CLERIC_PRAYER') {
      if (!cleric || cleric.hp <= 0) return this.log("The cleric is incapacitated.", "warning");
      if (typeof payload === 'object' && payload !== null) {
        this.handleCastClericPrayerOffCombat(payload.spellIndex, payload.targetHeroIndex);
      } else {
        this.handleCastClericPrayerOffCombat(payload);
      }
    }
    else if (actionType === 'BASH_DOOR') {
      if (!fighter || fighter.hp <= 0) return this.log("The fighter is incapacitated and cannot bash.", "warning");
      const target = this.getLockInFront();
      if (!target || this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptBash(fighter);
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
      if (!mage || mage.hp <= 0) return this.log("The mage is incapacitated.", "warning");
      const target = this.getLockInFront();
      if (!target || this.checkTrapBeforeAction(target)) return;
      const result = this.state.attemptReadMagic(mage, target);
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
    this.uiController.updateHUD();
  }

  handleTargetChange(hIdx, targetId) {
    const currentCmd = this.state.combat.queuedCommands[hIdx] || { type: 'ATTACK' };
    this.state.queueHeroCommand(hIdx, { ...currentCmd, targetInstanceId: targetId });
  }

  handleCastClericPrayerOffCombat(spellIndex, targetHeroIndex = null) {
    if (this.state.combat.active) return;
    const cleric = this.state.party.find(p => p.classKey === 'cleric');
    if (!cleric) return this.log("No cleric in party.", "warning");
    if (cleric.hp <= 0) return this.log("The cleric is incapacitated and cannot invoke prayers.", "danger");
    if (cleric.divineFavor <= 0 || cleric.absoluteSilence) return this.log("Absolute Silence — no divine power flows.", "warning");

    const spell = cleric.spells && cleric.spells[spellIndex];
    if (!spell || spell.spent) return this.log("That prayer was already invoked today.", "warning");

    const effect = spell.effect || {};

    // For single-target healing spells (like Cure Light Wounds, Cure Serious Wounds, Heal)
    if (effect.type === 'heal') {
      // If target is explicitly provided
      if (targetHeroIndex != null) {
        const res = this.state.castClericPrayer(spellIndex, targetHeroIndex);
        if (res.success) {
          this.audioManager.play('cure_wounds');
          const revivedMsg = res.wasIncapacitated ? ' Revived from incapacitation!' : '';
          this.log(`✨ ${cleric.name} invokes ${spell.name} on ${res.targetHeroName}, restoring ${res.hpHealed} HP (${res.currentHp}/${res.maxHp})!${revivedMsg}`, "success");
          this.uiController.updateHUD(true);
          if (this.characterSheet && this.characterSheet.modal && this.characterSheet.modal.style.display !== 'none') {
            this.characterSheet.open(res.targetHeroName);
          }
        } else {
          this.log(res.reason || "The prayer could not be completed.", "warning");
        }
        return;
      }

      // Check if all party members are already at full health
      const woundedMembers = this.state.party.filter(h => h.hp < h.maxHp);
      if (woundedMembers.length === 0) {
        return this.log(`All party members are already at full health. Save ${spell.name} for when blood is spilled.`, "warning");
      }

      // Prompt the player to select which hero to heal
      const choices = this.state.party.map((hero, idx) => {
        const isFull = hero.hp >= hero.maxHp;
        const isInc = hero.hp <= 0;
        const status = isInc ? ' [Incapacitated]' : isFull ? ' [Full Health]' : ` [HP: ${hero.hp}/${hero.maxHp}]`;
        const icon = hero.classKey === 'fighter' ? '🛡️' : hero.classKey === 'thief' ? '🗡️' : hero.classKey === 'cleric' ? '✨' : '🔮';
        return {
          text: `${icon} ${hero.name} — ${status}`,
          disabled: isFull,
          callback: () => {
            const res = this.state.castClericPrayer(spellIndex, idx);
            if (res.success) {
              this.audioManager.play('cure_wounds');
              const revivedMsg = res.wasIncapacitated ? ' Revived from incapacitation!' : '';
              this.log(`✨ ${cleric.name} invokes ${spell.name} on ${hero.name}, restoring ${res.hpHealed} HP (${res.currentHp}/${res.maxHp})!${revivedMsg}`, "success");
              this.uiController.updateHUD(true);
              if (this.characterSheet && this.characterSheet.modal && this.characterSheet.modal.style.display !== 'none') {
                this.characterSheet.open(hero.name);
              }
            } else {
              this.log(res.reason || "The prayer failed.", "warning");
            }
          }
        };
      });

      choices.push({
        text: '❌ Cancel',
        callback: () => {
          this.log(`The invocation of ${spell.name} is held back.`, "info");
        }
      });

      this.uiController.showInteractionModal({
        title: `✨ ${cleric.name} — ${spell.name}`,
        prompt: `Select a party member to bestow with divine healing (+${effect.amount || 15} HP):`,
        choices
      });
      return;
    }

    // For party healing spells (like Holy Blessing)
    if (effect.type === 'party_heal') {
      const res = this.state.castClericPrayer(spellIndex);
      if (res.success) {
        this.audioManager.play('cure_wounds');
        if (res.totalHealed > 0) {
          this.log(`✨ ${cleric.name} invokes ${spell.name} — party recovers ${res.totalHealed} HP total!`, "success");
        } else {
          this.log(`✨ ${cleric.name} invokes ${spell.name} across the party!`, "success");
        }
        this.uiController.updateHUD(true);
        if (this.characterSheet && this.characterSheet.modal && this.characterSheet.modal.style.display !== 'none') {
          this.characterSheet.open(cleric.name);
        }
      } else {
        this.log(res.reason || "The prayer failed.", "warning");
      }
      return;
    }

    // For buff/other prayers
    const res = this.state.castClericPrayer(spellIndex);
    if (res.success) {
      this.audioManager.play('bless');
      this.log(`✨ Divine invocation! ${res.spellName}`, "success");
      this.uiController.updateHUD(true);
      if (this.characterSheet && this.characterSheet.modal && this.characterSheet.modal.style.display !== 'none') {
        this.characterSheet.open(cleric.name);
      }
    } else {
      this.log(res.reason || "The prayer failed.", "warning");
    }
  }

  // ===========================================================================
  // WORLD INTERACTIONS & TRAPS
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
      if ((tileId === 2 || tileId === 8) && !this.state.openedDoors.has(key)) {
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
      if (this.state.detectedTraps.has(trapKey)) {
        this.playSFX('blocked');
        this.log(`⚠️ Active Trap: ${target.tileDef.trap.name} is primed! Disarm it first before tampering with this lock.`, "warning");
        return true;
      }

      this.state.disarmedTraps.add(trapKey);
      this.playSFX('backstab'); setTimeout(() => this.playSFX('falling'), 500);

      const trap = this.state.triggerTrap(target.tileDef.trap);
      this.log(`⚠️ CONCEALED TRAP TRIGGERED! The ${target.tileDef.name} unleashes ${target.tileDef.trap.name}!`, "danger");

      trap.results.forEach((r, idx) => {
        const modStr = r.save.abilityMod ? (r.save.abilityMod > 0 ? `+${r.save.abilityMod}` : `${r.save.abilityMod}`) : '';
        const rollDetail = `(d20=${r.save.roll}${modStr} vs Target ${r.save.target})`;
        
        if (r.save.success) {
          this.log(`🛡️ HEROIC FORTITUDE: ${r.save.narrative} ${rollDetail} [${r.damage} dmg resisted]`, "success");
        } else {
          this.log(`💀 MORTAL BREACH: ${r.save.narrative} ${rollDetail} [${r.damage} dmg taken]`, "danger");
        }

        if (idx === 0 || !r.save.success) {
          this.uiController.showSavingThrowCue(r.save);
        }

        this.flashHeroCardRed(r.heroIndex);
        if (r.isDead) this.log(`💀 ${r.heroName} collapses from fatal trauma!`, "danger");
      });

      this.uiController.updateHUD();
      return true;
    }
    return false;
  }

  // ===========================================================================
  // CAMPING & RESTING
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
  // LEVEL-UP FANFARE & MODAL HELPERS
  // ===========================================================================

  flashLevelUpCard(heroIndex) {
    const cards = this.uiElements.partyContainer.querySelectorAll('.hero-card');
    const card = cards[heroIndex];
    if (card) {
      card.classList.remove('level-up-glow');
      void card.offsetWidth; // Force CSS reflow
      card.classList.add('level-up-glow');
      setTimeout(() => card.classList.remove('level-up-glow'), 1800);
    }
  }

  // ===========================================================================
  // UTILITIES & DELEGATES
  // ===========================================================================

  log(message, type = 'info') {
    const colorMap = { info: '#c9d1d9', success: '#3fb950', warning: '#d29922', danger: '#f85149', muted: '#8b949e', masterstroke: '#ffd700' };
    if (type === 'masterstroke') {
      this.uiElements.narrativeLog.innerHTML += `<div class="combat-log-masterstroke">${message}</div>`;
    } else {
      this.uiElements.narrativeLog.innerHTML += `<div style="color: ${colorMap[type] || colorMap.info}; margin-bottom: 3px;">> ${message}</div>`;
    }
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