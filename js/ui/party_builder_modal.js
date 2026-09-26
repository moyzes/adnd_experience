import { CharacterFactory } from '../engine/characters/character_factory.js';
import { SpellRegistry } from '../engine/spell_registry.js';
import { AlignmentManager } from '../engine/characters/alignment_manager.js';

/**
 * PartyBuilderUI manages the Pre-Game Character Creation & Party Assembly workflow.
 * Allows choosing the adventure module, rolling 3d6 stats, selecting races & classes,
 * configuring starting gear and spells, and assembling a 1-to-4 member custom party.
 */
export class PartyBuilderUI {
  constructor(classesData, spellsData, onBeginExpedition) {
    this.classesData = classesData;
    this.spellsData = spellsData;
    this.onBeginExpedition = onBeginExpedition;

    // Party state (starts with 4 prebuilt members)
    this.party = [];
    this.activeCreatorCharacter = null;
    this.initDefaultParty();
  }

  initDefaultParty() {
    const prebuilts = CharacterFactory.getPrebuiltCharacters(this.classesData);
    this.party = prebuilts.map(p => {
      const spells = p.chosenSpells.map(sid => SpellRegistry.getSpell(sid)).filter(Boolean);
      return CharacterFactory.createPartyMember(p.classKey, p.name, spells, this.classesData, {
        race: p.race,
        attributes: p.attributes,
        patronDeityId: p.patronDeityId || 'pelor'
      });
    });
  }

  /**
   * Initializes the DOM elements and event handlers.
   */
  init() {
    this.setupOverlay = document.getElementById('setup-screen');
    if (!this.setupOverlay) return;

    this.render();
  }

  render() {
    this.setupOverlay.innerHTML = `
      <div class="setup-container" style="width: min(900px, 95vw); max-height: 94vh; padding: 20px; display: flex; flex-direction: column; gap: 14px;">
        <div class="panel-header" style="font-size: 16px; text-align: center; margin-bottom: 0; color: var(--gold-tsr);">
          ⚔️ ADVANCED DUNGEONS & DRAGONS — EXPEDITION SETUP ⚔️
        </div>

        <!-- 1. Module Selector -->
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-chiseled); padding: 10px 14px; border-radius: 3px;">
          <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: var(--gold-tsr); margin-bottom: 6px;">
            🗺️ 1. Choose Adventure Module:
          </div>
          <div id="module-choices" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            <label class="spell-option-label" style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin: 0; height: 100%;">
              <input type="radio" name="adventure-module" value="/data/b2/b2_keep.json" checked style="margin-top: 3px;">
              <div>
                <b style="color: var(--gold-tsr); font-size: 11px;">B2: Keep on the Borderlands</b>
                <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">
                  Multi-zone realm: Fortress, wilderness & Caves of Chaos.
                </div>
              </div>
            </label>
            <label class="spell-option-label" style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin: 0; height: 100%;">
              <input type="radio" name="adventure-module" value="/data/adventure_shadows_blackstone.json" style="margin-top: 3px;">
              <div>
                <b style="color: var(--gold-tsr); font-size: 11px;">Blackstone Keep</b>
                <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">
                  Level-up mentors, moors & sunken crypts.
                </div>
              </div>
            </label>
            <label class="spell-option-label" style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin: 0; height: 100%;">
              <input type="radio" name="adventure-module" value="/data/adventure_goblin_relic.json" style="margin-top: 3px;">
              <div>
                <b style="color: var(--gold-tsr); font-size: 11px;">Greenfall Ruins</b>
                <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">
                  Wilderness shop, goblin ruins & relic recovery.
                </div>
              </div>
            </label>
            <label class="spell-option-label" style="display: flex; align-items: flex-start; gap: 8px; cursor: pointer; margin: 0; height: 100%;">
              <input type="radio" name="adventure-module" value="/data/adventure.json" style="margin-top: 3px;">
              <div>
                <b style="color: var(--gold-tsr); font-size: 11px;">Crypt of St. Orlan</b>
                <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">
                  Flooded halls, hostage rescue & dark cultists.
                </div>
              </div>
            </label>
          </div>
        </div>

        <!-- 2. Active Party Roster (1 to 4 Members) -->
        <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-chiseled); padding: 10px 14px; border-radius: 3px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: var(--gold-tsr);">
              👥 2. Adventuring Party Roster (${this.party.length}/4 Members):
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="add-custom-hero-btn" class="action-tab primary" style="padding: 4px 10px; font-size: 10px;" ${this.party.length >= 4 ? 'disabled' : ''}>
                ➕ Create New Character
              </button>
              <button id="add-prebuilt-hero-btn" class="action-tab" style="padding: 4px 10px; font-size: 10px;" ${this.party.length >= 4 ? 'disabled' : ''}>
                📋 Add Pre-Built Hero
              </button>
            </div>
          </div>

          <div id="roster-slots-container" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; min-height: 140px;">
            ${this.renderRosterCards()}
          </div>
        </div>

        <!-- 3. Character Creator Drawer / Sub-panel (Hidden unless actively creating) -->
        <div id="character-creator-panel" style="display: none; background: #0d1117; border: 2px solid var(--gold-tsr); padding: 14px; border-radius: 3px; box-shadow: 0 0 20px rgba(0,0,0,0.8);">
          <!-- Dynamic creator content rendered here -->
        </div>

        <!-- 4. Launch Expedition Button -->
        <div style="margin-top: auto; display: flex; flex-direction: column; gap: 6px;">
          <button id="begin-expedition-btn" class="action-tab primary" style="width: 100%; padding: 12px; font-size: 13px; font-weight: bold; letter-spacing: 1px;" ${this.party.length < 1 ? 'disabled' : ''}>
            🚀 BEGIN EXPEDITION (${this.party.length} HERO${this.party.length === 1 ? '' : 'ES'})
          </button>
          <div style="font-size: 10px; color: var(--text-muted); text-align: center;">
            Party size: 1 to 4 members. You can combine any mixture of classes and races.
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderRosterCards() {
    let html = '';
    for (let i = 0; i < 4; i++) {
      const hero = this.party[i];
      if (hero) {
        const classColor = hero.classKey === 'fighter' ? '#d29922' : hero.classKey === 'thief' ? '#a371f7' : hero.classKey === 'cleric' ? '#58a6ff' : '#bc8cff';
        const raceName = hero.race || (hero.raceKey ? hero.raceKey.toUpperCase() : 'HUMAN');
        const portraitUrl = hero.portrait || CharacterFactory.resolvePortrait(hero.classKey, hero.name);
        
        let spellSnippet = '';
        if (hero.classKey === 'mage' && hero.grimoire && hero.grimoire.length > 0) {
          spellSnippet = `<div style="font-size: 9px; color: var(--cognition-purple); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📖 ${hero.grimoire.map(s => s.name).join(', ')}</div>`;
        } else if (hero.classKey === 'cleric' && hero.spells && hero.spells.length > 0) {
          spellSnippet = `<div style="font-size: 9px; color: var(--favor-blue); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">✨ ${hero.spells.map(s => s.name).join(', ')}</div>`;
        }

        html += `
          <div style="background: var(--panel-slate); border: 1px solid var(--border-chiseled); border-top: 3px solid ${classColor}; padding: 8px 10px; border-radius: 2px; position: relative; display: flex; flex-direction: column;">
            <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 4px;">
              <img src="${portraitUrl}" alt="${hero.name}" style="width: 32px; height: 38px; object-fit: cover; border-radius: 2px; border: 1px solid var(--border-gold-frame); flex-shrink: 0;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'32\\' height=\\'38\\' viewBox=\\'0 0 32 38\\'><rect width=\\'32\\' height=\\'38\\' fill=\\'%2311141a\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'14\\'>👤</text></svg>';">
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <b style="color: var(--parchment-light); font-size: 11.5px; font-family: 'Cinzel', serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${hero.name}</b>
                  <button class="remove-hero-btn" data-index="${i}" style="background: transparent; border: none; color: #ff7b72; font-size: 12px; cursor: pointer; padding: 0 2px;" title="Remove Hero">✖</button>
                </div>
                <div style="font-size: 9.5px; color: ${classColor}; font-weight: bold;">
                  ${raceName} ${hero.className || hero.classKey.toUpperCase()}
                </div>
              </div>
            </div>
            <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px;">
              <span>HP: <b style="color: #3fb950;">${hero.hp}/${hero.maxHp}</b></span>
              <span>AC: <b style="color: #79c0ff;">${hero.armorClass}</b></span>
              <span>STR: ${hero.attributes.strength}</span>
              <span>DEX: ${hero.attributes.dexterity}</span>
              <span>CON: ${hero.attributes.constitution}</span>
              <span>INT: ${hero.attributes.intelligence}</span>
              <span>WIS: ${hero.attributes.wisdom}</span>
              <span>CHA: ${hero.attributes.charisma}</span>
            </div>
            <div style="font-size: 9px; color: var(--text-muted); margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 3px;">
              ⚔️ ${hero.equippedWeapon || 'Unarmed'} | 🛡️ ${hero.equippedArmor?.name || 'Unarmored'}
            </div>
            ${spellSnippet}
          </div>
        `;
      } else {
        html += `
          <div style="border: 2px dashed var(--border-iron); background: rgba(0,0,0,0.2); border-radius: 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">
            <span style="font-size: 18px; margin-bottom: 4px; opacity: 0.5;">👤</span>
            <span>Empty Slot ${i + 1}</span>
            <span style="font-size: 9px; opacity: 0.7; margin-top: 2px;">(Optional)</span>
          </div>
        `;
      }
    }
    return html;
  }

  bindEvents() {
    // Remove Hero
    this.setupOverlay.querySelectorAll('.remove-hero-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        this.party.splice(idx, 1);
        this.render();
      });
    });

    // Add Prebuilt Hero Dialog
    const addPrebuiltBtn = document.getElementById('add-prebuilt-hero-btn');
    if (addPrebuiltBtn) {
      addPrebuiltBtn.addEventListener('click', () => {
        this.openPrebuiltPicker();
      });
    }

    // Add Custom Character
    const addCustomBtn = document.getElementById('add-custom-hero-btn');
    if (addCustomBtn) {
      addCustomBtn.addEventListener('click', () => {
        this.openCharacterCreator();
      });
    }

    // Begin Expedition
    const beginBtn = document.getElementById('begin-expedition-btn');
    if (beginBtn) {
      beginBtn.addEventListener('click', () => {
        if (this.party.length < 1) {
          alert("Please add at least 1 hero to your party!");
          return;
        }

        const selectedModule = document.querySelector('input[name="adventure-module"]:checked')?.value || '/data/adventure_shadows_blackstone.json';
        this.setupOverlay.style.display = 'none';
        if (this.onBeginExpedition) {
          this.onBeginExpedition(selectedModule, this.party);
        }
      });
    }
  }

  openPrebuiltPicker() {
    const creatorPanel = document.getElementById('character-creator-panel');
    if (!creatorPanel) return;

    const prebuilts = CharacterFactory.getPrebuiltCharacters(this.classesData);

    creatorPanel.style.display = 'block';
    creatorPanel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-chiseled); padding-bottom: 6px; margin-bottom: 10px;">
        <span style="font-family: 'Cinzel', serif; font-weight: bold; color: var(--gold-tsr); font-size: 13px;">📋 SELECT A PRE-BUILT VETERAN</span>
        <button id="close-creator-btn" class="action-tab" style="padding: 2px 8px; font-size: 10px;">CANCEL</button>
      </div>

      <div style="grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 10px; display: grid;">
        ${prebuilts.map((p, idx) => {
          const isCaster = p.classKey === 'mage' || p.classKey === 'cleric';
          const spellLabel = p.classKey === 'mage' 
            ? `📖 ${CharacterFactory.getStartingMageSpellCount(p.attributes.intelligence)} Grimoire Formulas (INT ${p.attributes.intelligence})`
            : p.classKey === 'cleric'
            ? `✨ ${CharacterFactory.getClericPrayerCapacity(p.attributes.wisdom)} Prepared Prayers (WIS ${p.attributes.wisdom})`
            : null;

          return `
          <div style="background: var(--panel-slate); border: 1px solid var(--border-chiseled); padding: 10px; border-radius: 2px; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                <img src="${p.portrait || CharacterFactory.resolvePortrait(p.classKey, p.name)}" alt="${p.name}" style="width: 38px; height: 46px; object-fit: cover; border-radius: 2px; border: 1px solid var(--border-gold-frame); flex-shrink: 0;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'38\\' height=\\'46\\' viewBox=\\'0 0 38 46\\'><rect width=\\'38\\' height=\\'46\\' fill=\\'%2311141a\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'16\\'>👤</text></svg>';">
                <div style="min-width: 0;">
                  <b style="color: var(--gold-tsr); font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</b>
                  <div style="font-size: 9.5px; color: var(--parchment-light); font-weight: bold;">
                    ${p.race.toUpperCase()} ${p.classKey.toUpperCase()}
                  </div>
                  ${spellLabel ? `<div style="font-size: 8.5px; color: ${p.classKey === 'mage' ? '#d2a8ff' : '#79c0ff'}; font-weight: 600; margin-top: 1px;">${spellLabel}</div>` : ''}
                </div>
              </div>
              <div style="font-size: 9px; color: var(--text-muted); line-height: 1.3;">
                STR: ${p.attributes.strength} | DEX: ${p.attributes.dexterity}<br>
                CON: ${p.attributes.constitution} | INT: ${p.attributes.intelligence}<br>
                WIS: ${p.attributes.wisdom} | CHA: ${p.attributes.charisma}
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">
              ${isCaster ? `
                <button class="customize-prebuilt-card-btn action-tab primary" data-index="${idx}" style="padding: 4px 6px; font-size: 10px;">
                  ✨ Select Spells & Add
                </button>
                <button class="select-prebuilt-card-btn action-tab" data-index="${idx}" style="padding: 3px 6px; font-size: 9.5px; color: var(--text-muted);">
                  Quick Add (Default Spells)
                </button>
              ` : `
                <button class="select-prebuilt-card-btn action-tab primary" data-index="${idx}" style="padding: 4px 6px; font-size: 10px;">
                  Add to Party
                </button>
                <button class="customize-prebuilt-card-btn action-tab" data-index="${idx}" style="padding: 2px 6px; font-size: 9.5px; color: var(--text-muted);">
                  Customize
                </button>
              `}
            </div>
          </div>
        `}).join('')}
      </div>
    `;

    document.getElementById('close-creator-btn').addEventListener('click', () => {
      creatorPanel.style.display = 'none';
    });

    creatorPanel.querySelectorAll('.select-prebuilt-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        const p = prebuilts[idx];
        const spells = p.chosenSpells.map(sid => SpellRegistry.getSpell(sid)).filter(Boolean);
        const newHero = CharacterFactory.createPartyMember(p.classKey, p.name, spells, this.classesData, {
          race: p.race,
          portrait: p.portrait,
          attributes: p.attributes
        });
        this.party.push(newHero);
        creatorPanel.style.display = 'none';
        this.render();
      });
    });

    creatorPanel.querySelectorAll('.customize-prebuilt-card-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        const p = prebuilts[idx];
        this.openPrebuiltCustomizer(p);
      });
    });
  }

  openPrebuiltCustomizer(p) {
    const creatorPanel = document.getElementById('character-creator-panel');
    if (!creatorPanel) return;

    const wepOpts = CharacterFactory.getWeaponOptions(p.classKey);
    const armOpts = CharacterFactory.getArmorOptions(p.classKey);
    const shldOpts = CharacterFactory.getShieldOptions(p.classKey);

    this.activeCreatorCharacter = {
      name: p.name,
      baseAttributes: { ...p.attributes },
      race: p.race,
      classKey: p.classKey,
      portrait: p.portrait,
      chosenMageSpellIds: p.classKey === 'mage' ? [...p.chosenSpells] : [],
      chosenClericPrayerIds: p.classKey === 'cleric' ? [...p.chosenSpells] : [],
      patronDeityId: p.classKey === 'cleric' ? (p.patronDeityId || 'pelor') : 'pelor',
      equippedWeapon: p.classKey === 'mage' ? 'Quarterstaff' : p.classKey === 'cleric' ? 'Warhammer' : wepOpts[0]?.name || 'Longsword',
      specializedWeapon: p.classKey === 'fighter' ? 'Longsword' : null,
      equippedArmorId: p.classKey === 'mage' ? 'scholars_robes' : p.classKey === 'cleric' ? 'chain_mail' : armOpts[0]?.id || 'banded_mail',
      equippedShieldId: p.classKey === 'cleric' ? 'consecrated_shield' : 'none',
      thiefSkillPoints: p.classKey === 'thief' ? { pick_locks: 15, find_traps: 15, pick_pockets: 15, hide_in_shadows: 5, hear_noise: 10 } : null,
      validationError: null
    };

    creatorPanel.style.display = 'block';
    this.renderCreatorForm(creatorPanel);
  }

  openCharacterCreator() {
    const creatorPanel = document.getElementById('character-creator-panel');
    if (!creatorPanel) return;

    // Roll initial 3d6 in order
    const rolled = CharacterFactory.roll3d6Attributes();

    const thiefBases = CharacterFactory.getThiefBaseSkills();
    const defaultThiefPts = {};
    Object.entries(thiefBases).forEach(([k, v]) => {
      defaultThiefPts[k] = v.defaultAdded; // 15, 15, 15, 5, 10 = 60 total
    });

    this.activeCreatorCharacter = {
      name: '',
      baseAttributes: rolled,
      race: 'human',
      classKey: 'fighter',
      portrait: null,
      chosenMageSpellIds: [],
      chosenClericPrayerIds: [],
      patronDeityId: 'pelor',
      equippedWeapon: 'Longsword',
      specializedWeapon: 'Longsword',
      equippedArmorId: 'banded_mail',
      equippedShieldId: 'medium_shield',
      thiefSkillPoints: defaultThiefPts,
      validationError: null
    };

    creatorPanel.style.display = 'block';
    this.renderCreatorForm(creatorPanel);
  }

  renderCreatorForm(container) {
    const char = this.activeCreatorCharacter;
    const finalAttrs = CharacterFactory.applyRaceAdjustments(char.baseAttributes, char.race);
    const classAvail = CharacterFactory.getClassAvailability(finalAttrs, char.race);

    // If current selected class is not available, auto-switch to first available
    if (!classAvail[char.classKey]?.available) {
      const firstAvail = Object.keys(classAvail).find(k => classAvail[k].available);
      if (firstAvail) {
        char.classKey = firstAvail;
        this.syncClassDefaults(char);
      }
    }

    const availablePortraits = CharacterFactory.getAvailablePortraits();
    const currentPortrait = char.portrait || CharacterFactory.resolvePortrait(char.classKey, char.name);

    const mageSpells = SpellRegistry.getSpellsForClass('mage', 1);
    const clericPrayers = SpellRegistry.getSpellsForClass('cleric', 1);

    const allowedMageCount = CharacterFactory.getStartingMageSpellCount(finalAttrs.intelligence);
    const allowedClericCount = CharacterFactory.getClericPrayerCapacity(finalAttrs.wisdom);

    if (!Array.isArray(char.chosenMageSpellIds)) char.chosenMageSpellIds = [];
    if (!Array.isArray(char.chosenClericPrayerIds)) char.chosenClericPrayerIds = [];

    if (char.chosenMageSpellIds.length === 0 && mageSpells.length > 0) {
      char.chosenMageSpellIds = mageSpells.slice(0, allowedMageCount).map(s => s.id);
    } else if (char.chosenMageSpellIds.length > allowedMageCount) {
      char.chosenMageSpellIds = char.chosenMageSpellIds.slice(0, allowedMageCount);
    }

    if (char.chosenClericPrayerIds.length === 0 && clericPrayers.length > 0) {
      char.chosenClericPrayerIds = clericPrayers.slice(0, allowedClericCount).map(s => s.id);
    } else if (char.chosenClericPrayerIds.length > allowedClericCount) {
      char.chosenClericPrayerIds = char.chosenClericPrayerIds.slice(0, allowedClericCount);
    }

    const allDeities = AlignmentManager.getAllDeities();
    if (!char.patronDeityId) char.patronDeityId = 'pelor';
    const activeDeity = AlignmentManager.getDeity(char.patronDeityId);

    const availableWeapons = CharacterFactory.getWeaponOptions(char.classKey);
    const availableArmors = CharacterFactory.getArmorOptions(char.classKey);
    const availableShields = CharacterFactory.getShieldOptions(char.classKey);
    const fighterSpecs = CharacterFactory.getFighterSpecializations();

    // Ensure valid weapon selection
    if (!availableWeapons.some(w => w.name === char.equippedWeapon)) {
      char.equippedWeapon = availableWeapons[0]?.name || 'Longsword';
    }
    // Ensure valid armor selection
    if (!availableArmors.some(a => a.id === char.equippedArmorId)) {
      char.equippedArmorId = availableArmors[0]?.id || 'scholars_robes';
    }
    // Ensure valid shield selection
    if (availableShields.length > 0 && !availableShields.some(s => s.id === char.equippedShieldId)) {
      char.equippedShieldId = availableShields[0]?.id || 'none';
    }

    // Calculate preview AC
    const selectedArmor = availableArmors.find(a => a.id === char.equippedArmorId);
    const selectedShield = availableShields.find(s => s.id === char.equippedShieldId);
    const baseArmorAc = selectedArmor ? selectedArmor.baseAc : 10;
    const dexAcMod = finalAttrs.dexterity >= 18 ? -4 : finalAttrs.dexterity === 17 ? -3 : finalAttrs.dexterity === 16 ? -2 : finalAttrs.dexterity === 15 ? -1 : 0;
    const shieldBonus = (selectedShield && selectedShield.acBonus) ? selectedShield.acBonus : 0;
    const previewAc = baseArmorAc + dexAcMod - shieldBonus;

    // Calculate preview HP
    const hitDie = char.classKey === 'fighter' ? 10 : char.classKey === 'cleric' ? 8 : char.classKey === 'thief' ? 6 : 4;
    const conBonus = finalAttrs.constitution >= 18 ? (char.classKey === 'fighter' ? 4 : 2) :
                     finalAttrs.constitution === 17 ? (char.classKey === 'fighter' ? 3 : 2) :
                     finalAttrs.constitution === 16 ? 2 :
                     finalAttrs.constitution === 15 ? 1 : 0;
    const previewHp = Math.max(1, hitDie + conBonus);

    // Calculate Thief Points
    const thiefBases = CharacterFactory.getThiefBaseSkills();
    const thiefPtsTotalSpent = Object.values(char.thiefSkillPoints).reduce((sum, v) => sum + (v || 0), 0);
    const thiefPtsRemaining = 60 - thiefPtsTotalSpent;

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-chiseled); padding-bottom: 6px; margin-bottom: 12px;">
        <span style="font-family: 'Cinzel', serif; font-weight: bold; color: var(--gold-tsr); font-size: 13px;">
          🎲 CHARACTER CREATION (3d6 CLASSIC ROLLS & CUSTOM GEAR)
        </span>
        <button id="cancel-custom-btn" class="action-tab" style="padding: 2px 8px; font-size: 10px;">CANCEL</button>
      </div>

      ${char.validationError ? `
        <div style="background: rgba(218, 54, 51, 0.15); border: 1px solid #da3633; color: #ff7b72; padding: 6px 10px; border-radius: 2px; font-size: 11px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> <span>${char.validationError}</span>
        </div>
      ` : ''}

      <div style="display: grid; grid-template-columns: 1fr 1.25fr; gap: 14px;">
        <!-- Left Column: Name, Portrait, Attributes, Race, Class -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div style="position: relative; flex-shrink: 0; width: 56px; height: 68px; border: 2px solid var(--border-gold-frame); border-radius: 2px; overflow: hidden; background: #000; box-shadow: 0 0 6px rgba(0,0,0,0.8);">
              <img src="${currentPortrait}" alt="Portrait" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'56\\' height=\\'68\\' viewBox=\\'0 0 56 68\\'><rect width=\\'56\\' height=\\'68\\' fill=\\'%2311141a\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'20\\'>👤</text></svg>';">
            </div>
            <div style="flex: 1; min-width: 0;">
              <label style="font-size: 10.5px; color: var(--gold-tsr); font-weight: bold; display: block; margin-bottom: 3px;">CHARACTER NAME:</label>
              <input type="text" id="custom-char-name" value="${char.name}" placeholder="e.g. Douglas the Brave" style="width: 100%; background: #000; border: 1px solid var(--border-iron); color: var(--parchment-light); padding: 5px 8px; font-size: 11px; border-radius: 2px; margin-bottom: 6px;">
              <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 3px;">Choose Portrait:</div>
              <div style="display: flex; gap: 5px;">
                ${availablePortraits.map(p => `
                  <div class="creator-portrait-opt" data-file="${p.file}" style="cursor: pointer; width: 28px; height: 34px; border: 2px solid ${currentPortrait === p.file ? 'var(--gold-tsr)' : 'var(--border-iron)'}; border-radius: 2px; overflow: hidden; background: #000;" title="${p.name}">
                    <img src="${p.file}" alt="${p.name}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-iron); padding: 8px 10px; border-radius: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 11px; font-weight: bold; color: var(--parchment-light);">Ability Scores (3d6 in order):</span>
              <button id="reroll-3d6-btn" class="action-tab" style="padding: 2px 6px; font-size: 9.5px;">🎲 Reroll 3d6</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; font-size: 10.5px;">
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">STR:</span> <b>${finalAttrs.strength}</b>
              </div>
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">DEX:</span> <b>${finalAttrs.dexterity}</b> ${char.race === 'elf' ? '<span style="color:#3fb950;">(+1)</span>' : ''}
              </div>
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">CON:</span> <b>${finalAttrs.constitution}</b> ${char.race === 'elf' ? '<span style="color:#ff7b72;">(-1)</span>' : char.race === 'dwarf' ? '<span style="color:#3fb950;">(+1)</span>' : ''}
              </div>
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">INT:</span> <b>${finalAttrs.intelligence}</b>
              </div>
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">WIS:</span> <b>${finalAttrs.wisdom}</b>
              </div>
              <div style="background: var(--panel-inset); padding: 4px 6px; border-radius: 2px; border: 1px solid rgba(255,255,255,0.05);">
                <span style="color: var(--text-muted);">CHA:</span> <b>${finalAttrs.charisma}</b> ${char.race === 'dwarf' ? '<span style="color:#ff7b72;">(-1)</span>' : ''}
              </div>
            </div>
          </div>

          <!-- Race Selection -->
          <div>
            <label style="font-size: 10.5px; color: var(--gold-tsr); font-weight: bold; display: block; margin-bottom: 3px;">CHOOSE RACE:</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <label class="spell-option-label" style="margin: 0; padding: 6px; font-size: 10px; cursor: pointer; ${char.race === 'human' ? 'border-color: var(--gold-tsr); background: rgba(210,153,34,0.1);' : ''}">
                <input type="radio" name="char-race" value="human" ${char.race === 'human' ? 'checked' : ''}>
                <span><b>Human</b> (All classes)</span>
              </label>
              <label class="spell-option-label" style="margin: 0; padding: 6px; font-size: 10px; cursor: pointer; ${char.race === 'elf' ? 'border-color: var(--gold-tsr); background: rgba(210,153,34,0.1);' : ''}">
                <input type="radio" name="char-race" value="elf" ${char.race === 'elf' ? 'checked' : ''}>
                <span><b>Elf</b> (+1 DEX, -1 CON)</span>
              </label>
              <label class="spell-option-label" style="margin: 0; padding: 6px; font-size: 10px; cursor: pointer; ${char.race === 'dwarf' ? 'border-color: var(--gold-tsr); background: rgba(210,153,34,0.1);' : ''}">
                <input type="radio" name="char-race" value="dwarf" ${char.race === 'dwarf' ? 'checked' : ''}>
                <span><b>Dwarf</b> (+1 CON, -1 CHA)</span>
              </label>
            </div>
          </div>

          <!-- Class Selection -->
          <div>
            <label style="font-size: 10.5px; color: var(--gold-tsr); font-weight: bold; display: block; margin-bottom: 3px;">CHOOSE CLASS (Requires minimum ability):</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
              <!-- Fighter -->
              <label class="spell-option-label" style="margin: 0; padding: 6px 8px; font-size: 10px; cursor: ${classAvail.fighter.available ? 'pointer' : 'not-allowed'}; opacity: ${classAvail.fighter.available ? '1' : '0.4'}; ${char.classKey === 'fighter' ? 'border-color: #d29922; background: rgba(210,153,34,0.15);' : ''}">
                <input type="radio" name="char-class" value="fighter" ${char.classKey === 'fighter' ? 'checked' : ''} ${classAvail.fighter.available ? '' : 'disabled'}>
                <div>
                  <b style="color: #d29922;">Fighter</b>
                  <div style="font-size: 8.5px; color: var(--text-muted);">${classAvail.fighter.available ? 'Specialization, heavy armor' : classAvail.fighter.reason}</div>
                </div>
              </label>

              <!-- Thief -->
              <label class="spell-option-label" style="margin: 0; padding: 6px 8px; font-size: 10px; cursor: ${classAvail.thief.available ? 'pointer' : 'not-allowed'}; opacity: ${classAvail.thief.available ? '1' : '0.4'}; ${char.classKey === 'thief' ? 'border-color: #a371f7; background: rgba(163,113,247,0.15);' : ''}">
                <input type="radio" name="char-class" value="thief" ${char.classKey === 'thief' ? 'checked' : ''} ${classAvail.thief.available ? '' : 'disabled'}>
                <div>
                  <b style="color: #a371f7;">Thief</b>
                  <div style="font-size: 8.5px; color: var(--text-muted);">${classAvail.thief.available ? '60 Skill points, backstab' : classAvail.thief.reason}</div>
                </div>
              </label>

              <!-- Cleric -->
              <label class="spell-option-label" style="margin: 0; padding: 6px 8px; font-size: 10px; cursor: ${classAvail.cleric.available ? 'pointer' : 'not-allowed'}; opacity: ${classAvail.cleric.available ? '1' : '0.4'}; ${char.classKey === 'cleric' ? 'border-color: #58a6ff; background: rgba(88,166,255,0.15);' : ''}">
                <input type="radio" name="char-class" value="cleric" ${char.classKey === 'cleric' ? 'checked' : ''} ${classAvail.cleric.available ? '' : 'disabled'}>
                <div>
                  <b style="color: #58a6ff;">Cleric</b>
                  <div style="font-size: 8.5px; color: var(--text-muted);">${classAvail.cleric.available ? 'Prayers, shields, healing' : classAvail.cleric.reason}</div>
                </div>
              </label>

              <!-- Mage -->
              <label class="spell-option-label" style="margin: 0; padding: 6px 8px; font-size: 10px; cursor: ${classAvail.mage.available ? 'pointer' : 'not-allowed'}; opacity: ${classAvail.mage.available ? '1' : '0.4'}; ${char.classKey === 'mage' ? 'border-color: #bc8cff; background: rgba(188,140,255,0.15);' : ''}">
                <input type="radio" name="char-class" value="mage" ${char.classKey === 'mage' ? 'checked' : ''} ${classAvail.mage.available ? '' : 'disabled'}>
                <div>
                  <b style="color: #bc8cff;">Mage</b>
                  <div style="font-size: 8.5px; color: var(--text-muted);">${classAvail.mage.available ? 'Grimoire & spells' : classAvail.mage.reason}</div>
                </div>
              </label>
            </div>
          </div>

          <!-- Quick Preview Badge -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-steel); padding: 6px 10px; border-radius: 2px; font-size: 10px; display: flex; justify-content: space-between; color: var(--text-muted);">
            <span>Max HP: <b style="color: #3fb950;">${previewHp}</b></span>
            <span>Est. Armor Class: <b style="color: #79c0ff;">AC ${previewAc}</b></span>
            <span>THAC0 Bonus: <b style="color: var(--gold-tsr);">+${char.classKey === 'fighter' ? 2 : 1}</b></span>
          </div>
        </div>

        <!-- Right Column: Weapons, Armor, Shields, Fighter Specialization, Thief Skill Points, Spells -->
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 440px; overflow-y: auto; padding-right: 4px;">
          
          <!-- Fighter Weapon Proficiency & Specialization -->
          ${char.classKey === 'fighter' ? `
            <div style="background: rgba(210,153,34,0.08); border: 1px solid rgba(210,153,34,0.3); padding: 8px 10px; border-radius: 2px;">
              <label style="font-size: 10.5px; color: var(--gold-tsr); font-weight: bold; display: block; margin-bottom: 3px;">
                ⚔️ FIGHTER WEAPON SPECIALIZATION (AD&D 2e Mastery):
              </label>
              <select id="custom-char-fighter-spec" style="width: 100%; background: #000; border: 1px solid var(--border-iron); color: var(--gold-tsr); padding: 5px; font-size: 11px; border-radius: 2px; font-weight: bold;">
                ${fighterSpecs.map(fs => `
                  <option value="${fs.name}" ${char.specializedWeapon === fs.name ? 'selected' : ''}>
                    ${fs.name} — ${fs.desc}
                  </option>
                `).join('')}
              </select>
              <div style="font-size: 9px; color: #3fb950; margin-top: 3px;">
                ✓ Grants canonical +1 To-Hit and +2 Damage bonus whenever wielding this weapon.
              </div>
            </div>
          ` : ''}

          <!-- Starting Gear & Weapons Customization -->
          <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border-steel); padding: 8px 10px; border-radius: 2px;">
            <div style="font-size: 10.5px; color: var(--parchment-light); font-weight: bold; margin-bottom: 6px;">
              🛡️ STARTING WEAPON & ARMOR LOADOUT:
            </div>

            <!-- Primary Weapon Selection -->
            <div style="margin-bottom: 6px;">
              <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 2px;">Primary Weapon:</label>
              <select id="custom-char-weapon-select" style="width: 100%; background: #000; border: 1px solid var(--border-iron); color: var(--parchment-light); padding: 4px; font-size: 10.5px; border-radius: 2px;">
                ${availableWeapons.map(w => `
                  <option value="${w.name}" ${char.equippedWeapon === w.name ? 'selected' : ''}>
                    ${w.name} (${w.damage}) — ${w.desc}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Armor Selection -->
            <div style="margin-bottom: 6px;">
              <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 2px;">Equipped Armor:</label>
              <select id="custom-char-armor-select" style="width: 100%; background: #000; border: 1px solid var(--border-iron); color: var(--parchment-light); padding: 4px; font-size: 10.5px; border-radius: 2px;">
                ${availableArmors.map(a => `
                  <option value="${a.id}" ${char.equippedArmorId === a.id ? 'selected' : ''}>
                    ${a.name} — ${a.desc}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- Shield Selection (If available) -->
            ${availableShields.length > 0 ? `
              <div>
                <label style="font-size: 10px; color: var(--text-muted); display: block; margin-bottom: 2px;">Equipped Shield:</label>
                <select id="custom-char-shield-select" style="width: 100%; background: #000; border: 1px solid var(--border-iron); color: var(--parchment-light); padding: 4px; font-size: 10.5px; border-radius: 2px;">
                  ${availableShields.map(s => `
                    <option value="${s.id}" ${char.equippedShieldId === s.id ? 'selected' : ''}>
                      ${s.name} — ${s.desc}
                    </option>
                  `).join('')}
                </select>
              </div>
            ` : `
              <div style="font-size: 9px; color: var(--text-muted); font-style: italic;">
                * Shields are not permitted for ${char.classKey === 'thief' ? 'Thieves (encumbers stealth & climbing)' : 'Mages (encumbers somatic gestures)'}.
              </div>
            `}
          </div>

          <!-- Thief 60 Discretionary Points Allocation -->
          ${char.classKey === 'thief' ? `
            <div style="background: rgba(163,113,247,0.08); border: 1px solid rgba(163,113,247,0.3); padding: 8px 10px; border-radius: 2px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span style="font-size: 10.5px; color: #a371f7; font-weight: bold;">
                  🗡️ ROGUE DISCRETIONARY SKILL POINTS:
                </span>
                <span style="font-size: 10.5px; font-weight: bold; color: ${thiefPtsRemaining === 0 ? '#3fb950' : thiefPtsRemaining > 0 ? '#d29922' : '#ff7b72'};">
                  Points Remaining: ${thiefPtsRemaining} / 60 ${thiefPtsRemaining === 0 ? '✓' : ''}
                </span>
              </div>
              <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 6px;">
                Distribute 60 points at 1st level (max +30% added to any single skill).
              </div>

              <div style="display: flex; flex-direction: column; gap: 4px;">
                ${Object.entries(thiefBases).map(([sKey, sDef]) => {
                  const added = char.thiefSkillPoints[sKey] || 0;
                  const dex = finalAttrs.dexterity;
                  let dexMod = 0;
                  if (sKey === 'pick_locks') dexMod = dex >= 18 ? 15 : dex === 17 ? 10 : dex === 16 ? 5 : dex <= 9 ? -10 : 0;
                  if (sKey === 'find_traps') dexMod = dex >= 18 ? 10 : dex === 17 ? 5 : dex <= 9 ? -10 : 0;
                  if (sKey === 'pick_pockets') dexMod = dex >= 18 ? 10 : dex === 17 ? 5 : dex <= 8 ? -15 : 0;
                  if (sKey === 'hide_in_shadows') dexMod = dex >= 18 ? 10 : dex === 17 ? 5 : dex <= 9 ? -10 : 0;

                  const finalChance = Math.max(1, Math.min(99, sDef.rawBase + added + dexMod));

                  return `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 2px; font-size: 10px;">
                      <div style="flex: 1.2;">
                        <b style="color: var(--parchment-light);">${sDef.name}</b>
                        <span style="font-size: 8.5px; color: var(--text-muted); margin-left: 4px;">(Base: ${sDef.rawBase}%)</span>
                      </div>

                      <div style="display: flex; align-items: center; gap: 3px;">
                        <button class="thief-point-btn action-tab" data-skill="${sKey}" data-delta="-5" style="padding: 1px 4px; font-size: 8.5px;" ${added <= 0 ? 'disabled' : ''}>-5</button>
                        <button class="thief-point-btn action-tab" data-skill="${sKey}" data-delta="-1" style="padding: 1px 5px; font-size: 9px;" ${added <= 0 ? 'disabled' : ''}>-</button>
                        <span style="min-width: 32px; text-align: center; font-weight: bold; color: #a371f7;">+${added}%</span>
                        <button class="thief-point-btn action-tab" data-skill="${sKey}" data-delta="1" style="padding: 1px 5px; font-size: 9px;" ${(thiefPtsRemaining <= 0 || added >= 30) ? 'disabled' : ''}>+</button>
                        <button class="thief-point-btn action-tab" data-skill="${sKey}" data-delta="5" style="padding: 1px 4px; font-size: 8.5px;" ${(thiefPtsRemaining <= 0 || added >= 30) ? 'disabled' : ''}>+5</button>
                      </div>

                      <div style="min-width: 60px; text-align: right; font-weight: bold; color: ${finalChance >= 30 ? '#3fb950' : '#d29922'};">
                        = ${finalChance}%
                        ${dexMod !== 0 ? `<span style="font-size: 8px; color: ${dexMod > 0 ? '#3fb950' : '#ff7b72'};">(${dexMod > 0 ? '+' : ''}${dexMod} DEX)</span>` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>

              <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                <button id="reset-thief-points-btn" class="action-tab" style="padding: 2px 8px; font-size: 9px;">
                  ↺ Reset to Standard Spread
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Spell / Prayer Picker (Mage or Cleric) -->
          ${char.classKey === 'mage' ? `
            <div style="background: rgba(188,140,255,0.08); border: 1px solid rgba(188,140,255,0.3); padding: 8px 10px; border-radius: 2px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 10.5px; color: var(--cognition-purple); font-weight: bold; margin: 0;">📖 GRIMOIRE TRANSCRIPTIONS (INT ${finalAttrs.intelligence}):</label>
                <span style="font-size: 10px; font-weight: bold; color: ${char.chosenMageSpellIds.length === allowedMageCount ? '#3fb950' : '#d29922'};">
                  ${char.chosenMageSpellIds.length} / ${allowedMageCount} Formulas Known
                </span>
              </div>
              <div style="font-size: 8.5px; color: var(--text-muted); margin-bottom: 6px;">
                AD&D 2e Grimoire Rule: Intelligence scales known formulas (INT 9-12: 2, 13-15: 3, 16-17: 4, 18: 5).
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; padding-right: 2px;">
                ${mageSpells.map(s => {
                  const isChecked = char.chosenMageSpellIds.includes(s.id);
                  return `
                    <label class="spell-choice-toggle" style="display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px; background: ${isChecked ? 'rgba(188,140,255,0.18)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${isChecked ? 'var(--cognition-purple)' : 'var(--border-steel)'}; border-radius: 2px; cursor: pointer; font-size: 9.5px;">
                      <input type="checkbox" class="mage-spell-cb" data-id="${s.id}" ${isChecked ? 'checked' : ''} style="margin-top: 2px;">
                      <div style="flex: 1; min-width: 0;">
                        <b style="color: ${isChecked ? '#fff' : 'var(--parchment-light)'};">${s.name}</b>
                        <span style="font-size: 8px; color: var(--text-muted); margin-left: 4px;">(Load: ${s.cognitive_load})</span>
                        <div style="font-size: 8px; color: var(--text-muted);">${s.description}</div>
                      </div>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          ` : char.classKey === 'cleric' ? `
            <!-- Cleric Patron Deity & Ethos Selection -->
            <div style="background: rgba(210,153,34,0.08); border: 1px solid rgba(210,153,34,0.35); padding: 8px 10px; border-radius: 3px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 10.5px; color: var(--gold-tsr); font-weight: bold; margin: 0;">☀️ PATRON DEITY & SACRED ETHOS:</label>
                <span style="font-size: 9px; color: #e6edf3; background: #21262d; padding: 1px 6px; border-radius: 2px;">Ethos Concordance Required</span>
              </div>
              <div style="font-size: 8.5px; color: var(--text-muted); margin-bottom: 6px;">
                Clerics pledge their devotion to a specific god. Actions drifting from this ethos drain Divine Favor toward Absolute Silence.
              </div>

              <!-- 3 Deity Cards -->
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 6px;">
                ${allDeities.map(d => {
                  const isSel = char.patronDeityId === d.id;
                  return `
                    <div class="deity-option-card ${isSel ? 'selected' : ''}" data-deity="${d.id}" style="cursor: pointer; padding: 6px 4px; border: 1px solid ${isSel ? 'var(--gold-tsr)' : 'var(--border-iron)'}; background: ${isSel ? 'rgba(210,153,34,0.22)' : 'rgba(0,0,0,0.3)'}; border-radius: 3px; text-align: center; transition: all 0.15s ease;">
                      <div style="font-size: 16px; margin-bottom: 2px;">${d.symbol}</div>
                      <div style="font-weight: bold; font-size: 10px; color: ${isSel ? 'var(--gold-tsr)' : 'var(--parchment-light)'};">${d.name}</div>
                      <div style="font-size: 8px; color: ${isSel ? '#e6edf3' : 'var(--text-muted)'}; margin-top: 1px;">${d.alignment}</div>
                    </div>
                  `;
                }).join('')}
              </div>

              <!-- Active Deity Detail & Tenets -->
              ${activeDeity ? `
                <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-iron); border-radius: 3px; padding: 6px 8px; font-size: 9px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #30363d; padding-bottom: 4px; margin-bottom: 4px;">
                    <div>
                      <b style="color: var(--gold-tsr); font-size: 9.5px;">${activeDeity.symbol} ${activeDeity.name} (${activeDeity.title})</b>
                      <span style="color: var(--text-muted); font-size: 8.5px; margin-left: 4px;">[${activeDeity.alignment}]</span>
                    </div>
                  </div>
                  <div style="color: #8b949e; font-size: 8px; margin-bottom: 4px;">
                    <b>Portfolio:</b> ${activeDeity.portfolio}
                  </div>
                  <div style="font-weight: bold; color: var(--parchment-light); font-size: 8.5px; margin-bottom: 2px;">Sacred Ethos Tenets:</div>
                  <div style="display: flex; flex-direction: column; gap: 3px; max-height: 85px; overflow-y: auto;">
                    ${activeDeity.ethos.map(t => `
                      <div style="background: rgba(255,255,255,0.03); border-left: 2px solid ${char.patronDeityId === 'lolth' ? '#da3633' : 'var(--gold-tsr)'}; padding: 2px 5px; border-radius: 0 2px 2px 0;">
                        <b style="color: #e6edf3; font-size: 8.5px;">${t.title}:</b>
                        <span style="color: #8b949e; font-size: 8px;"> ${t.description}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>

            <div style="background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.3); padding: 8px 10px; border-radius: 2px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <label style="font-size: 10.5px; color: var(--favor-blue); font-weight: bold; margin: 0;">✨ DIVINE COMMUNION (WIS ${finalAttrs.wisdom}):</label>
                <span style="font-size: 10px; font-weight: bold; color: ${char.chosenClericPrayerIds.length === allowedClericCount ? '#3fb950' : '#d29922'};">
                  ${char.chosenClericPrayerIds.length} / ${allowedClericCount} Prepared at Once
                </span>
              </div>
              <div style="font-size: 8.5px; color: var(--text-muted); margin-bottom: 6px;">
                AD&D 2e Priest Rule: Open access to all 1st-level divine prayers. Wisdom sets simultaneous preparation capacity (WIS ≤12: 1, 13-15: 2, 16-17: 3, 18: 4).
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto; padding-right: 2px;">
                ${clericPrayers.map(s => {
                  const isChecked = char.chosenClericPrayerIds.includes(s.id);
                  return `
                    <label class="spell-choice-toggle" style="display: flex; align-items: flex-start; gap: 6px; padding: 4px 6px; background: ${isChecked ? 'rgba(88,166,255,0.18)' : 'rgba(0,0,0,0.3)'}; border: 1px solid ${isChecked ? 'var(--favor-blue)' : 'var(--border-steel)'}; border-radius: 2px; cursor: pointer; font-size: 9.5px;">
                      <input type="checkbox" class="cleric-prayer-cb" data-id="${s.id}" ${isChecked ? 'checked' : ''} style="margin-top: 2px;">
                      <div style="flex: 1; min-width: 0;">
                        <b style="color: ${isChecked ? '#fff' : 'var(--parchment-light)'};">${s.name}</b>
                        <div style="font-size: 8px; color: var(--text-muted);">${s.description}</div>
                      </div>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Save Character Button -->
          <button id="save-custom-char-btn" class="action-tab primary" style="margin-top: auto; padding: 9px; font-size: 11px; font-weight: bold;">
            ✅ ADD HERO TO PARTY ROSTER
          </button>
        </div>
      </div>
    `;

    this.bindCreatorEvents(container);
  }

  syncClassDefaults(char) {
    const wepOpts = CharacterFactory.getWeaponOptions(char.classKey);
    const armOpts = CharacterFactory.getArmorOptions(char.classKey);
    const shldOpts = CharacterFactory.getShieldOptions(char.classKey);

    char.equippedWeapon = wepOpts[0]?.name || 'Longsword';
    char.equippedArmorId = armOpts[0]?.id || 'scholars_robes';
    char.equippedShieldId = shldOpts[0]?.id || 'none';

    if (char.classKey === 'fighter') {
      char.specializedWeapon = char.equippedWeapon || 'Longsword';
    } else {
      char.specializedWeapon = null;
    }

    const finalAttrs = CharacterFactory.applyRaceAdjustments(char.baseAttributes, char.race);
    if (char.classKey === 'mage') {
      const allowedCount = CharacterFactory.getStartingMageSpellCount(finalAttrs.intelligence);
      const mageSpells = SpellRegistry.getSpellsForClass('mage', 1);
      char.chosenMageSpellIds = mageSpells.slice(0, allowedCount).map(s => s.id);
    } else if (char.classKey === 'cleric') {
      const allowedCap = CharacterFactory.getClericPrayerCapacity(finalAttrs.wisdom);
      const clericPrayers = SpellRegistry.getSpellsForClass('cleric', 1);
      char.chosenClericPrayerIds = clericPrayers.slice(0, allowedCap).map(s => s.id);
    }
    char.validationError = null;
  }

  bindCreatorEvents(container) {
    const char = this.activeCreatorCharacter;
    const finalAttrs = CharacterFactory.applyRaceAdjustments(char.baseAttributes, char.race);

    // Name input tracking
    const nameInput = document.getElementById('custom-char-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        char.name = e.target.value;
      });
    }

    // Portrait selector options
    container.querySelectorAll('.creator-portrait-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        char.portrait = opt.getAttribute('data-file');
        this.renderCreatorForm(container);
      });
    });

    // Reroll 3d6 button
    const rerollBtn = document.getElementById('reroll-3d6-btn');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => {
        char.baseAttributes = CharacterFactory.roll3d6Attributes();
        char.validationError = null;
        this.syncClassDefaults(char);
        this.renderCreatorForm(container);
      });
    }

    // Race selection
    container.querySelectorAll('input[name="char-race"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        char.race = e.target.value;
        char.validationError = null;
        this.syncClassDefaults(char);
        this.renderCreatorForm(container);
      });
    });

    // Class selection
    container.querySelectorAll('input[name="char-class"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        char.classKey = e.target.value;
        this.syncClassDefaults(char);
        this.renderCreatorForm(container);
      });
    });

    // Fighter specialization selector
    const fighterSpecSelect = document.getElementById('custom-char-fighter-spec');
    if (fighterSpecSelect) {
      fighterSpecSelect.addEventListener('change', (e) => {
        char.specializedWeapon = e.target.value;
        char.equippedWeapon = e.target.value;
        this.renderCreatorForm(container);
      });
    }

    // Weapon selector
    const weaponSelect = document.getElementById('custom-char-weapon-select');
    if (weaponSelect) {
      weaponSelect.addEventListener('change', (e) => {
        char.equippedWeapon = e.target.value;
        this.renderCreatorForm(container);
      });
    }

    // Armor selector
    const armorSelect = document.getElementById('custom-char-armor-select');
    if (armorSelect) {
      armorSelect.addEventListener('change', (e) => {
        char.equippedArmorId = e.target.value;
        this.renderCreatorForm(container);
      });
    }

    // Shield selector
    const shieldSelect = document.getElementById('custom-char-shield-select');
    if (shieldSelect) {
      shieldSelect.addEventListener('change', (e) => {
        char.equippedShieldId = e.target.value;
        this.renderCreatorForm(container);
      });
    }

    // Thief discretionary skill point buttons
    container.querySelectorAll('.thief-point-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skillKey = e.currentTarget.getAttribute('data-skill');
        const delta = parseInt(e.currentTarget.getAttribute('data-delta'), 10) || 0;
        const current = char.thiefSkillPoints[skillKey] || 0;
        const spent = Object.values(char.thiefSkillPoints).reduce((sum, v) => sum + (v || 0), 0);
        const remaining = 60 - spent;

        if (delta > 0) {
          const step = Math.min(delta, remaining, 30 - current);
          if (step > 0) {
            char.thiefSkillPoints[skillKey] = current + step;
          }
        } else if (delta < 0) {
          const step = Math.min(Math.abs(delta), current);
          if (step > 0) {
            char.thiefSkillPoints[skillKey] = current - step;
          }
        }
        char.validationError = null;
        this.renderCreatorForm(container);
      });
    });

    // Reset Thief Points
    const resetThiefBtn = document.getElementById('reset-thief-points-btn');
    if (resetThiefBtn) {
      resetThiefBtn.addEventListener('click', () => {
        const thiefBases = CharacterFactory.getThiefBaseSkills();
        Object.entries(thiefBases).forEach(([k, v]) => {
          char.thiefSkillPoints[k] = v.defaultAdded;
        });
        char.validationError = null;
        this.renderCreatorForm(container);
      });
    }

    // Mage spell selection checkboxes
    container.querySelectorAll('.mage-spell-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const sid = e.target.getAttribute('data-id');
        const allowedCount = CharacterFactory.getStartingMageSpellCount(finalAttrs.intelligence);
        if (e.target.checked) {
          if (!char.chosenMageSpellIds.includes(sid)) {
            if (char.chosenMageSpellIds.length >= allowedCount) {
              char.chosenMageSpellIds.shift();
            }
            char.chosenMageSpellIds.push(sid);
          }
        } else {
          char.chosenMageSpellIds = char.chosenMageSpellIds.filter(id => id !== sid);
        }
        this.renderCreatorForm(container);
      });
    });

    // Cleric prayer selection checkboxes
    container.querySelectorAll('.cleric-prayer-cb').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const sid = e.target.getAttribute('data-id');
        const allowedCap = CharacterFactory.getClericPrayerCapacity(finalAttrs.wisdom);
        if (e.target.checked) {
          if (!char.chosenClericPrayerIds.includes(sid)) {
            if (char.chosenClericPrayerIds.length >= allowedCap) {
              char.chosenClericPrayerIds.shift();
            }
            char.chosenClericPrayerIds.push(sid);
          }
        } else {
          char.chosenClericPrayerIds = char.chosenClericPrayerIds.filter(id => id !== sid);
        }
        this.renderCreatorForm(container);
      });
    });

    // Cleric deity option selection
    container.querySelectorAll('.deity-option-card').forEach(card => {
      card.addEventListener('click', () => {
        const deityId = card.getAttribute('data-deity');
        if (deityId && char.patronDeityId !== deityId) {
          char.patronDeityId = deityId;
          this.renderCreatorForm(container);
        }
      });
    });

    // Cancel
    const cancelBtn = document.getElementById('cancel-custom-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        container.style.display = 'none';
      });
    }

    // Save Character
    const saveBtn = document.getElementById('save-custom-char-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        // Validate Thief Points
        if (char.classKey === 'thief') {
          const spent = Object.values(char.thiefSkillPoints).reduce((sum, v) => sum + (v || 0), 0);
          const remaining = 60 - spent;
          if (remaining !== 0) {
            char.validationError = `Please distribute all 60 rogue skill points! (${remaining > 0 ? remaining + ' unallocated' : Math.abs(remaining) + ' overspent'})`;
            this.renderCreatorForm(container);
            return;
          }
          const overCapped = Object.entries(char.thiefSkillPoints).find(([k, v]) => v > 30);
          if (overCapped) {
            char.validationError = `No more than 30 points can be added to any single skill during creation.`;
            this.renderCreatorForm(container);
            return;
          }
        }

        const heroAttrs = CharacterFactory.applyRaceAdjustments(char.baseAttributes, char.race);
        const heroName = (char.name || '').trim() || `${char.race.charAt(0).toUpperCase() + char.race.slice(1)} ${char.classKey.charAt(0).toUpperCase() + char.classKey.slice(1)}`;

        let chosenSpells = [];
        if (char.classKey === 'mage') {
          chosenSpells = (char.chosenMageSpellIds || []).map(id => SpellRegistry.getSpell(id)).filter(Boolean);
        } else if (char.classKey === 'cleric') {
          chosenSpells = (char.chosenClericPrayerIds || []).map(id => SpellRegistry.getSpell(id)).filter(Boolean);
        }

        const newHero = CharacterFactory.createPartyMember(char.classKey, heroName, chosenSpells, this.classesData, {
          race: char.race,
          portrait: char.portrait,
          attributes: heroAttrs,
          equippedWeapon: char.equippedWeapon,
          specializedWeapon: char.specializedWeapon,
          equippedArmor: char.equippedArmorId,
          equippedShield: char.equippedShieldId,
          thiefSkillPoints: char.classKey === 'thief' ? { ...char.thiefSkillPoints } : null,
          patronDeityId: char.classKey === 'cleric' ? (char.patronDeityId || 'pelor') : null
        });

        this.party.push(newHero);
        container.style.display = 'none';
        this.render();
      });
    }
  }
}
