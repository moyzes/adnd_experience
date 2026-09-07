import { GameState } from './state.js';

export class CharacterSheetUI {
  constructor(state, context) {
    this.state = state;
    this.context = context;
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
    const statsHTML = `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #0d1117; padding: 10px; border: 1px solid var(--border-steel); border-radius: 4px; margin-bottom: 12px; font-size: 12px;"><div>Strength: <b style="color:var(--text-parchment);">${attrs.strength}</b></div><div>Dexterity: <b style="color:var(--text-parchment);">${attrs.dexterity}</b></div><div>Constitution: <b style="color:var(--text-parchment);">${attrs.constitution}</b></div><div>Intelligence: <b style="color:var(--text-parchment);">${attrs.intelligence}</b></div><div>Wisdom: <b style="color:var(--text-parchment);">${attrs.wisdom}</b></div><div>Charisma: <b style="color:var(--text-parchment);">${attrs.charisma}</b></div></div>`;
    this.contentEl.innerHTML = statsHTML;
    this.bindEvents();
    if (this.modal) this.modal.style.display = 'flex';
  }

  bindEvents() {}

  close() {
    if (this.modal && this.modal.style.display !== 'none') {
      this.modal.style.display = 'none';
      this.context.playSFX('sheet');
    }
  }
}
