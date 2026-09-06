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
    const heroIndex = this.state.party.findIndex(p => p && p.name === heroName);
    if (heroIndex === -1) return;
    const hero = this.state.party[heroIndex];
    this.currentHeroIndex = heroIndex;

    this.titleEl.textContent = `${(hero.name || 'Hero').toUpperCase()} — LEVEL ${hero.level || 1} ${(hero.className || 'Adventurer').toUpperCase()}`;

    const attrs = hero.attributes;
    const statsHTML = `
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #0d1117; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>Strength: <b style="color:var(--text-parchment);">${attrs.strength}</b></div>
      <div>Dexterity: <b style="color:var(--text-parchment);">${attrs.dexterity}</b></div>
      <div>Constitution: <b style="color:var(--text-parchment);">${attrs.constitution}</b></div>
      <div>Intelligence: <b style="color:var(--text-parchment);">${attrs.intelligence}</b></div>
      <div>Wisdom: <b style="color:var(--text-parchment);">${attrs.wisdom}</b></div>
      <div>Charisma: <b style="color:var(--text-parchment);">${attrs.charisma}</b></div>
    </div>`;

    // Dynamic Buff Indicators
    const activeBuffs = [];
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
    if (hero.classKey === 'fighter' && hero.specializedWeapon && hero.equippedWeapon === hero.specializedWeapon) {
      activeBuffs.push(`<span style="background:#2a1b04;color:#ffd700;border:1px solid #d29922;padding:3px 8px;border-radius:3px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px;">⚔️ Specialized: +1 to-hit / +2 dmg (${hero.specializedWeapon})</span>`);
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
    const effectiveAc = baseAc - activeSpellAc;

    const combatHTML = `
    <div style="display: flex; justify-content: space-between; background: #161b22; padding: 10px 14px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
      <div>HP: <b style="color:#3fb950; font-size: 13px;">${hero.hp}/${hero.maxHp}</b></div>
      <div>AC: <b style="color:var(--accent-gold); font-size: 13px;">${effectiveAc}</b>${activeSpellAc > 0 ? ` <span style="color:#79c0ff; font-size: 11px;">(-${activeSpellAc})</span>` : ''}</div>
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
      const heldLoad = (hero.spells || []).filter(s => !s.spent).reduce((sum, s) => sum + (s.cognitive_load || 0), 0);
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
            <span>[L${s.level}] <b>${s.name}</b> <span style="color:var(--text-muted);font-size:10px;">(load ${s.cognitive_load || '?'})</span></span>
            ${castBtn}
          </li>`;
        }).join('');

      const grimoireEntries = (hero.spells || []).map((s, idx) => {
        const statusBadge = s.spent
          ? '<span style="color: #8b949e; font-size: 10px;">[In Grimoire]</span>'
          : '<span style="color: #3fb950; font-size: 10px;">[Memorized]</span>';
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
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">⚡ Vancian Arcane Metrics</div>
        <div>Cognition: <b style="color:#d2a8ff;">${hero.cognition}/${hero.maxCognition}</b> <span style="color:var(--text-muted);font-size:10px;">(held burden: ${heldLoad})</span></div>
        
        <div style="margin-top: 8px; font-weight: bold; color: var(--gold-tsr); font-size: 11px;">Active Constructs Held in Mind:</div>
        <ul style="margin: 4px 0 6px 4px; padding: 0; list-style: none;">
          ${preparedList || '<li style="color: var(--text-muted); font-style: italic; font-size: 11px;">No constructs currently held in mind (0 burden). Mind is completely free.</li>'}
        </ul>

        <div style="margin-top: 8px; font-weight: bold; color: var(--gold-tsr); font-size: 11px; border-top: 1px solid var(--border-iron); padding-top: 6px;">📖 Grimoire Inscriptions:</div>
        <ul style="margin: 4px 0 0 0; padding: 0; list-style: none;">
          ${grimoireEntries || '<li style="color: var(--text-muted); font-style: italic; font-size: 11px;">No spells inscribed in grimoire.</li>'}
        </ul>

        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-grimoire-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${unmemorizedCount === 0 || hero.hp <= 0 ? 'disabled' : ''}>📖 Study Grimoire (Memorize All)</button>
          <span style="color:var(--text-muted);font-size:10px;">Commits grimoire formulas to active memory (deducts cognitive load).</span>
        </div>
      </div>`;
    } else if (hero.classKey === 'cleric') {
      const invokedCount = (hero.spells || []).filter(s => s.spent).length;
      const prayersList = (hero.spells || []).map((s, idx) => {
        if (s.spent) {
          return `<li style="color: #484f58; text-decoration: line-through; margin-bottom: 3px; font-size: 11px;">[L${s.level}] ${s.name} (Invoked)</li>`;
        }
        const invokeBtn = !this.state.combat.active && hero.hp > 0 && hero.divineFavor > 0 && !hero.absoluteSilence
          ? `<button class="action-tab sheet-cast-prayer-btn" data-index="${idx}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Invoke</button>`
          : '';
        return `<li style="color: #58a6ff; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <span>[L${s.level}] <b>${s.name}</b> <span style="color:var(--text-muted);font-size:10px;">(${s.description || 'Granted'})</span></span>
          ${invokeBtn}
        </li>`;
      }).join('');
      specializedHTML = `
      <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;">
        <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">✨ Divine Communion Metrics</div>
        <div>Divine Favor: <b style="color:#58a6ff;">${hero.divineFavor}%</b> | Status: <b>${hero.ethosStatus}</b></div>
        <div style="margin-top: 6px;">Daily allotment:</div>
        <ul style="margin: 4px 0 0 4px; padding: 0; list-style: none;">${prayersList}</ul>
        <div style="margin-top:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button id="sheet-study-prayers-btn" class="action-tab" style="padding:4px 10px;font-size:10px;" ${invokedCount === 0 || hero.divineFavor <= 0 || hero.hp <= 0 ? 'disabled' : ''}>🙏 Petition Deity</button>
          <span style="color:var(--text-muted);font-size:10px;">No favor cost. Rest then petition to reopen slots.</span>
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
    }

    const equipped = hero.equippedWeapon || 'None';
    const equippedIsRanged = this.state.isRangedWeapon(hero.equippedWeapon);
    
    // Weapon Mastery Tracker for Gear Section
    const weaponMastery = hero.equippedWeapon ? this.state.getWeaponMastery(hero, hero.equippedWeapon) : null;
    const weaponUsageCount = hero.weaponUsage?.[hero.equippedWeapon] || 0;
    const masteryInfo = weaponMastery ? `
    <div style="background: #0a0b0e; padding: 8px; border: 1px solid #1a1e27; border-radius: 2px; margin-top: 6px; font-size: 11px;">
      <div style="color: var(--gold-tsr); font-weight: bold; margin-bottom: 4px;">${hero.equippedWeapon} — ${weaponMastery.tier.toUpperCase()}</div>
      <div style="color: var(--text-muted); margin-bottom: 3px;">Successful hits: ${weaponUsageCount}</div>
      ${weaponMastery.tier !== 'mastery' ? `<div style="color: var(--favor-blue); font-size: 10px;">Next tier at ${weaponMastery.tier === 'familiarity' ? '40 hits' : '15 hits'}</div>` : '<div style="color: #3fb950; font-size: 10px;">✓ Mastery reached</div>'}
      ${weaponMastery.atkBonus > 0 || weaponMastery.dmgBonus > 0 ? `<div style="color: #58a6ff; margin-top: 4px; font-size: 10px;">+${weaponMastery.atkBonus} to-hit${weaponMastery.dmgBonus > 0 ? `, +${weaponMastery.dmgBonus} damage` : ''}</div>` : ''}
    </div>` : '';

    const invItems = (hero.inventory || []);
    const invRows = invItems.length === 0
      ? `<div style="color:var(--text-muted);">Empty</div>`
      : invItems.map(i => {
        if (!i) return '';
        const itemName = typeof i === 'string' ? i : i.name;
        if (!itemName) return '';
        const itemDef = this.state.getItemDef(itemName);
        const isWeapon = this.state.isKnownWeapon(itemName);
        const isArmor = itemDef && itemDef.kind === 'armor';
        const isShield = itemDef && itemDef.kind === 'shield';
        const isEquipped = hero.equippedWeapon === itemName || 
                           (hero.equippedArmor && hero.equippedArmor.name === itemName) ||
                           (hero.equippedShield && hero.equippedShield.name === itemName);

        let equipBtn = '';
        if (isWeapon) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:8px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedWeapon === itemName) {
            equipBtn = `<span style="color:var(--gold-tsr);font-size:10px;margin-left:8px;font-weight:700;">[Wielded]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-weapon-btn" data-hero-index="${heroIndex}" data-weapon="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Equip</button>`;
          }
        } else if (isArmor) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:8px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedArmor && hero.equippedArmor.name === itemName) {
            equipBtn = `<span style="color:#79c0ff;font-size:10px;margin-left:8px;font-weight:700;">[Worn]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-armor-btn" data-hero-index="${heroIndex}" data-armor="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Equip Armor</button>`;
          }
        } else if (isShield) {
          const check = GameState.isClassAllowedItem(hero.classKey, itemName, itemDef);
          if (!check.allowed) {
            equipBtn = `<span style="color:var(--text-muted);font-size:10px;margin-left:8px;font-style:italic;" title="${check.reason}">(Class restricted)</span>`;
          } else if (hero.equippedShield && hero.equippedShield.name === itemName) {
            equipBtn = `<span style="color:#3fb950;font-size:10px;margin-left:8px;font-weight:700;">[Shielded]</span>`;
          } else {
            equipBtn = `<button class="action-tab equip-shield-btn" data-hero-index="${heroIndex}" data-shield="${itemName}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Equip Shield</button>`;
          }
        }
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px dashed #21262d;">
            <span>${i.amount || 1}× <b>${itemName}</b>${isWeapon && this.state.isRangedWeapon(itemName) ? ' <span style="color:var(--favor-blue);font-size:10px;">(ranged)</span>' : ''}${isArmor ? ` <span style="color:var(--accent-gold);font-size:10px;">(Base AC ${itemDef.baseAc})</span>` : ''}${isShield ? ` <span style="color:#3fb950;font-size:10px;">(-${itemDef.acBonus || 1} AC)</span>` : ''}</span>
            ${equipBtn}
          </div>`;
      }).filter(Boolean).join('');

    // Party Usable Consumables
    const partyInv = this.state.inventory || [];
    const usableRows = partyInv.filter(i => {
      const def = this.state.getItemDef(i.name);
      return def && def.usable;
    }).map(i => {
      const def = this.state.getItemDef(i.name);
      const qty = i.amount ?? i.count ?? 1;
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
          <span title="${def ? def.description : ''}">🧪 ${qty}× <b>${i.name}</b> <span style="color:var(--text-muted);font-size:10px;">(${def.description || 'Consumable'})</span></span>
          <button class="action-tab use-item-btn" data-hero-index="${heroIndex}" data-item="${i.name}" style="padding:2px 8px;font-size:10px;margin-left:8px;">Use</button>
        </div>`;
    }).join('') || `<div style="color:var(--text-muted);font-size:11px;">No usable potions or supplies in party pack.</div>`;

    // Party Dungeon Loot & Valuables (Gems, Jewelry, Quest Relics, Ammo, Supplies)
    const lootRows = partyInv.filter(i => {
      if (i.name === 'Gold Pieces') return false;
      const def = this.state.getItemDef(i.name);
      return !def || !def.usable;
    }).map(i => {
      const def = this.state.getItemDef(i.name);
      const qty = i.amount ?? i.count ?? 1;
      const isQuest = def && def.kind === 'quest';
      const isTreasure = def && (def.kind === 'treasure' || def.kind === 'gem');
      let icon = '📦';
      let tag = '';
      if (isQuest) {
        icon = '⭐';
        tag = `<span style="color:#ff7b72;font-size:10px;font-weight:700;">[Quest Artifact]</span>`;
      } else if (isTreasure) {
        icon = '💎';
        tag = `<span style="color:var(--gold-tsr);font-size:10px;">(${def.price || 30} gp value)</span>`;
      } else if (def && def.kind === 'ammo') {
        icon = '🏹';
      }

      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #21262d;">
          <span>${icon} ${qty}× <b>${i.name}</b> ${tag}</span>
          <span style="color:var(--text-muted);font-size:10px;">${def ? (def.description || '') : ''}</span>
        </div>`;
    }).join('') || `<div style="color:var(--text-muted);font-size:11px;">No gems or artifacts recovered yet.</div>`;

    const gearHTML = `
    <div style="background: #161b22; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; font-size: 12px;">
      <div style="color: var(--accent-gold); font-weight: bold; margin-bottom: 6px; font-size: 13px;">📦 Equipment & Worn Panoply</div>
      
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
            ${hero.equippedShield ? `🔰 ${hero.equippedShield.name} <span style="color: #3fb950; font-size: 10px;">(-${hero.equippedShield.acBonus || 1} AC)</span>` : '<span style="color: var(--text-muted);">None (No shield equipped)</span>'}
          </div>
          ${hero.equippedShield?.description ? `<div style="color: var(--text-muted); font-size: 10px; margin-top: 2px;">${hero.equippedShield.description}</div>` : ''}
        </div>
      </div>

      <div style="margin-bottom:6px;">Equipped Weapon: <b style="color:var(--gold-tsr);">${equipped}</b>
        ${equippedIsRanged ? '<span style="color:var(--favor-blue);font-size:10px;"> — ranged</span>' : '<span style="color:var(--text-muted);font-size:10px;"> — melee</span>'}
      </div>
      ${masteryInfo}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 8px 0 4px; font-size: 12px;">Personal Inventory</div>
      ${invRows}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 10px 0 4px; font-size: 12px;">Party Provisions & Usable Items</div>
      ${usableRows}
      <div style="color: var(--accent-gold); font-weight: bold; margin: 10px 0 4px; font-size: 12px;">Party Valuables & Dungeon Loot (Gems, Relics, Supplies)</div>
      ${lootRows}
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

    this.contentEl.innerHTML = levelUpBanner + statsHTML + buffsHTML + combatHTML + skillsHTML + specializedHTML + gearHTML;
    
    this.bindEvents();
    
    if (this.modal) this.modal.style.display = 'flex';
  }

  bindEvents() {
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
          this.context.playSFX('button');
          this.context.log(`${this.state.party[hIdx].name} equips ${result.equipped}.`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
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
          this.context.playSFX('button');
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
          this.context.playSFX('button');
          this.context.log(`${this.state.party[hIdx].name} readies ${result.equipped}.`, "success");
          this.open(this.state.party[hIdx].name);
          this.context.updateHUD();
        } else {
          this.context.log(result.reason || 'Could not ready shield.', "warning");
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
          this.open(this.state.party[hIdx].name);
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