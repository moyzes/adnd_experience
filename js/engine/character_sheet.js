import { GameState } from './state.js';

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
    const hero = this.state.party.find(p => p.name === heroName);
    if (!hero) return;

    this.titleEl.textContent = `${hero.name.toUpperCase()} — LEVEL ${hero.level || 1} ${hero.className.toUpperCase()}`;

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
          <span style="color:var(--text-muted);font-size:10px;">Reloads erased spells.</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'cleric') {
      const invokedCount = (hero.spells || []).filter(s => s.spent).length;
      const prayersList = hero.spells.map(s => `<li style="color: ${s.spent ? '#484f58' : '#58a6ff'}; text-decoration: ${s.spent ? 'line-through' : 'none'}; margin-bottom: 2px;">[L${s.level}] ${s.name} (${s.spent ? 'Invoked' : 'Granted'})</li>`).join('');
      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">✨ Divine Communion Metrics</div>
        <div>Divine Favor: <b style="color:#58a6ff;">${hero.divineFavor}%</b> | Status: <b>${hero.ethosStatus}</b></div>
        <div style="margin-top: 6px;">Daily allotment:</div>
        <ul style="margin: 4px 0 0 18px; padding: 0;">${prayersList}</ul>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-prayers-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${invokedCount === 0 || hero.divineFavor <= 0 ? 'disabled' : ''}>🙏 Petition Deity</button>
          <span style="color:var(--text-muted);font-size:10px;">No favor cost. Rest then petition to reopen slots.</span>
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

    const heroIndex = this.state.party.indexOf(hero);
    const equipped = hero.equippedWeapon || 'None';
    const equippedIsRanged = this.state.isRangedWeapon(hero.equippedWeapon);
    const invItems = (hero.inventory || []);
    
    const invRows = invItems.length === 0
      ? `<div style="color:var(--text-muted);">Empty</div>`
      : invItems.map(i => {
        const isWeapon = this.state.isKnownWeapon(i.name);
        const equipBtn = isWeapon
          ? `<button class="action-tab equip-weapon-btn" data-hero-index="${heroIndex}" data-weapon="${i.name}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Equip</button>`
          : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
            <span>${i.amount || 1}× ${i.name}${isWeapon && this.state.isRangedWeapon(i.name) ? ' <span style="color:var(--favor-blue);font-size:10px;">(ranged)</span>' : ''}</span>
            ${equipBtn}
          </div>`;
      }).join('');

    const usableDefs = Object.entries(GameState.ITEM_CATALOG || {}).filter(([, d]) => d.usable && d.scope === 'party');
    const partyUsableRows = usableDefs.map(([name]) => {
      const qty = this.state.getPartyItemQty(name);
      if (qty < 1) return '';
      const def = this.state.getItemDef(name);
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
          <span title="${def ? def.description : ''}">${qty}× ${name}</span>
          <button class="action-tab use-item-btn" data-hero-index="${heroIndex}" data-item="${name}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Use</button>
        </div>`;
    }).filter(Boolean).join('') || `<div style="color:var(--text-muted);">No usable items in the party pack.</div>`;

    const gearHTML = `
    <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; font-size: 12px;">
      <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">📦 Equipment & Inventory</div>
      <div style="margin-bottom:6px;">Equipped Weapon: <b style="color:var(--gold-tsr);">${equipped}</b>
        ${equippedIsRanged ? '<span style="color:var(--favor-blue);font-size:10px;"> — ranged</span>' : '<span style="color:var(--text-muted);font-size:10px;"> — melee</span>'}
      </div>
      <div style="color: var(--accent-gold); font-weight: bold; margin: 8px 0 4px; font-size: 12px;">Personal Inventory</div>
      ${invRows}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 10px 0 4px; font-size: 12px;">Party Pack (use on this hero)</div>
      ${partyUsableRows}
    </div>`;

    this.contentEl.innerHTML = statsHTML + combatHTML + skillsHTML + specializedHTML + gearHTML;
    
    this.bindEvents();
    
    if (this.modal) this.modal.style.display = 'flex';
  }

  bindEvents() {
    this.contentEl.querySelectorAll('.equip-weapon-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const weapon = btn.getAttribute('data-weapon');
        const result = this.state.equipHeroWeapon(hIdx, weapon);
        if (result.success) {
          this.context.playSFX('button');
          this.context.log(`${this.state.party[hIdx].name} equips ${result.equipped}.`, "success");
          this.open(this.state.party[hIdx].name); // Re-render
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not equip.', "warning");
        }
      });
    });

    this.contentEl.querySelectorAll('.use-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const hIdx = parseInt(btn.getAttribute('data-hero-index'));
        const itemName = btn.getAttribute('data-item');
        const result = this.state.useConsumable(itemName, hIdx);
        if (result.success) {
          this.context.playSFX('reward');
          this.context.log(result.log || `Used ${itemName}.`, "success");
          this.open(this.state.party[hIdx].name); // Re-render
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not use item.', "warning");
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

    const prayBtn = this.contentEl.querySelector('#sheet-study-prayers-btn');
    if (prayBtn) {
      prayBtn.addEventListener('click', () => {
        this.context.onUIAction('STUDY_PRAYERS');
        const cleric = this.state.party.find(p => p.classKey === 'cleric');
        if (cleric) this.open(cleric.name);
      });
    }
  }

  close() {
    if (this.modal && this.modal.style.display !== 'none') {
      this.modal.style.display = 'none';
      this.context.playSFX('sheet');
    }
  }
}