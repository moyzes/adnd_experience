import { GameState } from './state.js';
import { CharacterFactory } from './characters/character_factory.js';
import { AlignmentManager } from './characters/alignment_manager.js';

export class CharacterSheetUI {
  constructor(state, context) {
    this.state = state;
    this.context = context; // { playSFX, log, updateHUD, onUIAction }
    
    // Cache DOM references
    this.modal = document.getElementById('char-sheet-modal');
    this.titleEl = document.getElementById('sheet-char-title');
    this.contentEl = document.getElementById('sheet-content');
  }

  open(heroName) {
    this.context.playSFX('sheet');
    const heroIndex = this.state.party.findIndex(p => p && p.name === heroName);
    if (heroIndex === -1) return;
    const hero = this.state.party[heroIndex];
    this.currentHeroIndex = heroIndex;

    const raceLabel = hero.race ? `${hero.race.toUpperCase()} ` : '';
    this.titleEl.textContent = `${(hero.name || 'Hero').toUpperCase()} — LEVEL ${hero.level || 1} ${raceLabel}${(hero.className || 'Adventurer').toUpperCase()}`;

    // Character Portrait Resolution
    const portraitUrl = CharacterFactory.resolvePortrait(hero.classKey, hero.name, hero.portrait);
    const portraitGallery = CharacterFactory.getAvailablePortraits();

    // Emergent Alignment Resolution
    const alignment = AlignmentManager.getAlignment(hero.orderScore || 0, hero.moralityScore || 0);
    const orderSign = (hero.orderScore || 0) > 0 ? '+' : '';
    const moralSign = (hero.moralityScore || 0) > 0 ? '+' : '';

    const portraitHeaderHTML = `
    <div style="display: flex; gap: 14px; background: #0b0d11; padding: 12px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; align-items: center;">
      <div style="position: relative; flex-shrink: 0; width: 72px; height: 86px; border: 2px solid var(--border-gold-frame); box-shadow: 0 0 10px rgba(0,0,0,0.8); border-radius: 3px; overflow: hidden; background: #000;">
        <img src="${portraitUrl}" alt="${hero.name}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'72\\' height=\\'86\\' viewBox=\\'0 0 72 86\\'><rect width=\\'72\\' height=\\'86\\' fill=\\'%2311141a\\'/><text x=\\'50%\\' y=\\'55%\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'28\\'>👤</text></svg>';">
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <div>
            <span style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; color: var(--gold-tsr);">${hero.name}</span>
            <span style="font-size: 11px; color: var(--text-parchment); margin-left: 6px;">(${raceLabel}${hero.className})</span>
          </div>
          <button id="toggle-portrait-gallery-btn" class="action-tab" style="padding: 2px 8px; font-size: 10px;">
            🖼️ Change Portrait
          </button>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">
          Group: <b style="color: var(--text-parchment);">${hero.group || 'Adventurer'}</b> | Level: <b style="color: var(--gold-tsr);">${hero.level || 1}</b> | Status: <b style="color: ${hero.hp > 0 ? '#3fb950' : '#ff7b72'};">${hero.hp > 0 ? 'Active' : 'Fallen'}</b>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span>Emergent Alignment: <b style="color: ${alignment.color}; font-weight: bold;">${alignment.name}</b></span>
          <span style="background: #161b22; border: 1px solid var(--border-iron); padding: 1px 6px; border-radius: 2px; font-size: 10px; color: #c9d1d9;">
            ⚖️ ${orderSign}${hero.orderScore || 0} Order, ${moralSign}${hero.moralityScore || 0} Morality
          </span>
          ${hero.classKey === 'cleric' ? `<span style="background: rgba(210,153,34,0.15); border: 1px solid rgba(210,153,34,0.4); color: var(--gold-tsr); padding: 1px 6px; border-radius: 2px; font-size: 10px;">${hero.patronDeitySymbol || '☀️'} Devoted to ${hero.patronDeityName || 'Pelor'}</span>` : ''}
        </div>
        <div id="portrait-gallery-drawer" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #21262d;">
          <div style="font-size: 10px; color: var(--gold-tsr); font-weight: bold; margin-bottom: 6px;">PORTRAIT GALLERY:</div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            ${portraitGallery.map(p => `
              <div class="gallery-portrait-opt" data-file="${p.file}" style="cursor: pointer; border: 2px solid ${hero.portrait === p.file || portraitUrl === p.file ? 'var(--gold-tsr)' : 'var(--border-iron)'}; border-radius: 3px; padding: 2px; background: rgba(0,0,0,0.5); text-align: center; transition: border-color 0.15s ease;" title="${p.name}">
                <img src="${p.file}" alt="${p.name}" style="width: 44px; height: 52px; object-fit: cover; display: block; border-radius: 1px;">
                <div style="font-size: 8.5px; color: var(--text-muted); max-width: 44px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">${p.name.split(' ')[0]}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>`;

    const attrs = hero.attributes;
    const strDisplay = (hero.equippedGloves && (hero.equippedGloves.strengthSet || hero.equippedGloves.name?.toLowerCase().includes('ogre')))
      ? `${attrs.strength} <span style="color:#f0883e; font-weight:bold;">(18/00 🥊 Ogre)</span>`
      : `${attrs.strength}`;

    const statsHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #0d1117; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>Strength: <b style="color:var(--text-parchment);">${strDisplay}</b></div>
      <div>Dexterity: <b style="color:var(--text-parchment);">${attrs.dexterity}</b></div>
      <div>Constitution: <b style="color:var(--text-parchment);">${attrs.constitution}</b></div>
      <div>Intelligence: <b style="color:var(--text-parchment);">${attrs.intelligence}</b></div>
      <div>Wisdom: <b style="color:var(--text-parchment);">${attrs.wisdom}</b></div>
      <div>Charisma: <b style="color:var(--text-parchment);">${attrs.charisma}</b></div>
    </div>`;

    // Dynamic Buff Indicators
    const activeBuffs = [];
    if (hero.equippedGloves && (hero.equippedGloves.strengthSet || hero.equippedGloves.name?.toLowerCase().includes('ogre'))) {
      activeBuffs.push(`<span style="background:#281b0a;color:#f0883e;border:1px solid #bd561d;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🥊 ${hero.equippedGloves.name}: STR 18/00 (+3 To-Hit, +4 Melee Dmg, 180 lb load)</span>`);
    }
    if (hero.equippedBoots && (hero.equippedBoots.name?.toLowerCase().includes('elvenkind') || hero.equippedBoots.name?.toLowerCase().includes('evenkind') || hero.equippedBoots.silentSteps)) {
      activeBuffs.push(`<span style="background:#0f2b1d;color:#7ee787;border:1px solid #238636;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🧝 ${hero.equippedBoots.name}: Utter Silence (+25% Stealth, -1 AC, Ambush Immunity)</span>`);
    }
    if (hero.tempAcBonus > 0) {
      activeBuffs.push(`<span style="background:#0f243d;color:#79c0ff;border:1px solid #1f6feb;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🛡️ ${hero.tempAcSource || 'AC Ward'}: -${hero.tempAcBonus} AC (${hero.tempAcRounds} round${hero.tempAcRounds === 1 ? '' : 's'} remaining)</span>`);
    }
    if (hero.tempAttackBonus > 0) {
      const isHaste = hero.tempAttackBonus >= 2;
      const bg = isHaste ? '#0d2826' : '#332408';
      const col = isHaste ? '#39d353' : '#f2cc60';
      const border = isHaste ? '#238636' : '#9e6a03';
      const label = isHaste ? `⏩ Haste: +${hero.tempAttackBonus} To-Hit (${hero.tempAttackRounds} round${hero.tempAttackRounds === 1 ? '' : 's'} remaining)` : `✨ Bless: +${hero.tempAttackBonus} To-Hit (${hero.tempAttackRounds} round${hero.tempAttackRounds === 1 ? '' : 's'} remaining)`;
      activeBuffs.push(`<span style="background:${bg};color:${col};border:1px solid ${border};padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${label}</span>`);
    }
    if (hero.isStealth) {
      activeBuffs.push(`<span style="background:#211938;color:#d2a8ff;border:1px solid #8957e5;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🗡️ Shadow Stealth (Hidden in shadows, backstab primed)</span>`);
    }
    if (hero.tempIntDrain) {
      activeBuffs.push(`<span style="background:#3d1010;color:#ff7b72;border:1px solid #f85149;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">🧠 INT bruise −${hero.tempIntDrain} (clears on rest)</span>`);
    }
    if (hero.classKey === 'fighter' && hero.specializedWeapon && hero.equippedWeapon === hero.specializedWeapon) {
      const isR = this.state.isRangedWeapon(hero.specializedWeapon);
      const icon = isR ? '🏹' : '⚔️';
      activeBuffs.push(`<span style="background:#2a1b04;color:#ffd700;border:1px solid #d29922;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">${icon} Specialized: +1 to-hit / +2 dmg (${hero.specializedWeapon})</span>`);
    }

    const buffsHTML = activeBuffs.length > 0 ? `
    <div style="background: rgba(31, 111, 235, 0.1); border: 1px solid #1f6feb; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px;">
      <div style="color: #79c0ff; font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">⚡ Active Combat Buffs & Conditions</div>
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        ${activeBuffs.join('')}
      </div>
    </div>` : '';

    const baseAc = hero.armorClass != null ? hero.armorClass : 5;
    const activeSpellAc = hero.tempAcBonus || 0;
    const partyTier = this.state.getPartyEncumbranceTier ? this.state.getPartyEncumbranceTier() : null;
    const encAcPenalty = (partyTier && partyTier.acPenalty) || 0;
    const effectiveAc = baseAc - activeSpellAc + encAcPenalty;

    const combatHTML = `
    <div style="display: flex; justify-content: space-between; background: #161b22; padding: 10px 14px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>HP: <b style="color:#3fb950; font-size: 13px;">${hero.hp}/${hero.maxHp}</b></div>
      <div>AC: <b style="color:var(--accent-gold); font-size: 13px;">${effectiveAc}</b>${activeSpellAc > 0 ? ` <span style="color:#79c0ff; font-size: 11px;">(-${activeSpellAc})</span>` : ''}${encAcPenalty > 0 ? ` <span style="color:#ff7b72; font-size: 11px;">(+${encAcPenalty} enc)</span>` : ''}</div>
      <div>Attack Bonus: <b style="color:var(--text-parchment);">+${hero.attackBonus || 1}</b></div>
      <div>XP: <b>${hero.xp || 0} / ${hero.nextLevelXp || 500}</b></div>
    </div>`;

    let skillsHTML = '';
    if (hero.skills && Object.keys(hero.skills).length > 0) {
      const skillRows = Object.entries(hero.skills).map(([key, skill]) => {
        const target = this.state.getSkillTarget(hero, key);
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
    if (hero.classKey === 'fighter') {
      const specWeapon = hero.specializedWeapon || 'Longsword';
      const isWielding = hero.equippedWeapon === specWeapon;
      const allWeapons = Object.keys(hero.weaponUsage || {});
      const usageList = allWeapons.length > 0
        ? allWeapons.map(wName => {
            const hits = hero.weaponUsage[wName];
            const mastery = this.state.getWeaponMastery(hero, wName);
            return `<li style="font-size:11px; margin-bottom:2px; display:flex; justify-content:space-between;">
              <span>${wName}: <b style="color:var(--gold-tsr);">${hits} hits</b></span>
              <span style="color:#58a6ff;">+${mastery.atkBonus} Atk / +${mastery.dmgBonus} Dmg</span>
            </li>`;
          }).join('')
        : '<li style="font-size:11px; color:var(--text-muted);">No battlefield combat recorded yet</li>';

      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">⚔️ Warrior Martial Specialization</div>
        <div>Chosen Specialization: <b style="color:var(--gold-tsr);">${specWeapon}</b> <span style="color:#3fb950; font-size:11px;">(+1 to-hit, +2 damage)</span></div>
        <div style="margin-top: 3px; font-size: 11px;">Status: ${isWielding ? '<b style="color:#3fb950;">✓ Equipped & Active</b>' : '<span style="color:var(--text-muted);">(Equip in gear list below to gain bonuses)</span>'}</div>
        
        <div style="background: #0a0b0e; padding: 8px; border: 1px solid #1a1e27; border-radius: 2px; margin-top: 8px; font-size: 11px;">
          <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 4px;">🎯 Battle Weapon Experience</div>
          <ul style="margin: 0; padding: 0 0 0 4px; list-style: none;">${usageList}</ul>
          <div style="color:var(--text-muted); font-size:10px; margin-top:4px;">Familiarity at 15 hits (+1 to-hit). Mastery at 40 hits (+2 to-hit, +1 dmg). Stacks with Specialization!</div>
        </div>
      </div>`;
    } else if (hero.classKey === 'mage') {
      const maxBurden = hero.maxCognition || 100;
      const burden = Math.max(0, maxBurden - (hero.cognition ?? maxBurden));
      const heldLoad = (hero.spells || []).filter(s => !s.spent).reduce((sum, s) => sum + (s.cognitive_load || 0), 0);
      const lingeringStrain = Math.max(0, burden - heldLoad);
      const unmemorizedCount = (hero.spells || []).filter(s => s.spent).length;
      const preparedList = (hero.spells || [])
        .map((s, idx) => ({ ...s, originalIdx: idx }))
        .filter(s => !s.spent)
        .map(s => {
          const effType = s.effect ? s.effect.type : '';
          const isCastableOffCombat = !this.state.combat.active && hero.hp > 0 && (
            s.id === 'light' || effType === 'illumination' || effType === 'buff_attack' || effType === 'buff_ac' || effType === 'heal' || effType === 'party_heal'
          );
          const castBtn = isCastableOffCombat
            ? `<button class="action-tab sheet-cast-mage-spell-btn" data-index="${s.originalIdx}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Cast</button>`
            : '';
          return `<li style="color: #d2a8ff; margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
            <span>[L${s.level}] <b>${s.name}</b> <span style="color:var(--text-muted);font-size:10px;">(load: +${s.cognitive_load || 20} Burden)</span></span>
            ${castBtn}
          </li>`;
        }).join('');

      const grimoireEntries = (hero.spells || []).map((s, idx) => {
        const statusBadge = s.spent
          ? '<span style="color: #8b949e; font-size: 10px;">[In Grimoire]</span>'
          : '<span style="color: #3fb950; font-size: 10px;">[Construct Prepared]</span>';
        const memBtn = (s.spent && hero.hp > 0 && !this.state.combat.active)
          ? `<button class="action-tab sheet-memorize-spell-btn" data-index="${idx}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Memorize</button>`
          : '';
        return `<li style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; background: #0d1117; padding: 4px 6px; border-radius: 3px; border: 1px solid var(--border-iron);">
          <div>
            <b style="color:#d2a8ff;">[L${s.level}] ${s.name}</b> <span style="color:var(--text-muted);font-size:10px;">(Load: ${s.cognitive_load || 20})</span> ${statusBadge}
            <div style="color:var(--text-muted);font-size:10px;margin-top:1px;">${s.description || ''}</div>
          </div>
          ${memBtn}
        </li>`;
      }).join('');

      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">⚡ Vancian Mental Burden</div>
        <div>Burden: <b style="color:#d2a8ff;">${burden}/${maxBurden}</b> <span style="color:var(--text-muted);font-size:10px;">(Held constructs: ${heldLoad}${lingeringStrain > 0 ? `, spent residue: ${lingeringStrain} — clears on rest` : ''})</span></div>
        
        <div style="margin-top: 8px; font-weight: bold; color: var(--gold-tsr); font-size: 11px;">Active Constructs Held in Mind:</div>
        <ul style="margin: 4px 0 6px 4px; padding: 0; list-style: none;">
          ${preparedList || `<li style="color: var(--text-muted); font-style: italic; font-size: 11px;">${lingeringStrain > 0 ? 'No constructs held. Spent residue still occupies the mind until rest.' : 'No constructs currently held in mind (0 Burden). Mind is completely unencumbered.'}</li>`}
        </ul>

        <div style="margin-top: 8px; font-weight: bold; color: var(--gold-tsr); font-size: 11px; border-top: 1px solid var(--border-iron); padding-top: 6px;">📖 Grimoire Inscriptions:</div>
        <ul style="margin: 4px 0 0 0; padding: 0; list-style: none;">
          ${grimoireEntries || '<li style="color: var(--text-muted); font-style: italic; font-size: 11px;">No spells inscribed in grimoire.</li>'}
        </ul>

        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-grimoire-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${unmemorizedCount === 0 || hero.hp <= 0 ? 'disabled' : ''}>📖 Study Grimoire (Memorize Available)</button>
          <span style="color:var(--text-muted);font-size:10px;">Seats formulas into memory up to cognitive capacity (100 Burden max). Field: one spell, 10 min/level. Sanctuary: seats all formulas that safely fit.</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'cleric') {
      const prayerCapacity = hero.prayerCapacity || CharacterFactory.getClericPrayerCapacity(hero.attributes?.wisdom || 10);
      const activePrayers = (hero.spells || []).filter(s => !s.spent);
      const invokedPrayers = (hero.spells || []).filter(s => s.spent);
      const invokedCount = invokedPrayers.length;

      const prayersList = (hero.spells || []).map((s, idx) => {
        if (s.spent) {
          return `<li style="color: #484f58; text-decoration: line-through; margin-bottom: 3px; font-size: 11px; display: flex; justify-content: space-between; align-items: center;">
            <span>[L${s.level || s.tier || 1}] ${s.name} <span style="color:#6e7681; font-size:9.5px;">(Invoked today)</span></span>
          </li>`;
        }
        const invokeBtn = !this.state.combat.active && hero.hp > 0 && hero.divineFavor > 0 && !hero.absoluteSilence
          ? `<button class="action-tab sheet-cast-prayer-btn" data-index="${idx}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Invoke</button>`
          : '';
        return `<li style="color: #58a6ff; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; background: rgba(88,166,255,0.06); padding: 3px 6px; border-radius: 2px; border: 1px solid rgba(88,166,255,0.2);">
          <span>[L${s.level || s.tier || 1}] <b>${s.name}</b> <span style="color:var(--text-muted);font-size:10px;">(${s.description || 'Granted'})</span></span>
          ${invokeBtn}
        </li>`;
      }).join('');

      const allSphereList = (hero.allPrayers || SpellRegistry.getSpellsForClass('cleric', 1)).map(p => {
        const isPrepared = (hero.spells || []).some(s => s.id === p.id && !s.spent);
        const isSpent = (hero.spells || []).some(s => s.id === p.id && s.spent);
        let badge = '<span style="color: var(--text-muted); font-size: 9.5px;">[In Sphere]</span>';
        if (isPrepared) badge = '<span style="color: #3fb950; font-size: 9.5px;">[Prepared]</span>';
        else if (isSpent) badge = '<span style="color: #6e7681; font-size: 9.5px;">[Invoked]</span>';
        
        return `<li style="margin-bottom: 3px; display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; background: #0d1117; padding: 3px 6px; border-radius: 2px; border: 1px solid var(--border-iron);">
          <div>
            <b style="color: #58a6ff;">${p.name}</b> ${badge}
            <div style="color: var(--text-muted); font-size: 9.5px;">${p.description || ''}</div>
          </div>
        </li>`;
      }).join('');

      const deity = AlignmentManager.getDeity(hero.patronDeityId || 'pelor');
      const concordance = AlignmentManager.calculateEthosConcordance(hero);
      const concordancePct = concordance ? concordance.concordancePct : 100;
      const statusLabel = concordance ? concordance.statusLabel : hero.ethosStatus;
      const concordanceBarColor = concordancePct >= 75 ? '#3fb950' : (concordancePct >= 40 ? '#d29922' : '#f85149');

      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <!-- Patron Deity & Ethos Concordance Header -->
        <div style="background: rgba(210,153,34,0.1); border: 1px solid rgba(210,153,34,0.3); border-radius: 4px; padding: 8px 10px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
            <div>
              <span style="font-size: 15px; margin-right: 4px;">${deity.symbol}</span>
              <b style="color: var(--gold-tsr); font-size: 13px;">${deity.name}</b>
              <span style="color: var(--text-muted); font-size: 11px;">(${deity.title}) — ${deity.alignment}</span>
            </div>
            <span style="font-size: 10px; color: ${concordanceBarColor}; font-weight: bold; background: #0d1117; padding: 2px 6px; border-radius: 2px; border: 1px solid #30363d;">
              ${statusLabel}
            </span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 6px;">
            <b>Portfolio:</b> ${deity.portfolio}
          </div>

          <!-- Ethos Concordance Meter -->
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 2px;">
              <span style="color: var(--text-parchment);">Sacred Ethos Concordance:</span>
              <span style="color: ${concordanceBarColor}; font-weight: bold;">${concordancePct}% (Ideal: Order ${deity.idealOrder > 0 ? '+' : ''}${deity.idealOrder}, Morality ${deity.idealMorality > 0 ? '+' : ''}${deity.idealMorality})</span>
            </div>
            <div style="height: 6px; background: #0d1117; border-radius: 3px; overflow: hidden; border: 1px solid #30363d;">
              <div style="width: ${concordancePct}%; height: 100%; background: ${concordanceBarColor}; transition: width 0.3s ease;"></div>
            </div>
          </div>

          <!-- Deity Tenets Collapsible/Summary -->
          <div style="font-size: 10px; font-weight: bold; color: var(--gold-tsr); margin-bottom: 3px;">The Sacred Ethos Tenets:</div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;">
            ${deity.ethos.map(t => `
              <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 2px; padding: 3px 6px; font-size: 9.5px;">
                <b style="color: #e6edf3;">${t.title}</b>
                <div style="color: #8b949e; font-size: 8.5px; line-height: 1.2; margin-top: 1px;">${t.description}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">✨ Divine Communion & Prayer Allotment</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px;">
          <span>Divine Favor: <b style="color:#58a6ff;">${hero.divineFavor}%</b> (${hero.divineFavor > 0 ? '<span style="color:#3fb950;">Linked</span>' : '<span style="color:#f85149;">Absolute Silence</span>'})</span>
          <span>Prepared Capacity: <b style="color: var(--favor-blue);">${activePrayers.length} / ${prayerCapacity}</b> (WIS ${hero.attributes?.wisdom || 10})</span>
        </div>
        
        <div style="margin-top: 6px; font-weight: bold; color: var(--gold-tsr); font-size: 11px;">Active Prayers Prepared for Invocation:</div>
        <ul style="margin: 4px 0 6px 0; padding: 0; list-style: none;">
          ${prayersList || '<li style="color: var(--text-muted); font-style: italic; font-size: 11px;">No prayers currently held prepared. Rest and petition your deity.</li>'}
        </ul>

        <div style="margin-top: 8px; font-weight: bold; color: var(--gold-tsr); font-size: 11px; border-top: 1px solid var(--border-iron); padding-top: 6px;">
          🕊️ Full 1st-Level Divine Sphere (Open Access):
        </div>
        <ul style="margin: 4px 0 0 0; padding: 0; list-style: none; max-height: 120px; overflow-y: auto;">
          ${allSphereList}
        </ul>

        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-prayers-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${invokedCount === 0 || hero.divineFavor <= 0 || hero.hp <= 0 ? 'disabled' : ''}>🙏 Petition Deity</button>
          <span style="color:var(--text-muted);font-size:10px;">Communes with deity to restore all ${prayerCapacity} prepared prayer capacity without cost.</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'thief') {
      const backstabTier = (() => {
        const { familiarity, mastery } = GameState.BACKSTAB_TIERS;
        if (hero.level >= mastery.minLevel && (hero.backstabSuccesses || 0) >= mastery.count) return 'mastery';
        if (hero.level >= familiarity.minLevel && (hero.backstabSuccesses || 0) >= familiarity.count) return 'familiarity';
        return 'novice';
      })();

      const shadowTier = (() => {
        const { familiarity, mastery } = GameState.SHADOW_TIERS;
        if (hero.level >= mastery.minLevel && (hero.shadowcraftSuccesses || 0) >= mastery.count) return 'mastery';
        if (hero.level >= familiarity.minLevel && (hero.shadowcraftSuccesses || 0) >= familiarity.count) return 'familiarity';
        return 'novice';
      })();

      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">🗡️ Rogue Metrics</div>
        <div>Tools Durability: <b style="color:#f0883e;">${hero.toolsDurability}%</b></div>
        <div>Stealth State: <b>${hero.isStealth ? 'Active (Hidden)' : 'Inactive'}</b></div>
        
        <div style="background: #0a0b0e; padding: 8px; border: 1px solid #1a1e27; border-radius: 2px; margin-top: 8px; font-size: 11px;">
          <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 4px;">🎯 Mastery Progression</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <div style="color: #d2a8ff; font-weight: bold;">Backstab</div>
              <div style="color: var(--text-muted); font-size: 10px; margin: 2px 0;">${backstabTier.toUpperCase()}</div>
              <div style="color: var(--favor-blue); font-size: 10px;">Hits: ${hero.backstabSuccesses || 0}</div>
            </div>
            <div>
              <div style="color: #d2a8ff; font-weight: bold;">Shadowcraft</div>
              <div style="color: var(--text-muted); font-size: 10px; margin: 2px 0;">${shadowTier.toUpperCase()}</div>
              <div style="color: var(--favor-blue); font-size: 10px;">Successes: ${hero.shadowcraftSuccesses || 0}</div>
            </div>
          </div>
        </div>
      </div>`;
    } else if (hero.classKey === 'fighter') {
      const specWeapon = hero.specializedWeapon || 'Longsword';
      const isSpecEquipped = hero.equippedWeapon === specWeapon;
      const isSpecRanged = this.state.isRangedWeapon(specWeapon);
      const specIcon = isSpecRanged ? '🏹' : '⚔️';
      const specStatus = isSpecEquipped
        ? `<span style="color:#3fb950; font-weight:700;">✓ Active (+1 To-Hit, +2 Dmg)</span>`
        : `<span style="color:var(--text-muted); font-size:10.5px;">(Equip ${specWeapon} to activate)</span>`;

      const usageEntries = Object.entries(hero.weaponUsage || {}).map(([wName, hits]) => {
        const m = this.state.getWeaponMastery(hero, wName);
        const isR = this.state.isRangedWeapon(wName);
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:3px 0; border-bottom:1px dashed #21262d; font-size:11px;">
          <span>${isR ? '🏹' : '⚔️'} <b>${wName}</b> <span style="color:var(--text-muted); font-size:10px;">(${m.tier.toUpperCase()})</span></span>
          <span style="color:var(--favor-blue); font-size:10px;">${hits} hits (+${m.atkBonus} / +${m.dmgBonus})</span>
        </div>`;
      }).join('') || `<div style="color:var(--text-muted); font-size:10px; font-style:italic;">No weapon strikes logged yet in this expedition.</div>`;

      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">⚔️ Martial Prowess & Weapon Specialization</div>
        <div style="background: #0d1117; padding: 8px; border: 1px solid var(--border-iron); border-radius: 3px; margin-bottom: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
            <span>${specIcon} Specialization: <b style="color:var(--gold-tsr);">${specWeapon}</b></span>
            ${specStatus}
          </div>
          <div style="font-size:10px; color:var(--parchment); margin-top:4px;">
            AD&D 2e Fighter Specialization grants +1 to-hit and +2 damage on attacks with ${specWeapon}.
          </div>
        </div>

        <div style="color: var(--gold-tsr); font-weight: bold; font-size: 11px; margin-bottom: 4px;">Expedition Weapon Mastery Hits</div>
        <div style="background: #0a0b0e; padding: 6px 8px; border: 1px solid #1a1e27; border-radius: 2px;">
          ${usageEntries}
        </div>
      </div>`;
    }

    const equipped = hero.equippedWeapon || 'None';
    const equippedIsRanged = this.state.isRangedWeapon(hero.equippedWeapon);
    const ammoType = equippedIsRanged ? this.state.getWeaponAmmoType(hero.equippedWeapon) : null;
    const ammoCount = ammoType ? this.state.getAmmoCount(ammoType, hero) : 0;
    
    const weaponMastery = hero.equippedWeapon ? this.state.getWeaponMastery(hero, hero.equippedWeapon) : null;
    const weaponUsageCount = hero.weaponUsage?.[hero.equippedWeapon] || 0;
    const masteryInfo = weaponMastery ? `
    <div style="background: #0a0b0e; padding: 8px; border: 1px solid #1a1e27; border-radius: 2px; margin-top: 6px; font-size: 11px;">
      <div style="color: var(--gold-tsr); font-weight: bold; margin-bottom: 4px;">${hero.equippedWeapon} — ${weaponMastery.tier.toUpperCase()}</div>
      <div style="color: var(--text-muted); margin-bottom: 3px;">Successful hits: ${weaponUsageCount}</div>
      ${weaponMastery.tier !== 'mastery' ? `<div style="color: var(--favor-blue); font-size: 10px;">Next tier at ${weaponMastery.tier === 'familiarity' ? '40 hits' : '15 hits'}</div>` : '<div style="color: #3fb950; font-size: 10px;">✓ Mastery reached</div>'}
      ${weaponMastery.atkBonus > 0 || weaponMastery.dmgBonus > 0 ? `<div style="color: #58a6ff; margin-top: 4px; font-size: 10px;">+${weaponMastery.atkBonus} to-hit${weaponMastery.dmgBonus > 0 ? `, +${weaponMastery.dmgBonus} damage` : ''}</div>` : ''}
    </div>` : '';

    const otherPartyMembers = this.state.party
      .map((p, pIdx) => ({ hero: p, index: pIdx }))
      .filter(p => p.index !== heroIndex && p.hero && p.hero.hp > -10);

    const invItems = (hero.personalInventory || hero.inventory || []);
    const invRows = invItems.length === 0
      ? `<div style="color:var(--text-muted);">Empty</div>`
      : invItems.map((i, slotIdx) => {
        if (!i) return '';
        const itemName = typeof i === 'string' ? i : i.name;
        if (!itemName) return '';
        const itemDef = this.state.getItemDef(itemName);
        const isWeapon = this.state.isKnownWeapon(itemName);
        const isArmor = itemDef && itemDef.kind === 'armor';
        const isShield = itemDef && itemDef.kind === 'shield';
        const isBoots = itemDef && itemDef.kind === 'boots';
        const isGloves = itemDef && itemDef.kind === 'gloves';

        let equipBtn = '';
        if (isWeapon) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:4px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedWeapon === itemName) {
            equipBtn = `<span style="color:var(--gold-tsr);font-size:10px;margin-left:4px;font-weight:700;">[Wielded]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-weapon-btn" data-hero-index="${heroIndex}" data-weapon="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">Equip</button>`;
          }
        } else if (isArmor) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:4px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedArmor && hero.equippedArmor.name === itemName) {
            equipBtn = `<span style="color:#79c0ff;font-size:10px;margin-left:4px;font-weight:700;">[Worn]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-armor-btn" data-hero-index="${heroIndex}" data-armor="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">Equip Armor</button>`;
          }
        } else if (isShield) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:4px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedShield && hero.equippedShield.name === itemName) {
            equipBtn = `<span style="color:#3fb950;font-size:10px;margin-left:4px;font-weight:700;">[Shielded]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-shield-btn" data-hero-index="${heroIndex}" data-shield="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">Equip Shield</button>`;
          }
        } else if (isBoots) {
          if (hero.equippedBoots && hero.equippedBoots.name === itemName) {
            equipBtn = `<span style="color:#7ee787;font-size:10px;margin-left:4px;font-weight:700;">[Worn Boots]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-boots-btn" data-hero-index="${heroIndex}" data-boots="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">Equip Boots</button>`;
          }
        } else if (isGloves) {
          if (hero.equippedGloves && hero.equippedGloves.name === itemName) {
            equipBtn = `<span style="color:#f0883e;font-size:10px;margin-left:4px;font-weight:700;">[Worn Gloves]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-gloves-btn" data-hero-index="${heroIndex}" data-gloves="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">Equip Gloves</button>`;
          }
        }
        let actionBtn = equipBtn;
        if (!actionBtn && itemDef && itemDef.usable) {
          const isPotion = itemDef.useEffect && (itemDef.useEffect.includes('heal') || itemDef.useEffect.includes('strength') || itemDef.useEffect.includes('speed') || itemDef.useEffect.includes('invisibility') || itemDef.useEffect.includes('heroism') || itemDef.useEffect.includes('fire') || itemDef.useEffect.includes('antidote') || itemDef.useEffect.includes('clairvoyance') || itemDef.useEffect.includes('levitation') || itemDef.useEffect.includes('diminution'));
          actionBtn = `<button class="action-tab use-item-btn" data-hero-index="${heroIndex}" data-item="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:4px;">${isPotion ? '🧪 Drink' : 'Use'}</button>`;
        }
        const itemWeight = (itemDef && itemDef.weight != null) ? itemDef.weight : 1;
        const itemQty = typeof i === 'object' ? (i.amount ?? i.count ?? 1) : 1;
        const isQuest = itemDef && itemDef.kind === 'quest';
        const isTreasure = itemDef && (itemDef.kind === 'treasure' || itemDef.kind === 'gem');
        let typeBadge = '';
        if (isQuest) {
          typeBadge = ' <span style="color:#ff7b72;font-size:10px;font-weight:700;">[Quest Artifact]</span>';
        } else if (isTreasure) {
          typeBadge = ` <span style="color:var(--gold-tsr);font-size:10px;">(${itemDef.price || 30} gp value)</span>`;
        } else if (itemDef && itemDef.usable) {
          typeBadge = ` <span style="color:var(--text-muted);font-size:10px;">(${itemDef.description || 'Consumable'})</span>`;
        }

        let giveBtn = '';
        if (otherPartyMembers.length > 0 && !isQuest) {
          giveBtn = `<button class="action-tab toggle-give-btn" data-target-id="give-row-${heroIndex}-${slotIdx}" style="padding:2px 7px;font-size:10px;margin-left:4px;background:#162436;border:1px solid #1f6feb;color:#79c0ff;cursor:pointer;" title="Hand over this item to an ally">🤝 Give</button>`;
        }

        const giveDropdown = otherPartyMembers.length > 0 && !isQuest ? `
          <div id="give-row-${heroIndex}-${slotIdx}" class="give-target-panel" style="display:none; margin:4px 0 6px 0; padding:6px 8px; background:#0b0f14; border:1px solid #1f6feb; border-radius:3px;">
            <div style="font-size:10px; color:#79c0ff; margin-bottom:4px; font-weight:bold;">Hand ${itemName} to:</div>
            <div style="display:flex; gap:4px; flex-wrap:wrap;">
              ${otherPartyMembers.map(m => `
                <button class="action-tab confirm-give-btn" data-from-hero="${heroIndex}" data-to-hero="${m.index}" data-item="${itemName}" style="padding:3px 8px; font-size:10px; background:#161b22; border:1px solid #30363d; color:var(--gold-tsr); cursor:pointer;">
                  ${m.hero.name} <span style="font-size:9px; color:var(--text-muted);">(${m.hero.classKey})</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : '';

        return `
          <div style="padding:4px 0;border-bottom:1px dashed #21262d;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span>${itemQty}× <b>${itemName}</b> <span style="color:var(--text-muted);font-size:10px;">(${itemWeight} lbs)</span>${typeBadge}${isWeapon && this.state.isRangedWeapon(itemName) ? ' <span style="color:var(--favor-blue);font-size:10px;">(ranged)</span>' : ''}${isArmor ? ` <span style="color:var(--accent-gold);font-size:10px;">(Base AC ${itemDef.baseAc})</span>` : ''}${isShield ? ` <span style="color:#3fb950;font-size:10px;">(-${itemDef.acBonus || 1} AC)</span>` : ''}</span>
              <div style="display:flex;align-items:center;white-space:nowrap;">
                ${actionBtn}
                ${giveBtn}
              </div>
            </div>
            ${giveDropdown}
          </div>`;
      }).filter(Boolean).join('');

    const heroCapacity = this.state.getHeroCapacity ? Math.round(this.state.getHeroCapacity(hero) * 10) / 10 : 10;
    const heroLoad = this.state.getHeroTotalLoad ? Math.round(this.state.getHeroTotalLoad(hero) * 10) / 10 : 0;
    const heroTier = this.state.getHeroEncumbranceTier ? this.state.getHeroEncumbranceTier(hero) : { tier: 'unencumbered' };
    const loadColor = heroTier.tier === 'unencumbered' ? '#3fb950' : heroTier.tier === 'burdened' ? '#e3b341' : '#ff7b72';

    const gearHTML = `
    <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; font-size: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="color: var(--accent-gold); font-weight: bold; font-size: 13px;">📦 Equipment & Worn Panoply</span>
        <span style="font-size: 11px; color: var(--parchment);">⚖️ Load: <b style="color:${loadColor};">${heroLoad} / ${heroCapacity} lbs</b> (${heroTier.tier.toUpperCase()})</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #21262d;">
        <div style="background: #0d1117; padding: 6px 8px; border: 1px solid #21262d; border-radius: 3px;">
          <div style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Worn Body Armor</div>
          <div style="color: var(--text-parchment); font-weight: bold; font-size: 12px; margin-top: 2px;">
            ${hero.equippedArmor ? `🛡️ ${hero.equippedArmor.name} <span style="color: var(--accent-gold); font-size: 10px;">(Base AC ${hero.equippedArmor.baseAc})</span>` : '<span style="color: var(--text-muted);">None (Unarmored, Base AC 10)</span>'}
          </div>
          ${hero.equippedArmor?.description ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">${hero.equippedArmor.description}</div>` : ''}
        </div>
        <div style="background: #0d1117; padding: 6px 8px; border: 1px solid #21262d; border-radius: 3px;">
          <div style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Equipped Shield</div>
          <div style="color: var(--text-parchment); font-weight: bold; font-size: 12px; margin-top: 2px;">
            ${hero.equippedShield ? `🛡 ${hero.equippedShield.name} <span style="color: #3fb950; font-size: 10px;">(-${hero.equippedShield.acBonus || 1} AC)</span>` : '<span style="color: var(--text-muted);">None (No shield equipped)</span>'}
          </div>
          ${hero.equippedShield?.description ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">${hero.equippedShield.description}</div>` : ''}
        </div>
        <div style="background: #0d1117; padding: 6px 8px; border: 1px solid #21262d; border-radius: 3px;">
          <div style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Worn Footwear</div>
          <div style="color: var(--text-parchment); font-weight: bold; font-size: 12px; margin-top: 2px;">
            ${hero.equippedBoots ? `👟 ${hero.equippedBoots.name} <span style="color: #7ee787; font-size: 10px;">(-${hero.equippedBoots.acBonus || 1} AC, Silent)</span>` : '<span style="color: var(--text-muted);">Standard Boots</span>'}
          </div>
          ${hero.equippedBoots?.description ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">${hero.equippedBoots.description}</div>` : ''}
        </div>
        <div style="background: #0d1117; padding: 6px 8px; border: 1px solid #21262d; border-radius: 3px;">
          <div style="color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Worn Handwear</div>
          <div style="color: var(--text-parchment); font-weight: bold; font-size: 12px; margin-top: 2px;">
            ${hero.equippedGloves ? `🥊 ${hero.equippedGloves.name} <span style="color: #f0883e; font-size: 10px;">(STR 18/00)</span>` : '<span style="color: var(--text-muted);">Standard Gloves</span>'}
          </div>
          ${hero.equippedGloves?.description ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">${hero.equippedGloves.description}</div>` : ''}
        </div>
      </div>
      <div style="margin-bottom:6px;">Equipped Weapon: <b style="color:var(--gold-tsr);">${equipped}</b>
        ${equippedIsRanged ? `<span style="color:var(--favor-blue);font-size:10px;"> — ranged</span><span style="color:${ammoCount > 0 ? '#7ee787' : '#ff7b72'};font-size:10.5px;margin-left:6px;font-weight:600;">(${ammoCount} ${ammoType || 'ammo'} ready)</span>` : '<span style="color:var(--text-muted);font-size:10px;"> — melee</span>'}
      </div>
      ${masteryInfo}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 8px 0 4px; font-size: 12px;">Personal Inventory</div>
      ${invRows}
    </div>`;

    // Emergent Moral Alignment Matrix & Vector Compass
    const orderVal = hero.orderScore || 0;
    const moralityVal = hero.moralityScore || 0;
    const orderPct = Math.round(((orderVal + 100) / 200) * 100);
    const moralityPct = Math.round(((moralityVal + 100) / 200) * 100);

    const matrixGrid = [
      [
        { key: 'lawful_good', name: 'Lawful Good', short: 'LG', color: '#7ee787' },
        { key: 'neutral_good', name: 'Neutral Good', short: 'NG', color: '#3fb950' },
        { key: 'chaotic_good', name: 'Chaotic Good', short: 'CG', color: '#56d364' }
      ],
      [
        { key: 'lawful_neutral', name: 'Lawful Neutral', short: 'LN', color: '#79c0ff' },
        { key: 'true_neutral', name: 'True Neutral', short: 'TN', color: '#e6edf3' },
        { key: 'chaotic_neutral', name: 'Chaotic Neutral', short: 'CN', color: '#a5d6ff' }
      ],
      [
        { key: 'lawful_evil', name: 'Lawful Evil', short: 'LE', color: '#ff7b72' },
        { key: 'neutral_evil', name: 'Neutral Evil', short: 'NE', color: '#f85149' },
        { key: 'chaotic_evil', name: 'Chaotic Evil', short: 'CE', color: '#da3633' }
      ]
    ];

    const matrixHTML = matrixGrid.map(row => `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 4px;">
        ${row.map(cell => {
          const isActive = alignment.key === cell.key;
          return `
            <div style="padding: 4px; text-align: center; border-radius: 3px; border: 1px solid ${isActive ? 'var(--gold-tsr)' : 'var(--border-iron)'}; background: ${isActive ? 'rgba(210,153,34,0.25)' : '#0d1117'}; box-shadow: ${isActive ? '0 0 6px rgba(210,153,34,0.4)' : 'none'}; transition: all 0.2s ease;">
              <div style="font-weight: bold; font-size: 10px; color: ${isActive ? 'var(--gold-tsr)' : cell.color};">
                ${cell.short} ${isActive ? '★' : ''}
              </div>
              <div style="font-size: 7.5px; color: ${isActive ? '#fff' : '#8b949e'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${cell.name}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `).join('');

    const recentHistory = (hero.alignmentHistory || []).slice(-3).reverse();
    const historyHTML = recentHistory.length > 0 ? `
      <div style="margin-top: 6px; border-top: 1px dashed #30363d; padding-top: 4px;">
        <div style="font-size: 9px; color: var(--text-muted); margin-bottom: 3px; font-weight: bold;">RECENT MORAL COMMISSIONS:</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
          ${recentHistory.map(h => {
            const oDelta = (h.orderDelta > 0 ? '+' : '') + h.orderDelta;
            const mDelta = (h.moralityDelta > 0 ? '+' : '') + h.moralityDelta;
            return `
              <div style="font-size: 8.5px; color: #8b949e; display: flex; justify-content: space-between; background: #0b0d11; padding: 2px 4px; border-radius: 2px;">
                <span>${h.actionName || 'Encounter decision'}</span>
                <span style="color: var(--text-parchment); font-family: monospace;">Order: ${oDelta}, Moral: ${mDelta}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : `
      <div style="font-size: 8.5px; color: var(--text-muted); font-style: italic; margin-top: 4px;">
        No moral actions recorded yet. Your decisions in dialogues, quests, and crises dynamically forge this alignment.
      </div>
    `;

    const alignmentHTML = `
    <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <div style="color: var(--accent-gold); font-weight: bold; font-size: 13px;">⚖️ Emergent Conscience & Alignment Vector</div>
        <span style="font-size: 10px; color: ${alignment.color}; font-weight: bold; background: #0d1117; padding: 1px 6px; border-radius: 2px; border: 1px solid #30363d;">
          Current: ${alignment.name}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: 140px 1fr; gap: 10px; align-items: center;">
        <div>
          ${matrixHTML}
        </div>

        <div>
          <div style="margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
              <span>Chaotic (-100)</span>
              <span style="color: var(--gold-tsr); font-weight: bold;">Order Axis: ${orderSign}${orderVal}</span>
              <span>Lawful (+100)</span>
            </div>
            <div style="position: relative; height: 6px; background: #0d1117; border: 1px solid #30363d; border-radius: 3px;">
              <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #555;"></div>
              <div style="position: absolute; left: ${orderPct}%; top: -2px; transform: translateX(-50%); width: 8px; height: 10px; background: var(--favor-blue); border-radius: 2px; box-shadow: 0 0 4px #58a6ff;"></div>
            </div>
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); margin-bottom: 2px;">
              <span>Evil (-100)</span>
              <span style="color: ${moralityVal >= 0 ? '#3fb950' : '#f85149'}; font-weight: bold;">Morality Axis: ${moralSign}${moralityVal}</span>
              <span>Good (+100)</span>
            </div>
            <div style="position: relative; height: 6px; background: #0d1117; border: 1px solid #30363d; border-radius: 3px;">
              <div style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #555;"></div>
              <div style="position: absolute; left: ${moralityPct}%; top: -2px; transform: translateX(-50%); width: 8px; height: 10px; background: ${moralityVal >= 0 ? '#3fb950' : '#f85149'}; border-radius: 2px; box-shadow: 0 0 4px ${moralityVal >= 0 ? '#3fb950' : '#f85149'};"></div>
            </div>
          </div>
        </div>
      </div>

      ${historyHTML}
    </div>`;

    let levelUpBanner = '';
    if (hero.canLevelUp) {
      const canTrain = this.state.canPartyTrain();
      levelUpBanner = `
      <div style="background: rgba(210,153,34,0.15); border: 1px solid var(--accent-gold); border-radius: 4px; padding: 8px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: var(--accent-gold);">⭐ Ready for Advancement (Level ${hero.level + 1})</b>
          <div style="font-size: 10px; color: var(--text-muted);">${canTrain ? 'Mentors and training facilities are accessible here in town!' : 'Return to town or village to complete formal training.'}</div>
        </div>
        <button id="sheet-level-up-btn" class="action-tab primary" style="padding: 4px 12px; font-size: 11px; font-weight: bold;" ${canTrain ? '' : 'disabled'}>⭐ TRAIN NOW</button>
      </div>`;
    }

    this.contentEl.innerHTML = levelUpBanner + portraitHeaderHTML + statsHTML + buffsHTML + combatHTML + skillsHTML + specializedHTML + alignmentHTML + gearHTML;
    this.bindEvents();
    if (this.modal) this.modal.style.display = 'flex';
  }

  bindEvents() {
    // Portrait gallery drawer toggle
    const toggleGalleryBtn = this.contentEl.querySelector('#toggle-portrait-gallery-btn');
    const galleryDrawer = this.contentEl.querySelector('#portrait-gallery-drawer');
    if (toggleGalleryBtn && galleryDrawer) {
      toggleGalleryBtn.addEventListener('click', () => {
        const isHidden = galleryDrawer.style.display === 'none';
        galleryDrawer.style.display = isHidden ? 'block' : 'none';
        toggleGalleryBtn.textContent = isHidden ? '▲ Hide Gallery' : '🖼️ Change Portrait';
      });
    }

    // Portrait gallery option click
    this.contentEl.querySelectorAll('.gallery-portrait-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const file = opt.getAttribute('data-file');
        const hIdx = this.currentHeroIndex != null ? this.currentHeroIndex : 0;
        const hero = this.state.party[hIdx];
        if (hero) {
          hero.portrait = file;
          this.context.playSFX('sheet');
          this.context.log(`${hero.name}'s portrait updated.`, "info");
          this.open(hero.name);
          if (this.context.updateHUD) this.context.updateHUD(true);
        }
      });
    });

    const sheetLvlBtn = this.contentEl.querySelector('#sheet-level-up-btn');
    if (sheetLvlBtn) {
      sheetLvlBtn.addEventListener('click', () => {
        this.close();
        const hIdx = (this.currentHeroIndex != null && this.currentHeroIndex >= 0)
          ? this.currentHeroIndex
          : this.state.party.findIndex(p => p && p.name.toUpperCase() === (this.titleEl.textContent.split(' — ')[0] || '').trim().toUpperCase());
        if (hIdx !== -1 && this.context.onLevelUpClick) {
          this.context.onLevelUpClick(hIdx);
        }
      });
    }

    this.contentEl.querySelectorAll('.equip-weapon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const weapon = btn.getAttribute('data-weapon');
        const result = this.state.equipHeroWeapon(hIdx, weapon);
        if (result.success) {
          this.context.playSFX('equip');
          const isR = this.state.isRangedWeapon(result.equipped);
          const ammoT = isR ? this.state.getWeaponAmmoType(result.equipped) : null;
          const ammoC = ammoT ? this.state.getAmmoCount(ammoT, this.state.party[hIdx]) : 0;
          const ammoNote = isR ? ` (${ammoC} ${ammoT} ready)` : '';
          this.context.log(`${this.state.party[hIdx].name} equips ${result.equipped}${ammoNote}.`, "success");
          this.open(this.state.party[hIdx].name);
          if (this.context.updateHUD) this.context.updateHUD(true);
        } else {
          this.context.log(result.reason || 'Could not equip.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.equip-armor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const armor = btn.getAttribute('data-armor');
        const result = this.state.equipHeroArmor(hIdx, armor);
        if (result.success) {
          this.context.playSFX('equip');
          this.context.log(`${this.state.party[hIdx].name} dons ${result.equipped}.`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not don armor.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.equip-shield-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const shield = btn.getAttribute('data-shield');
        const result = this.state.equipHeroShield(hIdx, shield);
        if (result.success) {
          this.context.playSFX('equip');
          this.context.log(`${this.state.party[hIdx].name} readies ${result.equipped}.`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not ready shield.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.equip-boots-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const boots = btn.getAttribute('data-boots');
        const result = this.state.equipHeroBoots(hIdx, boots);
        if (result.success) {
          this.context.playSFX('equip');
          this.context.log(`${this.state.party[hIdx].name} equips ${result.equipped}. Steps become completely silent!`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not equip boots.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.equip-gloves-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const gloves = btn.getAttribute('data-gloves');
        const result = this.state.equipHeroGloves(hIdx, gloves);
        if (result.success) {
          this.context.playSFX('equip');
          this.context.log(`${this.state.party[hIdx].name} dons ${result.equipped}. Brute ogre force surges through their arms (STR 18/00, +3 to-hit, +4 damage)!`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not equip gloves.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.use-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const itemName = btn.getAttribute('data-item');
        const result = this.state.useConsumable(itemName, hIdx);
        if (result.success) {
          if (itemName && itemName.toLowerCase().includes('torch')) {
            this.context.playSFX('fire_torch');
          } else {
            this.context.playSFX('reward');
          }
          this.context.log(result.log || `Used ${itemName}.`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not use item.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.toggle-give-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target-id');
        const panel = this.contentEl.querySelector(`#${targetId}`);
        if (panel) {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
      });
    });

    this.contentEl.querySelectorAll('.confirm-give-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fromIdx = parseInt(btn.getAttribute('data-from-hero'), 10);
        const toIdx = parseInt(btn.getAttribute('data-to-hero'), 10);
        const itemName = btn.getAttribute('data-item');
        const result = this.state.transferHeroItem(fromIdx, toIdx, itemName, 1);
        if (result.success) {
          this.context.playSFX('equip');
          this.context.log(result.log, "success");
          this.open(this.state.party[fromIdx].name);
          if (this.context.updateHUD) this.context.updateHUD(true);
        } else {
          this.context.log(result.reason || 'Could not hand over item.', "warning");
        }
      });
    });

    const studyBtn = this.contentEl.querySelector('#sheet-study-grimoire-btn');
    if (studyBtn) {
      studyBtn.addEventListener('click', () => {
        this.context.onUIAction('STUDY_GRIMOIRE');
        const mage = this.state.party.find(p => p.classKey === 'mage');
        if (mage) this.open(mage.name);
      });
    }

    this.contentEl.querySelectorAll('.sheet-memorize-spell-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sIdx = parseInt(btn.getAttribute('data-index'), 10);
        this.context.onUIAction('STUDY_GRIMOIRE', sIdx);
        const mage = this.state.party.find(p => p.classKey === 'mage');
        if (mage) this.open(mage.name);
      });
    });

    const prayBtn = this.contentEl.querySelector('#sheet-study-prayers-btn');
    if (prayBtn) {
      prayBtn.addEventListener('click', () => {
        this.context.onUIAction('STUDY_PRAYERS');
        const cleric = this.state.party.find(p => p.classKey === 'cleric');
        if (cleric) this.open(cleric.name);
      });
    }

    this.contentEl.querySelectorAll('.sheet-cast-prayer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sIdx = parseInt(btn.getAttribute('data-index'), 10);
        this.context.onUIAction('CAST_CLERIC_PRAYER', sIdx);
      });
    });

    this.contentEl.querySelectorAll('.sheet-cast-mage-spell-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sIdx = parseInt(btn.getAttribute('data-index'), 10);
        this.context.onUIAction('CAST_MAGE_SPELL', sIdx);
        const mage = this.state.party.find(p => p.classKey === 'mage');
        if (mage) this.open(mage.name);
      });
    });
  }

  close() {
    if (this.modal && this.modal.style.display !== 'none') {
      this.modal.style.display = 'none';
      this.context.playSFX('sheet');
    }
  }
}
