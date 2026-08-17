import { loadJSON } from './engine/loader.js';
import { GameState } from './engine/state.js';
import { RendererThreeJS } from './engine/renderer_three.js';
import { Renderer2D } from './engine/renderer2d.js';
import { InputController } from './engine/input.js';
import { AudioManager } from './engine/audio.js';
import { CombatController } from './engine/combat_controller.js';
import { UIController } from './engine/ui_controller.js';
import { DialogueController } from './engine/dialogue_controller.js';

/**
 * Initializes application data, populates spell/prayer selection options on the setup screen,
 * and handles the transition into the main game loop upon clicking start.
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

  mageChoicesContainer.innerHTML = '';
  clericChoicesContainer.innerHTML = '';

  mageAvailable.forEach((spell, idx) => {
    mageChoicesContainer.innerHTML += `
      <label class="spell-option-label">
        <input type="checkbox" name="mage-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
        <span><b>${spell.name}</b> (Load: ${spell.cognitive_load}) ${spell.description}</span>
      </label>`;
  });

  clericAvailable.forEach((spell, idx) => {
    clericChoicesContainer.innerHTML += `
      <label class="spell-option-label">
        <input type="checkbox" name="cleric-spell" value="${spell.id}" ${idx < 2 ? 'checked' : ''}>
        <span><b>${spell.name}</b> ${spell.description}</span>
      </label>`;
  });

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
    startGame(adventureData, classesData, chosenMageSpells, chosenClericSpells);
  });
}

/**
 * Core Orchestrator. Bootstraps state, renderers, managers, controllers,
 * and kicks off the 60fps animation render loop.
 */
function startGame(adventureData, classesData, chosenMageSpells, chosenClericSpells) {
  const container3D = document.getElementById('three-container');
  const canvasMini = document.getElementById('minimapCanvas');
  canvasMini.width = 150;
  canvasMini.height = 130;

  // Gather UI Elements for Controller Injections
  const uiElements = {
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

  const state = new GameState(adventureData, classesData);
  state.onLog = (message, type) => log(message, type);

  state.party = [
    state.createPartyMember("fighter", "Valeros"),
    state.createPartyMember("thief", "Merisiel"),
    state.createPartyMember("cleric", "Kyra", chosenClericSpells),
    state.createPartyMember("mage", "Elminster", chosenMageSpells)
  ];

  const renderer3D = new RendererThreeJS(container3D);
  renderer3D.buildWorld(adventureData, state);
  const renderer2D = new Renderer2D(canvasMini);
  const audioManager = new AudioManager();

  // Instantiate Controllers
  const combatController = new CombatController(state, renderer3D, {
    log: (msg, type) => log(msg, type),
    updateHUD: () => uiController.updateHUD(),
    playSFX: (id) => audioManager.play(id),
    playCombatBgm: (tracks) => audioManager.playCombatBgm(tracks),
    stopCombatBgm: () => audioManager.stopCombatBgm(),
    flashHeroCard: (idx) => flashHeroCardRed(idx),
    // Staged HP reveal during the 1.5s combat beats (visual snapshots only)
    applyVisualCombatHp: (enemies, heroHp) => uiController.applyVisualCombatHp(enemies, heroHp),
    onPartyWiped: () => showGameOver()
  });

  const uiController = new UIController(state, renderer2D, uiElements, {
    onOpenSheet: (heroName) => {
      const hero = state.party.find(p => p.name === heroName);
      if (hero) openCharacterSheet(hero);
    },
    onCommand: (hIdx, cmdType, extra = {}) => {
      playSFX('button');
      // Channeling lock: once a spell is queued, only another spell may replace it
      const existing = state.combat.queuedCommands[hIdx];
      if (existing && existing.type === 'CAST' && cmdType !== 'CAST') {
        log(`${state.party[hIdx].name} is channeling — cannot take another action this round.`, "warning");
        return;
      }
      if (cmdType === 'SHOOT' && !state.canHeroShoot(state.party[hIdx])) {
        log(`${state.party[hIdx].name} needs a ranged weapon equipped to Shoot.`, "warning");
        return;
      }
      if (cmdType === 'ATTACK' && !state.canHeroMelee(state.party[hIdx])) {
        log(`${state.party[hIdx].name} needs a melee weapon equipped to Strike.`, "warning");
        return;
      }
      const selectEl = uiElements.partyContainer.querySelector(`.target-select[data-hero="${hIdx}"]`);
      const targetId = selectEl ? selectEl.value : null;
      const command = { type: cmdType, targetInstanceId: targetId, ...extra };
      state.queueHeroCommand(hIdx, command);

      if (cmdType === 'GUARD') {
        const gIdx = extra.guardTargetIndex;
        const label = gIdx === hIdx ? 'self (+1 AC)' : (state.party[gIdx] ? state.party[gIdx].name : 'ally');
        log(`${state.party[hIdx].name} will guard ${label}`, "info");
      } else if (cmdType === 'CAST') {
        const sp = state.party[hIdx].spells && state.party[hIdx].spells[extra.spellIndex];
        log(`${state.party[hIdx].name} begins channeling ${sp ? sp.name : 'a spell'}…`, "info");
      } else if (cmdType === 'PRAY') {
        const sp = state.party[hIdx].spells && state.party[hIdx].spells[extra.spellIndex];
        log(`${state.party[hIdx].name} will invoke ${sp ? sp.name : 'a prayer'}`, "info");
      } else if (cmdType === 'TURN') {
        log(`${state.party[hIdx].name} will brandish the holy symbol — Turn Undead!`, "info");
      } else {
        log(`${state.party[hIdx].name} order set: ${cmdType}`, "info");
      }
      uiController.updateHUD();
    },
    onTargetChange: (hIdx, targetId) => {
      const currentCmd = state.combat.queuedCommands[hIdx] || { type: 'ATTACK' };
      state.queueHeroCommand(hIdx, { ...currentCmd, targetInstanceId: targetId });
      log(`${state.party[hIdx].name} targeted ${targetId}`, "muted");
    },
    onGlobalAction: (actionType) => {
      if (actionType === 'RESOLVE_ROUND') {
        combatController.resolveCombatRoundSequence();
      } else if (actionType === 'OPEN_OBJECT') {
        handleOpenObject();
      } else if (actionType === 'OPEN_SHOP') {
        openShop();
      } else if (actionType === 'REST_CAMP') {
        handleRestCamp();
      }
    },
    onUIAction: (actionType, payload) => {
      handleUIAction(actionType, payload);
    }
  });

  const dialogueController = new DialogueController(adventureData, state, uiController, {
    log: (msg, type) => log(msg, type),
    updateHUD: () => uiController.updateHUD(),
    playSFX: (id) => audioManager.play(id)
  });

  // Force resize measurement on next frame after setup screen closes
  requestAnimationFrame(() => {
    renderer3D.onResize();
  });

  const camera = {
    x: state.player.x,
    y: state.player.y,
    angle: facingToAngle(state.player.facing),
    targetX: state.player.x,
    targetY: state.player.y,
    targetAngle: facingToAngle(state.player.facing)
  };

  let isActionActive = false;

  /** Appends a color-coded message to the adventure log. */
  function log(message, type = 'info') {
    const colorMap = { info: '#c9d1d9', success: '#3fb950', warning: '#d29922', danger: '#f85149', muted: '#8b949e' };
    const color = colorMap[type] || colorMap.info;
    uiElements.narrativeLog.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">> ${message}</div>`;
    uiElements.narrativeLog.scrollTop = uiElements.narrativeLog.scrollHeight;
  }

  /** One-shot SFX via central AudioManager registry (ids only — see engine/audio.js). */
  function playSFX(id) {
    audioManager.play(id);
  }

  /** Full party wipe — show ending and offer restart. */
  function showGameOver() {
    const wipedText = (adventureData.endings && adventureData.endings.party_wiped)
      || 'The flooded dark keeps what it takes. The expedition is over.';
    // Reuse interaction modal as a simple game-over screen
    const modal = document.getElementById('interaction-modal');
    const title = document.getElementById('interaction-title');
    const prompt = document.getElementById('interaction-prompt');
    const actions = document.getElementById('interaction-actions');
    if (!modal || !title || !prompt || !actions) {
      // Fallback: hard reload
      setTimeout(() => location.reload(), 2500);
      return;
    }
    title.textContent = '💀 PARTY WIPED';
    prompt.textContent = wipedText;
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'action-tab primary';
    btn.style.width = '100%';
    btn.style.padding = '12px';
    btn.textContent = 'RESTART EXPEDITION';
    btn.addEventListener('click', () => location.reload());
    actions.appendChild(btn);
    modal.style.display = 'flex';
  }

  /** Converts cardinal direction string to 2D canvas radian angles. */
  function facingToAngle(facing) {
    switch (facing) {
      case 'EAST': return 0;
      case 'SOUTH': return Math.PI / 2;
      case 'WEST': return Math.PI;
      case 'NORTH': return -Math.PI / 2;
      default: return 0;
    }
  }

  /** Triggers a visual flash animation on a specific hero's card when hit. */
  function flashHeroCardRed(heroIndex) {
    const cards = uiElements.partyContainer.querySelectorAll('.hero-card');
    const card = cards[heroIndex];
    if (card) {
      card.classList.remove('hit-flash');
      void card.offsetWidth;
      card.classList.add('hit-flash');
    }
  }

  /** Raycasts/checks the map tile directly in front of the player for doors or chests. */
  function getInteractiveTargetInFront() {
    let dx = 0, dy = 0;
    if (state.player.facing === 'NORTH') dy = -1;
    if (state.player.facing === 'SOUTH') dy = 1;
    if (state.player.facing === 'EAST') dx = 1;
    if (state.player.facing === 'WEST') dx = -1;

    const targetX = state.player.x + dx;
    const targetY = state.player.y + dy;

    if (targetY >= 0 && targetY < state.spec.map.length && targetX >= 0 && targetX < state.spec.map[0].length) {
      const tileId = state.spec.map[targetY][targetX];
      const key = `${targetX},${targetY}`;
      if (tileId === 2 && !state.openedDoors.has(key)) {
        const tileDef = state.spec.legend[tileId];
        const isLocked = tileDef && tileDef.locked && !state.unlockedDoors.has(key);
        return { x: targetX, y: targetY, type: 'door', locked: isLocked, tileDef };
      }
      if (tileId === 3 && !state.openedChests.has(key)) {
        const tileDef = state.spec.legend[tileId];
        const isLocked = tileDef && tileDef.locked && !state.unlockedChests.has(key);
        return { x: targetX, y: targetY, type: 'chest', locked: isLocked, tileDef };
      }
      // Fallback: chest entity prop on this tile even if map legend is floor
      if (!state.openedChests.has(key) && state.spec.entities) {
        const chestEnt = state.spec.entities.find(e =>
          e.model === 'chest' && e.x === targetX && e.y === targetY
        );
        if (chestEnt) {
          const tileDef = state.spec.legend[3] || { name: 'Chest', locked: null };
          const isLocked = tileDef.locked && !state.unlockedChests.has(key);
          return { x: targetX, y: targetY, type: 'chest', locked: !!isLocked, tileDef };
        }
      }
    }
    return null;
  }

  /** Checks and resolves traps present on doors or chests before interacting. */
  function checkTrapBeforeAction(target) {
    if (!target || !target.tileDef) return false;
    const trapKey = `${target.x},${target.y}`;
    if (target.tileDef.trap && !state.disarmedTraps.has(trapKey)) {
      state.disarmedTraps.add(trapKey);
      playSFX('backstab');
      setTimeout(() => playSFX('falling'), 500);

      const trap = state.triggerTrap(target.tileDef.trap);
      log(`TRAP TRIGGERED! The ${target.tileDef.name} unleashes ${target.tileDef.trap.name}!`, "danger");

      trap.results.forEach(r => {
        const verdict = r.save.success
          ? `saves vs. ${trap.category} (rolled ${r.save.roll} vs ${r.save.target}) — takes ${r.damage} damage (halved)`
          : `fails the save vs. ${trap.category} (rolled ${r.save.roll} vs ${r.save.target}) — takes ${r.damage} damage!`;
        log(`${r.heroName} ${verdict}`, r.save.success ? "warning" : "danger");
        flashHeroCardRed(r.heroIndex);
        if (r.isDead) log(`${r.heroName} collapses, incapacitated!`, "danger");
      });

      uiController.updateHUD();
      return true;
    }
    return false;
  }

  /** Closes the detailed character inventory/stats sheet modal. */
  function closeCharacterSheet() {
    const modal = document.getElementById('char-sheet-modal');
    if (modal && modal.style.display !== 'none') {
      modal.style.display = 'none';
      playSFX('sheet');
    }
  }

  /** Renders and opens the character stats sheet modal for a given party member. */
  function openCharacterSheet(hero) {
    playSFX('sheet');
    const modal = document.getElementById('char-sheet-modal');
    const titleEl = document.getElementById('sheet-char-title');
    const contentEl = document.getElementById('sheet-content');

    titleEl.textContent = `${hero.name.toUpperCase()} — LEVEL ${hero.level || 1} ${hero.className.toUpperCase()}`;

    const attrs = hero.attributes;
    const statsHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #0d1117; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>Strength: <b style="color:var(--text-parchment);">${attrs.strength}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.strength})</span></div>
      <div>Dexterity: <b style="color:var(--text-parchment);">${attrs.dexterity}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.dexterity})</span></div>
      <div>Constitution: <b style="color:var(--text-parchment);">${attrs.constitution}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.constitution})</span></div>
      <div>Intelligence: <b style="color:var(--text-parchment);">${attrs.intelligence}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.intelligence})</span></div>
      <div>Wisdom: <b style="color:var(--text-parchment);">${attrs.wisdom}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.wisdom})</span></div>
      <div>Charisma: <b style="color:var(--text-parchment);">${attrs.charisma}</b> <span style="color:var(--text-muted);">(d20 ≤ ${attrs.charisma})</span></div>
    </div>`;

    const combatHTML = `
    <div style="display: flex; justify-content: space-between; background: #161b22; padding: 8px 12px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>HP: <b style="color:#3fb950;">${hero.hp}/${hero.maxHp}</b></div>
      <div>AC: <b style="color:var(--accent-gold);">${hero.armorClass || 5}</b></div>
      <div>Attack Bonus: <b>+${hero.attackBonus || 1}</b></div>
      <div>XP: <b>${hero.xp || 0} / ${hero.nextLevelXp || 500}</b></div>
    </div>`;

    let skillsHTML = '';
    if (hero.skills && Object.keys(hero.skills).length > 0) {
      const skillRows = Object.entries(hero.skills).map(([key, skill]) => {
        const target = state.getSkillTarget(hero, key);
        if (skill.type === 'percentile') {
          const levelBonus = (hero.level - 1) * (skill.perLevel || 5);
          return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed #21262d; font-size: 12px;">
            <span><b>${skill.name}</b> <span style="color:var(--text-muted); font-size:10px;">(d100 Tradecraft)</span></span>
            <span style="color: #f0883e; font-weight: bold;">${target}% <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Base:${skill.base}% + Lvl:+${levelBonus}%)</span></span>
          </div>`;
        } else {
          const rawAttr = hero.attributes[skill.attribute] || 10;
          const skillBonus = skill.base + (hero.level - 1) * (skill.perLevel || 1);
          return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 0; border-bottom: 1px dashed #21262d; font-size: 12px;">
            <span><b>${skill.name}</b> <span style="color:var(--text-muted); font-size:10px;">(${skill.attribute.toUpperCase()})</span></span>
            <span style="color: var(--accent-gold); font-weight: bold;">d20 ≤ ${target} <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Attr:${rawAttr} + Skill:+${skillBonus})</span></span>
          </div>`;
        }
      }).join('');

      skillsHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">🎯 Class Skills & Proficiencies</div>
        ${skillRows}
      </div>`;
    }

    let specializedHTML = '';
    if (hero.classKey === 'mage') {
      const heldLoad = (hero.spells || []).filter(s => !s.spent).reduce((sum, s) => sum + (s.cognitive_load || 0), 0);
      const erasedCount = (hero.spells || []).filter(s => s.spent).length;
      const spellsList = hero.spells.map(s => `<li style="color: ${s.spent ? '#484f58' : '#d2a8ff'}; text-decoration: ${s.spent ? 'line-through' : 'none'}; margin-bottom: 2px;">[L${s.level}] ${s.name} — load ${s.cognitive_load || '?'} (${s.spent ? 'Erased' : 'Held in mind'})</li>`).join('');
      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">⚡ Vancian Arcane Metrics</div>
        <div>Cognition: <b style="color:#d2a8ff;">${hero.cognition}/${hero.maxCognition}</b> <span style="color:var(--text-muted);font-size:10px;">(held burden ${heldLoad})</span></div>
        <div style="margin-top: 6px;">Prepared constructs:</div>
        <ul style="margin: 4px 0 0 18px; padding: 0;">${spellsList}</ul>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-grimoire-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${erasedCount === 0 ? 'disabled' : ''}>📖 Study Grimoire</button>
          <span style="color:var(--text-muted);font-size:10px;">Reloads erased spells (full load). Residual burn clears on rest.</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'cleric') {
      const invokedCount = (hero.spells || []).filter(s => s.spent).length;
      const prayersList = hero.spells.map(s => `<li style="color: ${s.spent ? '#484f58' : '#58a6ff'}; text-decoration: ${s.spent ? 'line-through' : 'none'}; margin-bottom: 2px;">[L${s.level}] ${s.name} (${s.spent ? 'Invoked today' : 'Granted'})</li>`).join('');
      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">✨ Divine Communion Metrics</div>
        <div>Divine Favor: <b style="color:#58a6ff;">${hero.divineFavor}%</b> | Status: <b>${hero.ethosStatus}</b></div>
        <div style="margin-top: 6px;">Daily allotment:</div>
        <ul style="margin: 4px 0 0 18px; padding: 0;">${prayersList}</ul>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-prayers-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${invokedCount === 0 || hero.divineFavor <= 0 ? 'disabled' : ''}>🙏 Petition Deity</button>
          <span style="color:var(--text-muted);font-size:10px;">No favor cost — obedience is the currency. Rest then petition to reopen slots.</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'thief') {
      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">🗡️ Rogue Metrics</div>
        <div>Tools Durability: <b style="color:#f0883e;">${hero.toolsDurability}%</b></div>
        <div>Stealth State: <b>${hero.isStealth ? 'Active (Hidden)' : 'Inactive'}</b></div>
      </div>`;
    }

    const heroIndex = state.party.indexOf(hero);
    const equipped = hero.equippedWeapon || 'None';
    const equippedIsRanged = state.isRangedWeapon(hero.equippedWeapon);
    const invItems = (hero.inventory || []);
    const invRows = invItems.length === 0
      ? `<div style="color:var(--text-muted);">Empty</div>`
      : invItems.map(i => {
        const isWeapon = state.isKnownWeapon(i.name);
        const equipBtn = isWeapon
          ? `<button class="action-tab equip-weapon-btn" data-hero-index="${heroIndex}" data-weapon="${i.name}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Equip</button>`
          : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
            <span>${i.amount || 1}× ${i.name}${isWeapon && state.isRangedWeapon(i.name) ? ' <span style="color:var(--favor-blue);font-size:10px;">(ranged)</span>' : ''}</span>
            ${equipBtn}
          </div>`;
      }).join('');

    // Usable consumables from the shared party pack
    const usableDefs = Object.entries(GameState.ITEM_CATALOG || {})
      .filter(([, d]) => d.usable && d.scope === 'party');
    const partyUsableRows = usableDefs.map(([name]) => {
      const qty = state.getPartyItemQty(name);
      if (qty < 1) return '';
      const def = state.getItemDef(name);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
          <span title="${def ? def.description : ''}">${qty}× ${name}</span>
          <button class="action-tab use-item-btn" data-hero-index="${heroIndex}" data-item="${name}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Use</button>
        </div>`;
    }).filter(Boolean).join('') || `<div style="color:var(--text-muted);">No usable items in the party pack.</div>`;

    const gearHTML = `
    <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; font-size: 12px;">
      <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">📦 Equipment & Inventory</div>
      <div style="margin-bottom:6px;">Equipped Weapon: <b style="color:var(--gold-tsr);">${equipped}</b>
        ${equippedIsRanged ? '<span style="color:var(--favor-blue);font-size:10px;"> — ranged (Shoot available)</span>' : '<span style="color:var(--text-muted);font-size:10px;"> — melee</span>'}
      </div>
      <div style="color: var(--accent-gold); font-weight: bold; margin: 8px 0 4px; font-size: 12px;">Personal Inventory</div>
      ${invRows}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 10px 0 4px; font-size: 12px;">Party Pack (use on this hero)</div>
      ${partyUsableRows}
    </div>`;

    contentEl.innerHTML = statsHTML + combatHTML + skillsHTML + specializedHTML + gearHTML;
    modal.style.display = 'flex';

    contentEl.querySelectorAll('.equip-weapon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const weapon = btn.getAttribute('data-weapon');
        const result = state.equipHeroWeapon(hIdx, weapon);
        if (result.success) {
          playSFX('button');
          log(`${state.party[hIdx].name} equips ${result.equipped}.`, "success");
          openCharacterSheet(state.party[hIdx]);
          uiController.updateHUD();
        } else {
          log(result.reason || 'Could not equip.', "warning");
        }
      });
    });

    contentEl.querySelectorAll('.use-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const itemName = btn.getAttribute('data-item');
        const result = state.useConsumable(itemName, hIdx);
        if (result.success) {
          playSFX('reward');
          log(result.log || `Used ${itemName}.`, "success");
          openCharacterSheet(state.party[hIdx]);
          uiController.updateHUD();
        } else {
          log(result.reason || 'Could not use item.', "warning");
        }
      });
    });

    const studyBtn = contentEl.querySelector('#sheet-study-grimoire-btn');
    if (studyBtn) {
      studyBtn.addEventListener('click', () => {
        handleUIAction('STUDY_GRIMOIRE');
        const mage = state.party.find(p => p.classKey === 'mage');
        if (mage) openCharacterSheet(mage);
      });
    }
    const prayBtn = contentEl.querySelector('#sheet-study-prayers-btn');
    if (prayBtn) {
      prayBtn.addEventListener('click', () => {
        handleUIAction('STUDY_PRAYERS');
        const cleric = state.party.find(p => p.classKey === 'cleric');
        if (cleric) openCharacterSheet(cleric);
      });
    }
  }




  document.getElementById('close-sheet-btn')?.addEventListener('click', closeCharacterSheet);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.code === 'Escape') closeCharacterSheet();
  });

  /** Routes and processes specific exploration/hero utility actions dispatched from UI Controller. */
  function handleUIAction(actionType, payload) {
    if (actionType === 'PICK_LOCK') {
      const target = state.getLockInFront();
      if (!target) return;
      if (checkTrapBeforeAction(target)) return;
      const result = state.attemptPickLock(target.type);
      if (result.success) {
        state.unlockTarget(target.x, target.y, target.type);
        playSFX('unlock');
        playSFX('reward');
        log("Success! Picked the lock.", "success");
      } else {
        playSFX('unlock_try');
        log("Pick lock failed.", "danger");
      }
      uiController.updateHUD();
    } else if (actionType === 'FIND_TRAP') {
      const target = state.getTrapInFront();
      if (!target) {
        log(`No traps here.`, "info");
        return;
      }
      const result = state.attemptFindTrap(target);
      if (result.success) {
        playSFX('trap_found');
        log(`Success! Trap detected: ${target.name}. Disarm unlocked!`, "warning");
      } else {
        log(`Find traps failed (Roll ${result.roll} > ${result.chance}%).`, "info");
      }
      uiController.updateHUD();
    } else if (actionType === 'DISARM_TRAP') {
      const target = state.getTrapInFront();
      if (!target) return;
      const result = state.attemptDisarmTrap(target);
      if (result.success) {
        playSFX('unlock');
        playSFX('reward');
        log(`Success! ${target.name} disarmed.`, "success");
      } else if (result.triggered) {
        playSFX('backstab');
        setTimeout(() => playSFX('falling'), 500);
        log(`DISASTER! ${target.name} triggered, dealing ${result.damage} damage!`, "danger");
      }
      uiController.updateHUD();
    } else if (actionType === 'HIDE_SHADOWS') {
      const thief = state.party.find(p => p.classKey === 'thief');
      const result = state.attemptHideInShadows();
      if (result.success) {
        playSFX('hide');
        playSFX('reward');
        log(`Success! ${thief.name} slips into shadows (Stealth Active).`, "success");
      } else {
        log(`Hide in shadows failed.`, "warning");
      }
      uiController.updateHUD();
    } else if (actionType === 'SCOUT_AHEAD') {
      const result = state.attemptScout();
      if (!result.success) {
        log(result.reason || `Scouting turned up nothing. (Roll ${result.roll} > ${result.chance}%)`, "info");
        return;
      }
      if (result.discoveries.length === 0) {
        log(`The way ahead looks clear.`, "info");
      } else {
        result.discoveries.forEach(d => {
          if (d.type === 'trap') log(`Scouted ahead: trap detected — ${d.name}.`, "warning");
          else log(`Scouted ahead: ${d.name} lurking nearby!`, "danger");
        });
      }
      uiController.updateHUD();

    } else if (actionType === 'PICKPOCKET_NPC') {
      if (!state.activeNpc) return;
      const result = state.attemptPickpocket(state.activeNpc);
      if (result.success) {
        log(`Success! Pickpocketed ${result.stolenItem.amount || 1}x ${result.stolenItem.name} from ${state.activeNpc.name}!`, "success");
      } else {
        log(`Pickpocket failed! Caught in the act!`, "danger");
      }
      uiController.updateHUD();
    } else if (actionType === 'STUDY_GRIMOIRE') {
      const result = state.studyGrimoire();
      if (!result.success) {
        log(result.reason, "warning");
        return;
      }
      const names = (result.rememorized || []).join(', ');
      if (result.brainBurnDamage > 0) {
        log(`BRAIN BURN! Forced ${names} into mind (-${result.cognitiveCost} Cognition, ${result.brainBurnDamage} HP). Constructs held.`, "danger");
      } else {
        log(`Memorization complete: ${names}. Cognitive burden -${result.cognitiveCost} (now ${result.currentCognition}).`, "warning");
      }
      uiController.updateHUD(true);
    } else if (actionType === 'CAST_MAGE_SPELL') {
      const res = state.castMageSpell(payload);
      if (res.success) {
        log(`Released ${res.spellName}. Construct erased; mind eases +${res.refund} (residual burn ${res.residualBurn} until rest).`, "success");
      } else {
        log(res.reason || `Spell already spent or unavailable.`, "warning");
      }
      uiController.updateHUD(true);
    } else if (actionType === 'STUDY_PRAYERS') {
      const result = state.studyClericPrayers();
      if (!result.success) {
        log(result.reason, "warning");
        return;
      }
      log(`Dawn petition answered. Prayers granted anew (${result.status || 'in communion'}).`, "success");
      uiController.updateHUD(true);
    } else if (actionType === 'CAST_CLERIC_PRAYER') {
      const res = state.castClericPrayer(payload);
      if (res.success) {
        log(`Divine invocation! ${res.spellName} — power is the deity's; the daily allotment closes for that prayer.`, "success");
      } else {
        log(res.reason || `Prayer already invoked or unavailable.`, "warning");
      }
      uiController.updateHUD(true);
    } else if (actionType === 'BASH_DOOR') {
      const target = state.getLockInFront();
      if (!target) return;
      if (checkTrapBeforeAction(target)) return;
      const fighter = state.party.find(p => p.classKey === 'fighter');
      const result = state.attemptBash(fighter);
      playSFX('sheet');
      if (result.success) {
        state.unlockTarget(target.x, target.y, target.type);
        playSFX('bash');
        log("Success! The door gives way to brute force.", "success");
      } else {
        playSFX('blocked');
        log("Bash failed. The gate holds firm.", "danger");
      }
      uiController.updateHUD();
    } else if (actionType === 'READ_MAGIC') {
      const target = state.getLockInFront();
      if (!target) return;
      if (checkTrapBeforeAction(target)) return;
      const mage = state.party.find(p => p.classKey === 'mage');
      const result = state.attemptReadMagic(mage, target);
      if (result.success) {
        state.unlockTarget(target.x, target.y, target.type);
        log("Arcane runes deciphered! The seal fades.", "success");
      } else {
        log("The arcane runes remain stubborn. Cognition drained.", "warning");
      }
      uiController.updateHUD();
    }
  }

  /** Handles opening doors or chests directly in front of the player. */
  function handleOpenObject() {
    if (isActionActive) return;
    const target = getInteractiveTargetInFront();
    if (!target) {
      log("There is nothing openable directly in front of you.", "warning");
      return;
    }
    if (checkTrapBeforeAction(target)) return;
    if (target.locked) {
      playSFX('blocked');
      log("It's locked! You need the correct tool or skill to bypass this seal.", "warning");
      return;
    }

    isActionActive = true;
    if (target.type === 'door') {
      audioManager.play('door_opening');
      log("Attempting to open heavy dungeon door...", "info");
      renderer3D.animateOpenDoor(target.x, target.y, () => {
        state.markDoorOpen(target.x, target.y);
        log("The door creaks open.", "success");
        uiController.updateHUD();
        isActionActive = false;
      });
    } else {
      audioManager.play('chest_opening');
      log("Unlocking and raising the chest lid...", "info");
      renderer3D.animateOpenChest(target.x, target.y, () => {
        const loot = state.openChest(target.x, target.y);
        if (loot) {
          const hasGold = loot.some(item => item.name === "Gold Pieces");
          if (hasGold) audioManager.play('coins');
          const desc = loot.map(i => i.amount ? `${i.amount}x ${i.name}` : i.name).join(', ');
          log(`Loot acquired: ${desc}`, "success");
        } else {
          log("This chest has already been plundered.", "warning");
        }
        uiController.updateHUD();
        isActionActive = false;
      });
    }
  }

  /** Thorn Outfitter — buy provisions into party / personal inventories. */
  function openShop() {
    if (state.combat.active) {
      log("The outfitter will not deal during a fight.", "warning");
      return;
    }
    if (!state.isNearShop()) {
      const tile = state.getShopTile();
      log(
        tile
          ? `The Thorn Outfitter keeps a stall at the chapel approach (minimap: gold tile near the entrance). Walk there to trade.`
          : `There is no outfitter nearby.`,
        "warning"
      );
      return;
    }
    const modal = document.getElementById('shop-modal');
    const list = document.getElementById('shop-list');
    const goldEl = document.getElementById('shop-gold-val');
    if (!modal || !list) return;

    const render = () => {
      if (goldEl) goldEl.textContent = state.getPartyGold();
      const entries = Object.entries(GameState.ITEM_CATALOG)
        .filter(([, def]) => def.kind !== 'currency' && def.price != null)
        .sort((a, b) => (a[1].price || 0) - (b[1].price || 0));

      list.innerHTML = entries.map(([name, def]) => {
        const owned = def.scope === 'party'
          ? state.getPartyItemQty(name)
          : (state.party.reduce((sum, h) => {
              const slot = (h.inventory || []).find(i => i.name === name);
              return sum + (slot ? (slot.amount || 1) : 0);
            }, 0));
        const scopeNote = def.scope === 'personal' ? ' → personal kit' : ' → party pack';
        return `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px; background:#0d1117; border:1px solid var(--border-iron); border-radius:3px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:bold; color:var(--gold-tsr); font-size:12px;">${name} <span style="color:var(--text-muted); font-weight:normal; font-size:10px;">${def.price} gp</span></div>
            <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${def.description || ''}${scopeNote}</div>
            <div style="font-size:10px; color:#8b949e; margin-top:2px;">Owned: ${owned}</div>
          </div>
          <button class="action-tab shop-buy-btn" data-item="${name}" style="padding:6px 10px; font-size:10px; white-space:nowrap;">Buy</button>
        </div>`;
      }).join('');

      list.querySelectorAll('.shop-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const itemName = btn.getAttribute('data-item');
          const def = state.getItemDef(itemName);
          // Personal gear defaults to thief for tools, otherwise first living hero
          let heroIdx = null;
          if (def && def.scope === 'personal') {
            if (itemName === 'Thief Tools') {
              heroIdx = state.party.findIndex(p => p.classKey === 'thief');
            } else {
              heroIdx = state.party.findIndex(p => p.hp > 0);
            }
            if (heroIdx < 0) heroIdx = 0;
          }
          const result = state.buyItem(itemName, 1, heroIdx);
          if (result.success) {
            playSFX('coins');
            const where = result.destination === 'personal'
              ? `${result.heroName}'s pack`
              : 'the party pack';
            log(`Purchased ${itemName} for ${result.total} gp → ${where}.`, "success");
            render();
            uiController.updateHUD();
          } else {
            log(result.reason || 'Purchase failed.', "warning");
          }
        });
      });
    };

    render();
    modal.style.display = 'flex';
  }

  document.getElementById('close-shop-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('shop-modal');
    if (modal) modal.style.display = 'none';
  });

  /** Manages resting and camping sequences. Interruptible by ambush. */
  function handleRestCamp() {
    if (isActionActive) return;
    if (state.combat.active) {
      log("Cannot rest while in combat.", "warning");
      return;
    }

    // Camp on the tile the party currently occupies (must be walkable)
    const cx = state.player.x;
    const cy = state.player.y;
    const map = state.spec.map;
    if (cy < 0 || cy >= map.length || cx < 0 || cx >= map[0].length) {
      log("You can't camp here.", "warning");
      return;
    }
    const tileId = map[cy][cx];
    const tileDef = state.spec.legend ? state.spec.legend[tileId] : null;
    if (tileId === 1 || (tileDef && tileDef.walkable === false)) {
      log("You can't camp here — no solid ground.", "warning");
      return;
    }

    // Must have at least one ration before starting the long rest
    const hasRations = (state.inventory || []).some(i => {
      const n = (i.name || '').toLowerCase();
      const qty = i.amount ?? i.count ?? 0;
      return (n.includes('ration') || n.includes('food')) && qty > 0;
    });
    if (!hasRations) {
      log("The party has no Rations left to camp!", "danger");
      return;
    }

    isActionActive = true;

    renderer3D.spawnCampfireModel(cx, cy);
    renderer3D.enableCampfireFlicker(true, cx, cy);

    audioManager.playLoop('crickets');
    audioManager.playLoop('campfire');

    log("The party makes camp, setting watches around the fire...", "info");

    const durationSec = state.spec.rest_duration_seconds || 12;
    const totalMs = durationSec * 1000;
    const intervalMs = 100;
    let elapsedMs = 0;
    let ambushTriggered = false;

    const campModal = document.getElementById('camp-modal');
    const progressBar = document.getElementById('camp-progress-bar');
    const timerText = document.getElementById('camp-timer-text');

    if (campModal) campModal.style.display = 'flex';
    if (progressBar) progressBar.style.width = '0%';
    if (timerText) timerText.textContent = `Watches set… ${durationSec}s remaining`;

    const cleanupCamp = () => {
      audioManager.stopLoop('crickets');
      audioManager.stopLoop('campfire');
      renderer3D.removeCampfireModel();
      renderer3D.enableCampfireFlicker(false);
      if (campModal) campModal.style.display = 'none';
      isActionActive = false;
    };

    const timerInterval = setInterval(() => {
      if (ambushTriggered) return;

      elapsedMs += intervalMs;
      const pct = Math.min(100, (elapsedMs / totalMs) * 100);
      if (progressBar) progressBar.style.width = `${pct}%`;

      const secsLeft = Math.ceil((totalMs - elapsedMs) / 1000);
      if (timerText) {
        // Mild tension text in the last third
        if (secsLeft <= Math.ceil(durationSec / 3)) {
          timerText.textContent = `Something stirs in the dark… ${secsLeft}s`;
        } else {
          timerText.textContent = `Watches set… ${secsLeft}s remaining`;
        }
      }

      if (elapsedMs >= totalMs) {
        clearInterval(timerInterval);

        // Final ambush roll at the end of the rest window
        const ambushEnc = state.checkRestAmbush();
        if (ambushEnc) {
          ambushTriggered = true;
          cleanupCamp();
          playSFX('combat_turn');
          log(`AMBUSH! Hostiles from ${ambushEnc.name} fall upon the camp before the rest is finished!`, "danger");
          log("All recovery is lost. The party scrambles for weapons.", "warning");
          combatController.triggerEncounter(ambushEnc.id);
          uiController.updateHUD();
          return;
        }

        // Clean completion
        playSFX('rested');
        cleanupCamp();

        const restResult = state.restParty();
        if (restResult.success) {
          log("The rest is complete. Camp broken down successfully.", "success");
          log(`1 Ration consumed. Remaining: ${restResult.remainingRations}`, "info");
          (restResult.recoveries || []).forEach(r => {
            if (r.hpGained > 0) {
              log(`${r.name} recovers ${r.hpGained} HP (${r.hp}/${r.maxHp}).`, "success");
            } else if (r.note) {
              log(`${r.name}: ${r.note}.`, "muted");
            }
          });
          const mage = state.party.find(h => h.classKey === 'mage');
          if (mage) log(`${mage.name}'s mind clears (cognition restored). Study Grimoire to re-prepare constructs.`, "info");
          const cleric = state.party.find(h => h.classKey === 'cleric');
          if (cleric) log(`${cleric.name} feels a quiet return of favor (+12). Petition to reopen prayers.`, "info");
        } else {
          log(restResult.reason, "danger");
        }

        uiController.updateHUD();
      }
    }, intervalMs);
  }

  // Input Controller for Movement and Camera Rotations
  // Input Controller for Movement and Camera Rotations
  new InputController((action) => {

    // 1. Prevent interactions while a cinematic action (like opening a chest) is running
    if (isActionActive) return;

    // 2. Prevent movement commands while engaged in combat
    if (state.combat.active) return;

    let updated = false;
    let didMove = false;

    if (action === 'MOVE_FORWARD') {
      updated = state.moveForward();
      didMove = updated;
    } else if (action === 'MOVE_BACKWARD') {
      updated = state.moveBackward();
      didMove = updated;
    } else if (action === 'ROTATE_LEFT') {
      state.rotate('LEFT');
      updated = true;
    } else if (action === 'ROTATE_RIGHT') {
      state.rotate('RIGHT');
      updated = true;
    }

    if (updated) {
      state.isDirty = true; // Safely flags the UI to update on the next frame only
      audioManager.play('footstep');
      camera.targetX = state.player.x;
      camera.targetY = state.player.y;
      camera.targetAngle = facingToAngle(state.player.facing);

      if (didMove) {
        const currentX = state.player.x;
        const currentY = state.player.y;

        const hint = state.checkPassiveHearNoise();
        if (hint) log(`${hint.heroName} catches a faint sound to the ${hint.direction}...`, "muted");

        if (state.spec.encounters && !state.combat.active) {
          const activeEncounter = state.spec.encounters.find(
            e => e.x === currentX && e.y === currentY && !e.completed
          );

          if (activeEncounter) {
            const thief = state.party.find(p => p.classKey === 'thief');
            if (thief && thief.isStealth) {
              const sneak = state.attemptSneakPastEncounter(activeEncounter);
              if (sneak.success) {
                log(`${thief.name} leads the party past ${sneak.encounterName} unnoticed! (${sneak.roll} vs ${sneak.chance}%)`, "success");
                uiController.updateHUD();
                return;
              }
              log(`${thief.name}'s cover is blown! (${sneak.roll} vs ${sneak.chance}%)`, "danger");
            }
            combatController.triggerEncounter(activeEncounter.id);
            return;
          }
        }

        if (state.spec.npcs) {
          const matchingNpc = Object.values(state.spec.npcs).find(n => {
            const npcState = state.getNPCState(n.id);
            return n.tile && n.tile[0] === currentX && n.tile[1] === currentY && !npcState.despawned;
          });

          if (matchingNpc) {
            dialogueController.startNPCInteraction(matchingNpc.id);
          }
        }

        // Outfitter stall arrival
        const shopTile = state.getShopTile();
        if (shopTile && shopTile[0] === currentX && shopTile[1] === currentY) {
          log("Thorn Outfitter — lantern light and the smell of oil. Press 🏪 Outfitter to trade.", "info");
        }
      }
    }
  });

  let lastFrameTime = performance.now();
  const targetFPS = 60;
  const frameInterval = 1000 / targetFPS;

  /** Main 60FPS frame render and camera interpolation loop. */
  function animationLoop(currentTime) {
    requestAnimationFrame(animationLoop);

    // Fallback if currentTime is undefined on the initial rAF tick
    if (!currentTime) return;

    // Governor: rAF fires at the display's native refresh rate (60/120/144Hz+),
    // but renderer3D.render() is expensive and was only ever tuned for ~60 calls/sec.
    // Skip ticks that arrive faster than that so we don't ask the GPU to render
    // more often than the scene was designed for.
    const elapsedSinceLastRender = currentTime - lastFrameTime;
    if (elapsedSinceLastRender < frameInterval) return;

    // 1. Calculate actual delta time in seconds (still real elapsed time,
    // not a fixed step, so the exponential smoothing below stays accurate)
    const delta = elapsedSinceLastRender / 1000;
    lastFrameTime = currentTime - (elapsedSinceLastRender % frameInterval);

    // Prevent massive interpolation jumps if the browser tab becomes inactive
    if (delta > 0.1) return;

    // 2. Framerate-independent speed (0.2 per frame at 60fps equates to exactly 12 units per second)
    const speed = 1 - Math.exp(-12 * delta);

    // Smooth Camera Interpolation
    camera.x += (camera.targetX - camera.x) * speed;
    camera.y += (camera.targetY - camera.y) * speed;
    let angleDiff = camera.targetAngle - camera.angle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    camera.angle += angleDiff * speed;

    // Render Three.js Scene
    renderer3D.render(camera);

    // Conditional Dirty Flag HUD Update (Prevents Layout Thrashing)
    if (state.isDirty) {
      uiController.updateHUD();
      state.isDirty = false;
    }
  }

  // Initial Startup Render Hooks
  uiController.initPartyDOM();
  uiController.updateHUD();

  if (adventureData.briefing) {
    log(adventureData.briefing, "info");
  }
  log("You stand on the chapel approach. The Thorn Outfitter stall is the gold tile on the minimap (west along this row). Stock up before you descend.", "info");

  requestAnimationFrame(animationLoop);
}

init();