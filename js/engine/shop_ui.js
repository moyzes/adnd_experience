import { GameState } from './state.js';

export class ShopUI {
  constructor(state, context) {
    this.state = state;
    this.context = context; // { playSFX, log, updateHUD }
    
    this.currentMode = 'buy'; // 'buy' | 'sell'
    this.activeCategory = 'all'; // 'all' | 'weapons' | 'armor' | 'utilities'
    this.selectedHeroIndex = 0;

    // Cache DOM references
    this.modal = document.getElementById('shop-modal');
    this.listEl = document.getElementById('shop-list');
    this.goldEl = document.getElementById('shop-gold-val');
  }

  open() {
    if (this.state.combat.active) {
      return this.context.log("The outfitter will not trade during combat.", "warning");
    }
    if (!this.state.isNearShop()) {
      const tile = this.state.getShopTile();
      const shopName = (this.state.spec.shop && this.state.spec.shop.name) || 'The Outfitter';
      return this.context.log(
        tile
          ? `${shopName} is located nearby (minimap: gold shop marker). Walk there to trade.`
          : `There is no outfitter nearby.`,
        "warning"
      );
    }

    if (!this.modal || !this.listEl) return;
    
    this.currentMode = 'buy';
    this.activeCategory = 'all';
    this.render();
    this.modal.style.display = 'flex';
  }

  render() {
    if (this.goldEl) this.goldEl.textContent = this.state.getPartyGold();

    const partyGold = this.state.getPartyGold();
    const shopName = (this.state.spec.shop && this.state.spec.shop.name) || 'Village Outfitter';

    const headerHtml = `
      <div style="margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
          <div class="panel-header" style="font-size: 15px; margin:0; letter-spacing:0.5px;">🏪 ${shopName.toUpperCase()}</div>
          <button id="shop-close-inner-btn" class="action-tab" style="padding:4px 12px; font-size:10px;">CLOSE</button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; background:#0d1117; padding:8px 12px; border:1px solid var(--border-iron); border-radius:3px; margin-bottom: 10px;">
          <div style="font-size:11px; color:var(--parchment);">
            Expedition Treasury: <b style="color:var(--gold-tsr); font-size:13px;">${partyGold} gp</b>
          </div>
          <div style="display:flex; gap:6px;">
            <button id="shop-mode-buy" class="action-tab ${this.currentMode === 'buy' ? 'active' : ''}" style="padding:4px 14px; font-size:10px; font-weight:700; ${this.currentMode === 'buy' ? 'background:var(--gold-tsr); color:#000; border-color:var(--gold-tsr);' : ''}">
              🛒 BUY EQUIPMENT
            </button>
            <button id="shop-mode-sell" class="action-tab ${this.currentMode === 'sell' ? 'active' : ''}" style="padding:4px 14px; font-size:10px; font-weight:700; ${this.currentMode === 'sell' ? 'background:var(--gold-tsr); color:#000; border-color:var(--gold-tsr);' : ''}">
              💰 SELL ITEMS & LOOT
            </button>
          </div>
        </div>

        ${this.currentMode === 'buy' ? this.renderCategoryPills() : ''}
      </div>
    `;

    const contentHtml = this.currentMode === 'buy' ? this.renderBuyCatalog() : this.renderSellInventory();

    this.listEl.innerHTML = headerHtml + contentHtml;
    this.bindEvents();
  }

  renderCategoryPills() {
    const categories = [
      { id: 'all', label: 'All Items' },
      { id: 'weapons', label: '⚔️ Weapons' },
      { id: 'armor', label: '🛡️ Armor & Shields' },
      { id: 'utilities', label: '🧪 Utilities & Supplies' }
    ];

    return `
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        ${categories.map(c => `
          <button class="shop-cat-btn ${this.activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}"
            style="padding:4px 10px; font-size:10px; border-radius:3px; font-family:'Cinzel', serif; font-weight:700; cursor:pointer;
              background:${this.activeCategory === c.id ? '#21262d' : '#0d1117'};
              color:${this.activeCategory === c.id ? 'var(--gold-tsr)' : 'var(--text-muted)'};
              border:1px solid ${this.activeCategory === c.id ? 'var(--gold-tsr)' : 'var(--border-iron)'};">
            ${c.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  renderBuyCatalog() {
    const allEntries = Object.entries(GameState.ITEM_CATALOG)
      .filter(([, def]) => def.kind !== 'currency' && def.kind !== 'quest' && def.price != null && def.price > 0)
      .sort((a, b) => (a[1].price || 0) - (b[1].price || 0));

    const filtered = allEntries.filter(([, def]) => {
      if (this.activeCategory === 'all') return true;
      if (this.activeCategory === 'weapons') return def.kind === 'weapon';
      if (this.activeCategory === 'armor') return def.kind === 'armor' || def.kind === 'shield';
      if (this.activeCategory === 'utilities') return def.kind === 'consumable' || def.kind === 'ammo' || def.kind === 'gear';
      return true;
    });

    if (filtered.length === 0) {
      return `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:11px;">No items found in this category.</div>`;
    }

    const party = this.state.party;
    const partyGold = this.state.getPartyGold();

    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${filtered.map(([name, def]) => {
          const isPersonal = def.scope === 'personal';
          const canAfford = partyGold >= (def.price || 0);

          // Calculate how many are currently owned
          const owned = !isPersonal
            ? this.state.getPartyItemQty(name)
            : party.reduce((sum, h) => {
                const slot = (h.inventory || []).find(i => (typeof i === 'string' ? i === name : i.name === name));
                return sum + (slot ? (typeof slot === 'string' ? 1 : (slot.amount || 1)) : 0);
              }, 0);

          // Type Tag & Metric details
          let metricTag = '';
          if (def.kind === 'weapon') {
            const wInfo = GameState.WEAPON_CATALOG[name];
            const maxDmg = wInfo?.maxDmg || 8;
            const dmgType = wInfo?.damageType || 'slashing';
            const cat = wInfo?.category || 'melee';
            metricTag = `<span style="background:#281e0f; color:#f2cc60; border:1px solid #7a5e20; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">⚔️ 1d${maxDmg} ${dmgType} (${cat})</span>`;
          } else if (def.kind === 'armor') {
            metricTag = `<span style="background:#0f243d; color:#79c0ff; border:1px solid #1f6feb; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🛡️ Base AC ${def.baseAc} (${def.armorType || 'medium'})</span>`;
          } else if (def.kind === 'shield') {
            metricTag = `<span style="background:#0f243d; color:#79c0ff; border:1px solid #1f6feb; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🛡️ -${def.acBonus || 1} AC Bonus</span>`;
          } else if (def.kind === 'consumable') {
            metricTag = `<span style="background:#162b1a; color:#7ee787; border:1px solid #238636; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🧪 Consumable</span>`;
          } else if (def.kind === 'ammo') {
            metricTag = `<span style="background:#1c1d21; color:#d2a8ff; border:1px solid #6e40c9; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🏹 Ammunition</span>`;
          } else if (def.kind === 'gear') {
            metricTag = `<span style="background:#261b17; color:#ffab70; border:1px solid #bd561d; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🧰 Thieving Gear</span>`;
          }

          // Recipient controls
          let recipientControlHtml = '';
          if (isPersonal) {
            // Display buttons for eligible heroes
            const heroButtons = party.map((hero, hIdx) => {
              const check = GameState.isClassAllowedItem(hero.classKey, name, def);
              const allowed = check.allowed;
              const title = allowed 
                ? `Give ${name} to ${hero.name} (${hero.className})` 
                : `${hero.name} (${hero.className}) cannot equip: ${check.reason}`;

              if (allowed) {
                return `
                  <button class="shop-buy-hero-btn action-tab" 
                    data-item="${name}" 
                    data-hero-idx="${hIdx}" 
                    ${!canAfford ? 'disabled' : ''}
                    title="${title}"
                    style="padding:3px 8px; font-size:9px; font-weight:700; white-space:nowrap; ${canAfford ? 'border-color:#388bfd; color:#58a6ff;' : 'opacity:0.4;'}">
                    → ${hero.name} (${hero.className})
                  </button>
                `;
              } else {
                return `
                  <span title="${title}" style="padding:3px 6px; font-size:9px; color:#6e7681; background:#161b22; border:1px solid #30363d; border-radius:2px; cursor:help; white-space:nowrap;">
                    🚫 ${hero.name} <span style="font-size:8px; opacity:0.8;">(${hero.className})</span>
                  </span>
                `;
              }
            }).join('');

            recipientControlHtml = `
              <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:9px; color:var(--text-muted); margin-bottom:4px;">Select Recipient:</div>
                <div style="display:flex; gap:4px; flex-wrap:wrap; align-items:center;">
                  ${heroButtons}
                </div>
              </div>
            `;
          } else {
            // Party item purchase button
            recipientControlHtml = `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
                <span style="font-size:9px; color:#7ee787;">📦 Stored directly in Party Pack</span>
                <button class="shop-buy-party-btn action-tab" 
                  data-item="${name}" 
                  ${!canAfford ? 'disabled' : ''}
                  style="padding:4px 12px; font-size:10px; font-weight:700; white-space:nowrap; ${canAfford ? 'border-color:var(--gold-tsr); color:var(--gold-tsr);' : 'opacity:0.4;'}">
                  Buy for Party Pack (${def.price} gp)
                </button>
              </div>
            `;
          }

          return `
            <div style="background:#0d1117; border:1px solid var(--border-iron); border-radius:3px; padding:10px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="flex:1;">
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <b style="color:var(--gold-tsr); font-size:12px;">${name}</b>
                    <span style="color:#d29922; font-size:11px; font-weight:700;">${def.price} gp</span>
                    ${metricTag}
                  </div>
                  <div style="font-size:10px; color:var(--parchment); margin-top:3px; line-height:1.3;">
                    ${def.description || ''}
                  </div>
                </div>
                <div style="font-size:10px; color:#8b949e; text-align:right; white-space:nowrap;">
                  Owned: <b style="color:var(--parchment);">${owned}</b>
                </div>
              </div>

              ${recipientControlHtml}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderSellInventory() {
    const party = this.state.party;
    const sellableRows = [];

    // 1. Party Inventory (gems, jewelry, treasures, potions, ammo, supplies)
    const partyInv = this.state.inventory || [];
    partyInv.forEach(item => {
      const name = item.name;
      const qty = item.amount ?? item.count ?? 1;
      if (qty <= 0) return;
      if (name === 'Gold Pieces') return;

      const def = this.state.getItemDef(name);
      if (!def) return;

      const isQuest = def.kind === 'quest';
      let sellPrice = 0;
      if (def.kind === 'treasure' || def.kind === 'gem') {
        sellPrice = def.price || 30; // Appraised treasure value
      } else {
        sellPrice = Math.max(1, Math.floor((def.price || 2) * 0.5));
      }

      sellableRows.push({
        name,
        qty,
        def,
        sellPrice,
        isQuest,
        holderName: 'Party Pack',
        heroIndex: null,
        isEquipped: false
      });
    });

    // 2. Personal Inventories of each Hero (weapons, armor, shields, tools)
    party.forEach((hero, hIdx) => {
      const inv = hero.inventory || [];
      inv.forEach(slot => {
        const name = typeof slot === 'string' ? slot : slot.name;
        const qty = typeof slot === 'string' ? 1 : (slot.amount || 1);
        if (qty <= 0) return;

        const def = this.state.getItemDef(name);
        if (!def) return;

        const isQuest = def.kind === 'quest';
        let sellPrice = 0;
        if (def.kind === 'treasure' || def.kind === 'gem') {
          sellPrice = def.price || 30;
        } else {
          sellPrice = Math.max(1, Math.floor((def.price || 2) * 0.5));
        }

        const isEquipped = hero.equippedWeapon === name || 
                           (hero.equippedArmor && hero.equippedArmor.name === name) ||
                           (hero.equippedShield && hero.equippedShield.name === name);

        sellableRows.push({
          name,
          qty,
          def,
          sellPrice,
          isQuest,
          holderName: `${hero.name} (${hero.className})`,
          heroIndex: hIdx,
          isEquipped
        });
      });
    });

    if (sellableRows.length === 0) {
      return `
        <div style="text-align:center; padding:30px; background:#0d1117; border:1px solid var(--border-iron); border-radius:3px;">
          <div style="font-size:13px; color:var(--parchment); margin-bottom:4px;">No Sellable Items in Inventory</div>
          <div style="font-size:10px; color:var(--text-muted);">Explore dungeons and loot chests to find gems, jewelry, and salvaged weapons.</div>
        </div>
      `;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;">
          The outfitter will appraise treasures at full gold value, and buy surplus weaponry and supplies at 50% value.
        </div>

        ${sellableRows.map(row => {
          let kindBadge = '';
          if (row.isQuest) {
            kindBadge = `<span style="background:#3d1117; color:#ff7b72; border:1px solid #8e1519; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">⭐ Quest Relic</span>`;
          } else if (row.def.kind === 'treasure' || row.def.kind === 'gem') {
            kindBadge = `<span style="background:#2e1f00; color:#f2cc60; border:1px solid #9e6a03; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">💎 Appraised Treasure</span>`;
          } else if (row.isEquipped) {
            kindBadge = `<span style="background:#0f243d; color:#79c0ff; border:1px solid #1f6feb; padding:1px 5px; border-radius:2px; font-size:9px; font-weight:700;">🛡️ Equipped</span>`;
          }

          return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; background:#0d1117; border:1px solid var(--border-iron); border-radius:3px;">
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <b style="color:var(--gold-tsr); font-size:11px;">${row.name}</b>
                  <span style="font-size:10px; color:var(--parchment);">×${row.qty}</span>
                  ${kindBadge}
                  <span style="font-size:9px; color:#8b949e; background:#161b22; padding:1px 4px; border-radius:2px; border:1px solid #30363d;">${row.holderName}</span>
                </div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                  ${row.def.description || ''}
                </div>
                <div style="font-size:10px; color:#d29922; margin-top:2px; font-weight:700;">
                  Appraised: ${row.sellPrice} gp each ${row.qty > 1 ? `(${row.sellPrice * row.qty} gp total)` : ''}
                </div>
              </div>

              <div style="display:flex; gap:4px; align-items:center;">
                ${row.isQuest ? `
                  <button class="action-tab" disabled style="opacity:0.4; padding:4px 8px; font-size:9px; cursor:not-allowed;">Quest Locked</button>
                ` : `
                  <button class="shop-sell-btn action-tab" 
                    data-item="${row.name}" 
                    data-qty="1" 
                    data-hero-idx="${row.heroIndex != null ? row.heroIndex : ''}"
                    style="padding:4px 8px; font-size:9px; font-weight:700; border-color:#3fb950; color:#3fb950;">
                    Sell 1 (${row.sellPrice} gp)
                  </button>
                  ${row.qty > 1 ? `
                    <button class="shop-sell-btn action-tab" 
                      data-item="${row.name}" 
                      data-qty="${row.qty}" 
                      data-hero-idx="${row.heroIndex != null ? row.heroIndex : ''}"
                      style="padding:4px 8px; font-size:9px; font-weight:700; border-color:var(--gold-tsr); color:var(--gold-tsr);">
                      Sell All (${row.sellPrice * row.qty} gp)
                    </button>
                  ` : ''}
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  bindEvents() {
    // 1. Close Button inside modal
    const closeBtn = this.listEl.querySelector('#shop-close-inner-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // 2. Buy / Sell Mode Tabs
    const buyTab = this.listEl.querySelector('#shop-mode-buy');
    if (buyTab) buyTab.addEventListener('click', () => {
      this.currentMode = 'buy';
      this.render();
    });

    const sellTab = this.listEl.querySelector('#shop-mode-sell');
    if (sellTab) sellTab.addEventListener('click', () => {
      this.currentMode = 'sell';
      this.render();
    });

    // 3. Category Filter Pills
    this.listEl.querySelectorAll('.shop-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.getAttribute('data-cat') || 'all';
        this.render();
      });
    });

    // 4. Hero Purchase Buttons (Personal Equipment)
    this.listEl.querySelectorAll('.shop-buy-hero-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemName = btn.getAttribute('data-item');
        const heroIdx = parseInt(btn.getAttribute('data-hero-idx'), 10);
        this.executePurchase(itemName, 1, heroIdx);
      });
    });

    // 5. Party Pack Purchase Buttons (Consumables & Ammo)
    this.listEl.querySelectorAll('.shop-buy-party-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemName = btn.getAttribute('data-item');
        this.executePurchase(itemName, 1, null);
      });
    });

    // 6. Sell Buttons
    this.listEl.querySelectorAll('.shop-sell-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemName = btn.getAttribute('data-item');
        const qty = parseInt(btn.getAttribute('data-qty') || '1', 10);
        const heroIdxStr = btn.getAttribute('data-hero-idx');
        const heroIdx = heroIdxStr !== '' ? parseInt(heroIdxStr, 10) : null;
        this.executeSale(itemName, qty, heroIdx);
      });
    });
  }

  executePurchase(itemName, qty = 1, heroIdx = null) {
    const result = this.state.buyItem(itemName, qty, heroIdx);
    if (result.success) {
      this.context.playSFX('coins');
      const where = result.destination === 'personal' ? `${result.heroName}'s personal pack` : 'the expedition party pack';
      this.context.log(`Purchased ${itemName} for ${result.total} gp → ${where}.`, "success");
      
      this.render();
      this.context.updateHUD();
    } else {
      this.context.log(result.reason || 'Purchase failed.', "warning");
    }
  }

  executeSale(itemName, qty = 1, heroIdx = null) {
    const result = this.state.sellItem(itemName, qty, heroIdx);
    if (result.success) {
      this.context.playSFX('coins');
      const fromStr = result.fromSource === 'Party Pack' ? 'the party pack' : `${result.fromSource}'s pack`;
      this.context.log(`Sold ${result.qty}× ${result.itemName} from ${fromStr} for +${result.totalEarned} gp!`, "success");
      
      this.render();
      this.context.updateHUD();
    } else {
      this.context.log(result.reason || 'Sale failed.', "warning");
    }
  }

  close() {
    if (this.modal && this.modal.style.display !== 'none') {
      this.modal.style.display = 'none';
    }
  }
}
