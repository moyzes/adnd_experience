import { GameState } from './state.js';

export class ShopUI {
  constructor(state, context) {
    this.state = state;
    this.context = context; // { playSFX, log, updateHUD }
    
    // Cache DOM references
    this.modal = document.getElementById('shop-modal');
    this.listEl = document.getElementById('shop-list');
    this.goldEl = document.getElementById('shop-gold-val');
  }

  open() {
    if (this.state.combat.active) {
      return this.context.log("The outfitter will not deal during a fight.", "warning");
    }
    if (!this.state.isNearShop()) {
      const tile = this.state.getShopTile();
      return this.context.log(
        tile
          ? `The Thorn Outfitter keeps a stall at the chapel approach (minimap: gold tile near the entrance). Walk there to trade.`
          : `There is no outfitter nearby.`,
        "warning"
      );
    }

    if (!this.modal || !this.listEl) return;
    
    // Render the catalog and show modal
    this.renderList();
    this.modal.style.display = 'flex';
  }

  renderList() {
    if (this.goldEl) this.goldEl.textContent = this.state.getPartyGold();
    
    const entries = Object.entries(GameState.ITEM_CATALOG)
      .filter(([, def]) => def.kind !== 'currency' && def.price != null)
      .sort((a, b) => (a[1].price || 0) - (b[1].price || 0));

    this.listEl.innerHTML = entries.map(([name, def]) => {
      // Calculate how many the party/heroes currently own
      const owned = def.scope === 'party'
        ? this.state.getPartyItemQty(name)
        : (this.state.party.reduce((sum, h) => {
            const slot = (h.inventory || []).find(i => i.name === name);
            return sum + (slot ? (slot.amount || 1) : 0);
          }, 0));
      
      const scopeNote = def.scope === 'personal' ? ' → personal kit' : ' → party pack';
      
      return `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px; background:#0d1117; border:1px solid var(--border-iron); border-radius:3px;">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:bold; color:var(--gold-tsr); font-size:12px;">${name} <span style="color:var(--text-muted); font-weight:normal; font-size:10px;">${def.price} gp</span></div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${def.description || ''}${scopeNote}</div>
          <div style="font-size:10px; color:#8b949e; margin-top:2px;">Owned: ${owned}</div>
        </div>
        <button class="action-tab shop-buy-btn" data-item="${name}" style="padding:6px 10px; font-size:10px; white-space:nowrap;">Buy</button>
      </div>`;
    }).join('');

    this.bindEvents();
  }

  bindEvents() {
    this.listEl.querySelectorAll('.shop-buy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemName = btn.getAttribute('data-item');
        const def = this.state.getItemDef(itemName);
        
        let heroIdx = null;
        if (def && def.scope === 'personal') {
          // Send thief tools directly to the thief, otherwise send to first living hero
          if (itemName === 'Thief Tools') {
            heroIdx = this.state.party.findIndex(p => p.classKey === 'thief');
          } else {
            heroIdx = this.state.party.findIndex(p => p.hp > 0);
          }
          if (heroIdx < 0) heroIdx = 0;
        }

        const result = this.state.buyItem(itemName, 1, heroIdx);
        if (result.success) {
          this.context.playSFX('coins');
          const where = result.destination === 'personal' ? `${result.heroName}'s pack` : 'the party pack';
          this.context.log(`Purchased ${itemName} for ${result.total} gp → ${where}.`, "success");
          
          // Re-render the shop list to instantly update gold and "Owned" counts
          this.renderList(); 
          this.context.updateHUD(); // Update the global HUD gold tracker
        } else {
          this.context.log(result.reason || 'Purchase failed.', "warning");
        }
      });
    });
  }

  close() {
    if (this.modal && this.modal.style.display !== 'none') {
      this.modal.style.display = 'none';
    }
  }
}