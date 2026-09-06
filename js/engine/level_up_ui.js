import { GameState } from './state.js';

export class LevelUpUI {
  constructor(state, context) {
    this.state = state;
    this.context = context; // { playSFX, log, updateHUD, flashLevelUpCard }

    this.modal = document.getElementById('level-up-modal');
    this.titleEl = document.getElementById('level-up-title');
    this.bodyEl = document.getElementById('level-up-body');
    this.actionsEl = document.getElementById('level-up-actions');

    this.currentHeroIndex = null;
    this.currentOptions = null;
    this.skillAllocations = {};
    this.selectedSpellIds = new Set();
    this.thiefPointsLeft = 15;
  }

  open(heroIndex) {
    const hero = this.state.party[heroIndex];
    if (!hero) return;

    if (this.state.combat.active) {
      return this.context.log("You cannot undertake rigorous training in the middle of combat!", "warning");
    }

    if (!this.state.canPartyTrain()) {
      return this.context.log(`Mentors and quiet sanctuaries are only found in towns or villages. Return to the surface or outpost to train ${hero.name}.`, "warning");
    }

    if (!hero.canLevelUp) {
      return this.context.log(`${hero.name} has not accumulated enough experience to level up yet (${hero.xp}/${hero.nextLevelXp} XP).`, "info");
    }

    this.currentHeroIndex = heroIndex;
    this.currentOptions = this.state.calculateLevelUpOptions(heroIndex);
    if (!this.currentOptions) return;

    // Reset temporary state for allocation
    this.skillAllocations = {
      pick_locks: 0,
      find_traps: 0,
      pick_pockets: 0,
      hide_in_shadows: 0,
      hear_noise: 0
    };
    this.thiefPointsLeft = this.currentOptions.thiefPoints || 15;
    this.selectedSpellIds = new Set();
    this.selectedSpecializedWeapon = this.currentOptions.specializedWeapon || 'Longsword';

    // Auto-select first 2 spells if available
    if (this.currentOptions.availableSpells && this.currentOptions.availableSpells.length > 0) {
      this.currentOptions.availableSpells.slice(0, 2).forEach(s => this.selectedSpellIds.add(s.id));
    }

    this.render();
    if (this.modal) {
      this.modal.style.display = 'flex';
    }
  }

  close() {
    if (this.modal) {
      this.modal.style.display = 'none';
    }
  }

  render() {
    if (!this.modal || !this.titleEl || !this.bodyEl || !this.actionsEl) return;

    const opt = this.currentOptions;
    const hero = this.state.party[this.currentHeroIndex];
    const classIcon = opt.classKey === 'fighter' ? '🛡️' : opt.classKey === 'thief' ? '🗡️' : opt.classKey === 'cleric' ? '✨' : '🔮';

    this.titleEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span>⭐ ${classIcon} ${opt.heroName.toUpperCase()} — LEVEL ${opt.currentLevel} → ${opt.nextLevel}</span>
        <span style="font-size: 11px; background: rgba(210,153,34,0.2); border: 1px solid var(--accent-gold); color: var(--accent-gold); padding: 2px 8px; border-radius: 3px;">TOWN TRAINING</span>
      </div>
    `;

    // Flavor narrative based on class
    let loreSnippet = "";
    if (opt.classKey === 'fighter') {
      loreSnippet = "Under the tutelage of veteran armsmen in the village barracks, drills and weapon sparring refine martial edge and steadfast grit.";
    } else if (opt.classKey === 'thief') {
      loreSnippet = "Conferring with shadowy guild contacts in secluded alleys, tradecraft secrets and delicate tumbler techniques are mastered.";
    } else if (opt.classKey === 'cleric') {
      loreSnippet = "In solemn vigil before the sanctuary altar, sacred anointing deepens communion with the divine spheres.";
    } else if (opt.classKey === 'mage') {
      loreSnippet = "Sequestered within study chambers, complex astral geometries and grimoire formulae are committed to active memory.";
    }

    // Class specific choice section
    let classChoicesHTML = "";

    if (opt.classKey === 'thief') {
      const skills = opt.skills;
      const skillRows = [
        { key: 'pick_locks', name: 'Pick Locks' },
        { key: 'find_traps', name: 'Find / Disarm Traps' },
        { key: 'pick_pockets', name: 'Pick Pockets' },
        { key: 'hide_in_shadows', name: 'Hide in Shadows' },
        { key: 'hear_noise', name: 'Hear Noise' }
      ].map(s => {
        const baseVal = skills[s.key]?.base || 15;
        const allocated = this.skillAllocations[s.key] || 0;
        const totalVal = baseVal + allocated;
        return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; margin-bottom: 4px;">
            <div>
              <span style="font-weight: bold; color: var(--gold-tsr); font-size: 11px;">${s.name}</span>
              <span style="font-size: 11px; color: var(--text-parchment); margin-left: 6px;">${baseVal}% → <b style="color: #3fb950;">${totalVal}%</b></span>
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button class="thief-skill-dec tsr-sq-btn" data-skill="${s.key}" style="padding: 2px 8px; height: 24px; font-size: 12px; line-height: 1;" ${allocated <= 0 ? 'disabled' : ''}>-</button>
              <span style="min-width: 24px; text-align: center; font-weight: bold; color: var(--accent-gold); font-size: 11px;">+${allocated}%</span>
              <button class="thief-skill-inc tsr-sq-btn" data-skill="${s.key}" style="padding: 2px 8px; height: 24px; font-size: 12px; line-height: 1;" ${this.thiefPointsLeft <= 0 || totalVal >= 99 ? 'disabled' : ''}>+</button>
            </div>
          </div>
        `;
      }).join('');

      classChoicesHTML = `
        <div style="margin-top: 10px; border-top: 1px solid var(--border-steel); padding-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: bold; color: var(--accent-gold); font-size: 12px;">🗡️ Discretionary Skill Points</span>
            <span style="font-size: 11px; background: #161b22; padding: 2px 8px; border: 1px solid var(--border-iron); border-radius: 3px; color: ${this.thiefPointsLeft > 0 ? '#3fb950' : 'var(--text-muted)'};">
              <b>${this.thiefPointsLeft}</b> points left to distribute
            </span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
            In AD&D 2e, Thieves receive 15 discretionary percentage points upon leveling to customize their tradecraft.
          </div>
          <div>${skillRows}</div>
        </div>
      `;
    } else if (opt.classKey === 'mage') {
      const spells = opt.availableSpells || [];
      let spellChoices = "";
      if (spells.length > 0) {
        spellChoices = spells.map(s => {
          const checked = this.selectedSpellIds.has(s.id) ? 'checked' : '';
          return `
            <label style="display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; margin-bottom: 4px; cursor: pointer;">
              <input type="checkbox" class="mage-spell-choice" value="${s.id}" ${checked} style="margin-top: 3px; accent-color: var(--accent-gold);">
              <div style="flex: 1;">
                <div style="font-weight: bold; color: #d2a8ff; font-size: 11px;">${s.name} <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Tier ${s.tier || 1} • Load: ${s.cognitive_load || 20})</span></div>
                <div style="font-size: 10px; color: var(--text-muted);">${s.description || ''}</div>
              </div>
            </label>
          `;
        }).join('');
      } else {
        spellChoices = `<div style="font-size: 10px; color: var(--text-muted); font-style: italic;">All standard grimoire constructs up to Tier ${opt.nextLevel >= 9 ? 4 : opt.nextLevel >= 6 ? 3 : opt.nextLevel >= 3 ? 2 : 1} are currently transcribed.</div>`;
      }

      classChoicesHTML = `
        <div style="margin-top: 10px; border-top: 1px solid var(--border-steel); padding-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: bold; color: #d2a8ff; font-size: 12px;">🔮 Grimoire Scribing & Arcane Capacity</span>
            <span style="font-size: 10px; color: #3fb950; font-weight: bold;">+10 Max Cognition</span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
            Choose newly mastered constructs to scribe into your active memory repertoire:
          </div>
          <div style="max-height: 140px; overflow-y: auto; padding-right: 4px;">${spellChoices}</div>
        </div>
      `;
    } else if (opt.classKey === 'cleric') {
      const spells = opt.availableSpells || [];
      let spellChoices = "";
      if (spells.length > 0) {
        spellChoices = spells.map(s => {
          const checked = this.selectedSpellIds.has(s.id) ? 'checked' : '';
          return `
            <label style="display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; margin-bottom: 4px; cursor: pointer;">
              <input type="checkbox" class="cleric-spell-choice" value="${s.id}" ${checked} style="margin-top: 3px; accent-color: var(--accent-gold);">
              <div style="flex: 1;">
                <div style="font-weight: bold; color: var(--gold-tsr); font-size: 11px;">${s.name} <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Circle ${s.tier || 1})</span></div>
                <div style="font-size: 10px; color: var(--text-muted);">${s.description || ''}</div>
              </div>
            </label>
          `;
        }).join('');
      } else {
        spellChoices = `<div style="font-size: 10px; color: var(--text-muted); font-style: italic;">All sacred prayers up to Circle ${opt.nextLevel >= 9 ? 4 : opt.nextLevel >= 6 ? 3 : opt.nextLevel >= 3 ? 2 : 1} are currently revealed.</div>`;
      }

      classChoicesHTML = `
        <div style="margin-top: 10px; border-top: 1px solid var(--border-steel); padding-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-weight: bold; color: var(--gold-tsr); font-size: 12px;">✨ Sacred Invocations & Communion</span>
            <span style="font-size: 10px; color: #3fb950; font-weight: bold;">+5 Max Divine Favor</span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-bottom: 8px;">
            Select prayers revealed through your heightened spiritual communion:
          </div>
          <div style="max-height: 140px; overflow-y: auto; padding-right: 4px;">${spellChoices}</div>
        </div>
      `;
    } else if (opt.classKey === 'fighter') {
      const currentSpec = this.selectedSpecializedWeapon || opt.specializedWeapon || 'Longsword';
      const hits = (hero.weaponUsage && hero.weaponUsage[currentSpec]) || 0;
      const weaponsList = (opt.availableWeapons || ['Longsword', 'Two-Handed Sword', 'Warhammer', 'Short Sword', 'Mace', 'Halberd', 'Short Bow', 'Quarterstaff']).map(w => {
        const selected = w === currentSpec ? 'selected' : '';
        const wHits = (hero.weaponUsage && hero.weaponUsage[w]) || 0;
        return `<option value="${w}" ${selected}>${w} (${wHits} battle hits)</option>`;
      }).join('');

      classChoicesHTML = `
        <div style="margin-top: 10px; border-top: 1px solid var(--border-steel); padding-top: 10px;">
          <div style="font-weight: bold; color: var(--accent-gold); font-size: 12px; margin-bottom: 6px;">⚔️ Martial Weapon Specialization (AD&D 2e)</div>
          <div style="font-size: 11px; color: var(--text-parchment); margin-bottom: 6px;">
            Choose your weapon of specialized mastery (+1 to-hit, +2 damage). Stacks with battlefield weapon usage!
          </div>
          <div style="display: flex; gap: 8px; align-items: center; background: #0d1117; padding: 8px; border: 1px solid var(--border-iron); border-radius: 4px; margin-bottom: 8px;">
            <label style="font-size: 11px; color: var(--gold-tsr); font-weight: bold; white-space: nowrap;">Specialized Weapon:</label>
            <select id="fighter-spec-weapon-select" style="background: #161b22; color: #fff; border: 1px solid var(--gold-tsr); padding: 4px 8px; font-size: 11px; border-radius: 3px; flex: 1;">
              ${weaponsList}
            </select>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
            <div style="padding: 6px; background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px;">
              <span style="color: var(--text-muted);">Specialization Bonus:</span>
              <div style="font-weight: bold; color: #ffd700;">+1 To-Hit / +2 Damage</div>
            </div>
            <div style="padding: 6px; background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px;">
              <span style="color: var(--text-muted);">Base Attack Matrix:</span>
              <div style="font-weight: bold; color: #3fb950;">+${(opt.currentAtk + opt.atkGrowth).toFixed(2)} to-hit</div>
            </div>
          </div>
        </div>
      `;
    }

    this.bodyEl.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); font-style: italic; margin-bottom: 10px; line-height: 1.4;">
        "${loreSnippet}"
      </div>

      <!-- Core Attribute & HP Growth -->
      <div style="background: #0d1117; border: 1px solid var(--border-iron); border-radius: 4px; padding: 8px 10px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-weight: bold; color: var(--gold-tsr); font-size: 12px;">🎲 Hit Die & Vitality Gain</span>
          <span style="font-size: 11px; color: #3fb950; font-weight: bold;">+${opt.hpGain} Max HP</span>
        </div>
        <div style="font-size: 11px; color: var(--text-parchment); line-height: 1.4;">
          Hit Die: <b>1d${opt.hitDie}</b> (Rolled: <b>${opt.rolledDie}</b>) ${opt.conMod !== 0 ? `+ CON Mod: <b>${opt.conMod > 0 ? '+' + opt.conMod : opt.conMod}</b>` : ''} = <b>+${opt.hpGain} HP</b>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px;">
          <span>HP Progression: <b>${opt.currentMaxHp}</b> → <b style="color: #3fb950;">${opt.currentMaxHp + opt.hpGain}</b></span>
          <span>Attack Bonus: <b>+${opt.currentAtk.toFixed(2)}</b> → <b style="color: var(--gold-tsr);">+${(opt.currentAtk + opt.atkGrowth).toFixed(2)}</b></span>
        </div>
      </div>

      <!-- Class Specific Customization -->
      ${classChoicesHTML}
    `;

    // Render Action Buttons
    this.actionsEl.innerHTML = `
      <div style="display: flex; gap: 8px; width: 100%;">
        <button id="cancel-levelup-btn" class="action-tab" style="flex: 1; padding: 10px; font-size: 11px;">POSTPONE</button>
        <button id="confirm-levelup-btn" class="action-tab primary" style="flex: 2; padding: 10px; font-size: 11px; font-weight: bold; background: linear-gradient(180deg, #d29922 0%, #9e6a03 100%); border-color: var(--accent-gold); color: #fff;">⭐ COMPLETE TRAINING</button>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Thief skill buttons
    const incBtns = this.bodyEl.querySelectorAll('.thief-skill-inc');
    incBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skillKey = e.currentTarget.getAttribute('data-skill');
        if (this.thiefPointsLeft > 0) {
          const currentAlloc = this.skillAllocations[skillKey] || 0;
          const base = this.currentOptions.skills[skillKey]?.base || 15;
          if (base + currentAlloc < 99) {
            this.skillAllocations[skillKey] = currentAlloc + 1;
            this.thiefPointsLeft -= 1;
            this.render();
          }
        }
      });
    });

    const decBtns = this.bodyEl.querySelectorAll('.thief-skill-dec');
    decBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const skillKey = e.currentTarget.getAttribute('data-skill');
        const currentAlloc = this.skillAllocations[skillKey] || 0;
        if (currentAlloc > 0) {
          this.skillAllocations[skillKey] = currentAlloc - 1;
          this.thiefPointsLeft += 1;
          this.render();
        }
      });
    });

    // Mage / Cleric checkboxes
    const mageCbs = this.bodyEl.querySelectorAll('.mage-spell-choice');
    mageCbs.forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) this.selectedSpellIds.add(e.target.value);
        else this.selectedSpellIds.delete(e.target.value);
      });
    });

    const clericCbs = this.bodyEl.querySelectorAll('.cleric-spell-choice');
    clericCbs.forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) this.selectedSpellIds.add(e.target.value);
        else this.selectedSpellIds.delete(e.target.value);
      });
    });

    // Fighter Weapon Specialization select
    const specSelect = this.bodyEl.querySelector('#fighter-spec-weapon-select');
    if (specSelect) {
      specSelect.addEventListener('change', (e) => {
        this.selectedSpecializedWeapon = e.target.value;
      });
    }

    // Cancel / Postpone
    const cancelBtn = this.actionsEl.querySelector('#cancel-levelup-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Confirm Level Up
    const confirmBtn = this.actionsEl.querySelector('#confirm-levelup-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.handleConfirmLevelUp());
    }
  }

  handleConfirmLevelUp() {
    const opt = this.currentOptions;
    if (!opt) return;

    const chosenSpells = (opt.availableSpells || []).filter(s => this.selectedSpellIds.has(s.id));

    const payload = {
      hpGain: opt.hpGain,
      skillAllocations: this.skillAllocations,
      newSpells: chosenSpells,
      specializedWeapon: this.selectedSpecializedWeapon
    };

    const res = this.state.applyLevelUp(this.currentHeroIndex, payload);

    if (res.success) {
      if (this.context.playSFX) this.context.playSFX('level_up');
      if (this.context.flashLevelUpCard) this.context.flashLevelUpCard(this.currentHeroIndex);
      this.close();
      if (this.context.updateHUD) this.context.updateHUD();
    } else {
      if (this.context.log) this.context.log(res.reason || "Training could not be finalized.", "warning");
    }
  }
}
