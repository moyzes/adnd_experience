export class UIController {
    constructor(state, renderer2D, elements, callbacks) {
        this.state = state;
        this.renderer2D = renderer2D;
        this.elements = elements;
        this.callbacks = callbacks;

        this.hudCache = { heroes: [] };
        this.lastSig = null; // Cache signature to prevent redundant DOM thrashing during movement

        this.SVG_ICONS = {
            ATTACK: `<svg viewBox="0 0 24 24"><path d="M6.92 5L5 6.92l7.07 7.07 1.41-1.42L6.92 5zm11.78-1.78l-1.41 1.41 2.12 2.12 1.41-1.41-2.12-2.12zm-4.24 4.24l-8.49 8.49-1.41 2.83 2.83-1.41 8.49-8.49-1.42-1.42z"/></svg>`,
            SHOOT: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 13v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
            BACKSTAB: `<svg viewBox="0 0 24 24"><path d="M14.12 4l1.83 2 1.82-2L19 5.8 17.17 7.8 19 9.8 17.77 11 16 9.17 14.23 11 13 9.8l1.83-2L13 5.8 14.12 4zM3 21l8-8 1.42 1.42-8 8H3v-1.42z"/></svg>`,
            CAST: `<svg viewBox="0 0 24 24"><path d="M7.5 5.6L5 7l1.4-2.5L5 2l2.5 1.4L10 2 8.6 4.5 10 7 7.5 5.6zm12 9.8l-2.5 1.4 1.4 2.5-2.5-1.4-2.5 1.4 1.4-2.5-1.4-2.5 2.5 1.4 2.5-1.4-1.4 2.5 1.4 2.5zM20 3l-1 2.2L16.8 6l2.2 1 1 2.2 1-2.2 2.2-1-2.2-1.2L20 3zM2.5 21.5l14-14 1.4 1.4-14 14-1.4-1.4z"/></svg>`,
            DEFEND: `<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
            FIND: `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
            PICK: `<svg viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v2h2v-2h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`,
            DISARM: `<svg viewBox="0 0 24 24"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`,
            HIDE: `<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4C12.92 3.04 12.46 3 12 3z"/></svg>`,
            STEAL: `<svg viewBox="0 0 24 24"><path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h2v2c0 .55.45 1 1 1s1-.45 1-1V8h4v2c0 .55.45 1 1 1s1-.45 1-1V8h2v12z"/></svg>`,
            STUDY: `<svg viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>`,
            PRAY: `<svg viewBox="0 0 24 24"><path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/></svg>`,
            BASH: `<svg viewBox="0 0 24 24"><path d="M5 15.7l3.3-3.3 2.8 2.8-3.3 3.3zM18.7 4.3c-.8-.8-2.1-.8-2.8 0l-5.4 5.4 2.8 2.8 5.4-5.4c.8-.7.8-2 0-2.8zM2 20.5L3.5 22l4-4-1.5-1.5z"/></svg>`,
            SCOUT: `<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,
        };

        this.initListeners();
    }

    initPartyDOM() {
        this.elements.partyContainer.innerHTML = '';
        this.state.party.forEach((hero, index) => {
            const card = document.createElement('div');
            card.className = 'hero-card';
            card.id = `hero-card-${index}`;
            card.innerHTML = `
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span class="hero-name-click" data-hero-name="${hero.name}">
                      <span id="hero-avatar-${index}"></span> ${hero.name}
                    </span>
                    <span id="hero-hp-text-${index}" style="font-size: 10px;"></span>
                  </div>
                  <div class="hp-bar-bg"><div id="hero-hp-fill-${index}" class="hp-bar-fill"></div></div>
                  <div class="xp-row">
                    <span>LVL <b id="hero-lvl-val-${index}">${hero.level || 1}</b></span>
                    <span id="hero-xp-text-${index}">XP: ${hero.xp || 0}/${hero.nextLevelXp || 2000}</span>
                  </div>
                  <div class="xp-bar-bg"><div id="hero-xp-fill-${index}" class="xp-bar-fill"></div></div>
                  <div id="hero-secondary-${index}"></div>
                  <div id="hero-levelup-${index}"></div>
                </div>
                <div id="hero-actions-${index}"></div>
            `;
            this.elements.partyContainer.appendChild(card);

            this.hudCache.heroes.push({
                card,
                hpText: document.getElementById(`hero-hp-text-${index}`),
                hpFill: document.getElementById(`hero-hp-fill-${index}`),
                lvlVal: document.getElementById(`hero-lvl-val-${index}`),
                xpText: document.getElementById(`hero-xp-text-${index}`),
                xpFill: document.getElementById(`hero-xp-fill-${index}`),
                secondary: document.getElementById(`hero-secondary-${index}`),
                levelUp: document.getElementById(`hero-levelup-${index}`),
                actions: document.getElementById(`hero-actions-${index}`),
                avatar: document.getElementById(`hero-avatar-${index}`)
            });
        });
    }

    updateHUD(force = false) {
        this.renderer2D.render(this.state);
        this.elements.coordVal.textContent = `${this.state.player.x}, ${this.state.player.y}`;
        this.elements.dirVal.textContent = this.state.player.facing;

        const goldItem = this.state.inventory.find(i => i.name === "Gold Pieces");
        if (this.elements.goldVal) this.elements.goldVal.textContent = goldItem ? goldItem.amount : 0;

        const rationsItem = this.state.inventory.find(i => (i.name || "").toLowerCase().includes("ration"));
        const rationsVal = document.getElementById('rations-val');
        if (rationsVal) {
            rationsVal.textContent = rationsItem ? (rationsItem.amount !== undefined ? rationsItem.amount : rationsItem.count || 0) : 0;
        }

        const lockTarget = this.state.getLockInFront();
        const trapInFront = this.state.getTrapInFront();

        const partySig = this.state.party.map(h => `${h.canLevelUp ? 1 : 0}_${h.hp}_${h.level}`).join('_');
        // Build a lightweight signature of contextual UI triggers to prevent unnecessary DOM reconstruction on every step
        const currentSig = `${this.state.combat.active}_${this.state.player.x}_${this.state.player.y}_${this.state.player.facing}_${lockTarget ? lockTarget.x : ''}_${trapInFront ? trapInFront.detected : ''}_${this.state.activeNpc ? this.state.activeNpc.id : ''}_${partySig}`;

        if (!force && this.lastSig === currentSig && !this.state.combat.active) {
            // Context hasn't changed during exploration movement; skip heavy innerHTML DOM rebuilding
            return;
        }
        this.lastSig = currentSig;

        if (this.state.combat.active) {
            const existingBtn = document.getElementById('resolve-round-btn');
            if (!existingBtn || !existingBtn.disabled) {
                this.elements.globalActions.innerHTML = `<button id="resolve-round-btn" class="action-tab primary" style="width: 100%; padding: 10px; font-size: 11px;">🔥 RESOLVE ROUND ${this.state.combat.round}</button>`;
            }

            const aliveEnemies = this.state.combat.enemies.filter(e => e.hp > 0);
            this.#updateEnemyHpOverlay(aliveEnemies);

            const targetOptionsHTML = aliveEnemies.map(e =>
                `<option value="${e.instanceId}">${e.name} (HP: ${e.hp}/${e.maxHp})</option>`
            ).join('');

            this.state.party.forEach((hero, index) => {
                const cache = this.hudCache.heroes[index];
                const isInc = hero.hp <= 0;

                if (cache.levelUp) cache.levelUp.innerHTML = '';
                cache.card.className = isInc ? 'hero-card incapacitated' : 'hero-card';
                const avatarMap = { fighter: '🛡️', thief: '🗡️', cleric: '✨', mage: '🔮' };
                cache.avatar.textContent = avatarMap[hero.classKey] || '👤';
                cache.hpText.textContent = `HP: ${hero.hp}/${hero.maxHp}`;
                cache.hpText.style.color = isInc ? '#f85149' : '#3fb950';
                cache.hpFill.style.width = `${Math.max(0, Math.round((hero.hp / hero.maxHp) * 100))}%`;

                const curXp = hero.xp || 0;
                const targetXp = hero.nextLevelXp || 2000;
                const prevLevelXp = (hero.level > 1 && hero.xpTable && hero.xpTable[hero.level - 1]) ? hero.xpTable[hero.level - 1] : 0;
                const xpProgress = Math.min(100, Math.max(0, Math.round(((curXp - prevLevelXp) / Math.max(1, targetXp - prevLevelXp)) * 100)));

                if (cache.lvlVal) cache.lvlVal.textContent = hero.level || 1;
                if (cache.xpText) cache.xpText.textContent = `XP: ${curXp}/${targetXp}`;
                if (cache.xpFill) cache.xpFill.style.width = `${xpProgress}%`;

                // Keep secondary metrics visible in combat (cognition / divine favor / tools)
                if (hero.classKey === 'mage' && hero.maxCognition) {
                    const cogPct = Math.round((hero.cognition / hero.maxCognition) * 100);
                    cache.secondary.innerHTML = `<div class="metric-label"><span>Cognition</span><span>${hero.cognition}/${hero.maxCognition}</span></div><div class="status-bar-bg"><div class="cognition-fill" style="width: ${cogPct}%;"></div></div>`;
                } else if (hero.classKey === 'cleric' && hero.maxDivineFavor) {
                    const favorPct = Math.round((hero.divineFavor / hero.maxDivineFavor) * 100);
                    cache.secondary.innerHTML = `<div class="metric-label"><span>Divine Favor</span><span>${hero.divineFavor}%</span></div><div class="status-bar-bg"><div class="favor-fill" style="width: ${favorPct}%;"></div></div>`;
                } else if (hero.classKey === 'thief') {
                    cache.secondary.innerHTML = `<div class="metric-label"><span>Tools</span><span>${hero.toolsDurability}%</span></div><div class="status-bar-bg"><div class="tools-fill" style="width: ${hero.toolsDurability}%;"></div></div>`;
                } else {
                    cache.secondary.innerHTML = '';
                }

                let combatActions = '';
                if (isInc) {
                    cache.card.classList.remove('channeling');
                    combatActions = `<div class="incapacitated-badge">💀 INCAPACITATED</div>`;
                } else {
                    const activeCmd = this.state.combat.queuedCommands[index];
                    const queuedType = activeCmd ? activeCmd.type : null;
                    const isAttackQueued = queuedType === 'ATTACK' ? 'queued' : '';
                    const isShootQueued = queuedType === 'SHOOT' ? 'queued' : '';
                    const isGuardQueued = queuedType === 'GUARD' ? 'queued' : '';
                    const isSpecialQueued = (queuedType === 'BACKSTAB' || queuedType === 'CAST' || queuedType === 'PRAY' || queuedType === 'TURN') ? 'queued' : '';
                    const isChanneling = queuedType === 'CAST' && hero.classKey === 'mage';

                    if (isChanneling) cache.card.classList.add('channeling');
                    else cache.card.classList.remove('channeling');

                    // Class special: thief backstab; mage constructs; cleric prayers
                    let specialBtn = '';
                    if (hero.classKey === 'thief' && hero.isStealth) {
                        specialBtn = `<button class="tsr-sq-btn cmd-btn ${isSpecialQueued}" data-hero="${index}" data-cmd="BACKSTAB">${this.SVG_ICONS.BACKSTAB}<span class="btn-word">Stab</span></button>`;
                    } else if (hero.classKey === 'mage' && hero.spells) {
                        const queuedSpellIdx = (queuedType === 'CAST' && activeCmd) ? activeCmd.spellIndex : null;
                        specialBtn = hero.spells.map((s, sIdx) => {
                            if (s.spent) return '';
                            const q = queuedSpellIdx === sIdx ? 'queued' : '';
                            const short = (s.name || 'Spell').split(' ')[0];
                            return `<button class="tsr-sq-btn cmd-btn spell-action ${q}" data-hero="${index}" data-cmd="CAST" data-spell-index="${sIdx}" title="${s.name}">${this.SVG_ICONS.CAST}<span class="btn-word">${short}</span></button>`;
                        }).join('');
                    } else if (hero.classKey === 'cleric' && hero.divineFavor > 0 && !hero.absoluteSilence) {
                        const queuedPrayIdx = (queuedType === 'PRAY' && activeCmd) ? activeCmd.spellIndex : null;
                        const prayBtns = (hero.spells || []).map((s, sIdx) => {
                            if (s.spent) return '';
                            const q = queuedPrayIdx === sIdx ? 'queued' : '';
                            const short = (s.name || 'Pray').split(' ')[0];
                            return `<button class="tsr-sq-btn cmd-btn prayer-action ${q}" data-hero="${index}" data-cmd="PRAY" data-spell-index="${sIdx}" title="${s.name}">${this.SVG_ICONS.PRAY}<span class="btn-word">${short}</span></button>`;
                        }).join('');
                        const hasUndead = this.state.combat.enemies.some(e => e.hp > 0 && e.creatureType === 'undead');
                        const turnQ = queuedType === 'TURN' ? 'queued' : '';
                        const turnBtn = hasUndead
                            ? `<button class="tsr-sq-btn cmd-btn prayer-action ${turnQ}" data-hero="${index}" data-cmd="TURN" title="Turn Undead">${this.SVG_ICONS.PRAY}<span class="btn-word">Turn</span></button>`
                            : '';
                        specialBtn = `${turnBtn}${prayBtns}`;
                    }

                    // Guard / channeling status
                    let statusHint = '';
                    if (isChanneling && activeCmd) {
                        const sp = hero.spells && hero.spells[activeCmd.spellIndex];
                        const spName = sp ? sp.name : 'a spell';
                        statusHint = `<div class="channeling-badge">🔮 CHANNELING — ${spName}</div>`;
                    } else if (queuedType === 'GUARD' && activeCmd) {
                        const gIdx = activeCmd.guardTargetIndex;
                        if (gIdx === index) statusHint = `<div style="font-size:9px;color:var(--favor-blue);margin-top:3px;">Guarding self (+1 AC)</div>`;
                        else if (gIdx != null && this.state.party[gIdx]) statusHint = `<div style="font-size:9px;color:var(--favor-blue);margin-top:3px;">Shielding ${this.state.party[gIdx].name}</div>`;
                    }

                    // While channeling: only spell buttons remain (can switch construct); martial locked
                    let actionGrid;
                    if (isChanneling) {
                        actionGrid = `<div class="card-actions-grid">${specialBtn}</div>`;
                    } else {
                        const canShoot = this.state.canHeroShoot(hero);
                        const canMelee = this.state.canHeroMelee(hero);
                        const shootBtn = canShoot
                            ? `<button class="tsr-sq-btn cmd-btn ${isShootQueued}" data-hero="${index}" data-cmd="SHOOT">${this.SVG_ICONS.SHOOT}<span class="btn-word">Shoot</span></button>`
                            : '';
                        const strikeBtn = canMelee
                            ? `<button class="tsr-sq-btn cmd-btn ${isAttackQueued}" data-hero="${index}" data-cmd="ATTACK">${this.SVG_ICONS.ATTACK}<span class="btn-word">Strike</span></button>`
                            : '';
                        actionGrid = `<div class="card-actions-grid">
                      ${strikeBtn}
                      ${shootBtn}
                      <button class="tsr-sq-btn cmd-btn ${isGuardQueued}" data-hero="${index}" data-cmd="GUARD">${this.SVG_ICONS.DEFEND}<span class="btn-word">Guard</span></button>
                      ${specialBtn}
                    </div>`;
                    }

                    combatActions = `
                    <div style="margin-bottom: 4px;">
                      <select class="target-select" data-hero="${index}" style="width: 100%; font-size: 10px; background: #0d1117; color: var(--gold-tsr); border: 1px solid var(--border-iron); border-radius: 2px; padding: 2px;">
                        ${targetOptionsHTML}
                      </select>
                    </div>
                    ${actionGrid}
                    ${statusHint}`;
                }

                cache.actions.innerHTML = combatActions;
                const selectEl = cache.actions.querySelector('.target-select');
                if (selectEl) {
                    const existingCmd = this.state.combat.queuedCommands[index] || this.state.combat.previousCommands[index] || { type: 'ATTACK' };
                    if (existingCmd.targetInstanceId) selectEl.value = existingCmd.targetInstanceId;
                }
            });
        } else {
            this.#updateEnemyHpOverlay([]);
            this.elements.globalActions.innerHTML = `
              <button id="open-btn" class="action-tab">🔓 Open (Object)</button>
              <button id="shop-btn" class="action-tab">🏪 Outfitter</button>
              <button id="rest-btn" class="action-tab primary">⛺ Rest & Camp</button>`;

            this.state.party.forEach((hero, index) => {
                const cache = this.hudCache.heroes[index];
                let cardActions = '';
                let secondaryMetricBar = '';
                const isInc = hero.hp <= 0;

                cache.card.classList.remove('channeling');
                cache.card.className = isInc ? 'hero-card incapacitated' : 'hero-card';
                const avatarMap = { fighter: '🛡️', thief: '🗡️', cleric: '✨', mage: '🔮' };
                cache.avatar.textContent = avatarMap[hero.classKey] || '👤';
                cache.hpText.textContent = `HP: ${hero.hp}/${hero.maxHp}`;
                cache.hpText.style.color = isInc ? '#f85149' : '#3fb950';
                cache.hpFill.style.width = `${Math.max(0, Math.round((hero.hp / hero.maxHp) * 100))}%`;

                const curXp = hero.xp || 0;
                const targetXp = hero.nextLevelXp || 2000;
                const prevLevelXp = (hero.level > 1 && hero.xpTable && hero.xpTable[hero.level - 1]) ? hero.xpTable[hero.level - 1] : 0;
                const xpProgress = Math.min(100, Math.max(0, Math.round(((curXp - prevLevelXp) / Math.max(1, targetXp - prevLevelXp)) * 100)));

                if (cache.lvlVal) cache.lvlVal.textContent = hero.level || 1;
                if (cache.xpText) cache.xpText.textContent = `XP: ${curXp}/${targetXp}`;
                if (cache.xpFill) cache.xpFill.style.width = `${xpProgress}%`;

                if (isInc) {
                    cardActions = `<div class="incapacitated-badge">💀 INCAPACITATED</div>`;
                } else if (hero.classKey === 'fighter') {
                    secondaryMetricBar = `<div class="metric-label"><span>Tactical Guard</span><span>100%</span></div><div class="status-bar-bg"><div class="guard-fill" style="width: 100%;"></div></div>`;
                    if (lockTarget && lockTarget.methods?.includes('brute')) {
                        cardActions = `<div class="card-actions-grid"><button id="bash-btn" class="tsr-sq-btn">${this.SVG_ICONS.BASH}<span class="btn-word">Bash</span></button></div>`;
                    } else {
                        cardActions = `<div style="font-size: 9px; color: var(--text-muted); padding-top: 6px;">Ready (Melee Stance)</div>`;
                    }
                } else if (hero.classKey === 'thief') {
                    let disarmBtnHTML = trapInFront && trapInFront.detected ? `<button id="disarm-trap-btn" class="tsr-sq-btn">${this.SVG_ICONS.DISARM}<span class="btn-word">Disarm</span></button>` : '';
                    const pickLockBtnHTML = lockTarget && lockTarget.methods?.includes('mechanical') ? `<button id="pick-lock-btn" class="tsr-sq-btn">${this.SVG_ICONS.PICK}<span class="btn-word">Pick</span></button>` : '';
                    const pickpocketBtnHTML = this.state.activeNpc ? `<button id="pickpocket-npc-btn" class="tsr-sq-btn">${this.SVG_ICONS.STEAL}<span class="btn-word">Steal</span></button>` : '';
                    const scoutBtnHTML = this.state.isFacingWall()
                      ? ''
                      : `<button id="scout-btn" class="tsr-sq-btn">${this.SVG_ICONS.SCOUT}<span class="btn-word">Scout</span></button>`;
                    secondaryMetricBar = `<div class="metric-label"><span>Tools</span><span>${hero.toolsDurability}%</span></div><div class="status-bar-bg"><div class="tools-fill" style="width: ${hero.toolsDurability}%;"></div></div>`;
                    cardActions = `<div class="card-actions-grid">
  <button id="find-trap-btn" class="tsr-sq-btn">${this.SVG_ICONS.FIND}<span class="btn-word">Find</span></button>
  ${scoutBtnHTML}
  ${disarmBtnHTML}${pickLockBtnHTML}${pickpocketBtnHTML}
  <button id="hide-shadows-btn" class="tsr-sq-btn ${hero.isStealth ? 'queued' : ''}">${this.SVG_ICONS.HIDE}<span class="btn-word">Hide</span></button>
</div>`;
                } else if (hero.classKey === 'mage') {
                    let spellsButtonsHTML = (hero.spells || []).map((s, idx) => {
                        if (s.spent) {
                            return `<button class="tsr-sq-btn spell-action disabled" disabled title="${s.name} (erased)">${this.SVG_ICONS.CAST}<span class="btn-word">${(s.name || '').split(' ')[0]}</span></button>`;
                        }
                        return `<button class="tsr-sq-btn mage-spell-btn spell-action" data-index="${idx}" title="${s.name}">${this.SVG_ICONS.CAST}<span class="btn-word">${(s.name || '').split(' ')[0]}</span></button>`;
                    }).join('');
                    if (lockTarget && lockTarget.methods?.includes('arcane')) {
                        spellsButtonsHTML += `<button id="read-magic-btn" class="tsr-sq-btn">${this.SVG_ICONS.READ}<span class="btn-word">Read</span></button>`;
                    }
                    cardActions = `<div class="card-actions-grid">${spellsButtonsHTML || '<span style="font-size:9px;color:var(--text-muted);">No constructs held</span>'}</div>`;
                    const cogPct = Math.round((hero.cognition / hero.maxCognition) * 100);
                    secondaryMetricBar = `<div class="metric-label"><span>Cognition</span><span>${hero.cognition}/${hero.maxCognition}</span></div><div class="status-bar-bg"><div class="cognition-fill" style="width: ${cogPct}%;"></div></div>`;
                } else if (hero.classKey === 'cleric') {
                    if (hero.divineFavor <= 0 || hero.absoluteSilence) {
                        cardActions = `<div class="silence-badge">🚫 ABSOLUTE SILENCE</div>`;
                    } else {
                        const prayersButtonsHTML = (hero.spells || []).map((s, idx) => {
                            if (s.spent) {
                                return `<button class="tsr-sq-btn prayer-action disabled" disabled title="${s.name} (invoked)">${this.SVG_ICONS.PRAY}<span class="btn-word">${(s.name || '').split(' ')[0]}</span></button>`;
                            }
                            return `<button class="tsr-sq-btn cleric-spell-btn prayer-action" data-index="${idx}" title="${s.name}">${this.SVG_ICONS.PRAY}<span class="btn-word">${(s.name || '').split(' ')[0]}</span></button>`;
                        }).join('');
                        cardActions = `<div class="card-actions-grid">${prayersButtonsHTML || '<span style="font-size:9px;color:var(--text-muted);">No prayers granted</span>'}</div>`;
                    }
                    const favorPct = Math.round((hero.divineFavor / hero.maxDivineFavor) * 100);
                    secondaryMetricBar = `<div class="metric-label"><span>Divine Favor</span><span>${hero.divineFavor}%</span></div><div class="status-bar-bg"><div class="favor-fill" style="width: ${favorPct}%;"></div></div>`;
                }

                if (cache.levelUp) {
                    if (hero.canLevelUp && !isInc) {
                        const canTrain = this.state.canPartyTrain();
                        if (canTrain) {
                            cache.levelUp.innerHTML = `<button class="tsr-level-up-btn active" data-hero-index="${index}">⭐ LEVEL UP (Train)</button>`;
                        } else {
                            cache.levelUp.innerHTML = `<button class="tsr-level-up-btn locked" data-hero-index="${index}" disabled title="Return to town or village to train">⭐ LEVEL UP (Need Village)</button>`;
                        }
                    } else {
                        cache.levelUp.innerHTML = '';
                    }
                }

                cache.secondary.innerHTML = secondaryMetricBar;
                cache.actions.innerHTML = cardActions;
            });
        }
    }

    initListeners() {
        this.elements.partyContainer.addEventListener('click', (e) => {
            const lvlBtn = e.target.closest('.tsr-level-up-btn');
            if (lvlBtn && !lvlBtn.disabled) {
                const hIdx = parseInt(lvlBtn.getAttribute('data-hero-index'), 10);
                if (this.callbacks.onLevelUpClick) {
                    this.callbacks.onLevelUpClick(hIdx);
                }
                return;
            }

            const nameEl = e.target.closest('.hero-name-click');
            if (nameEl) {
                this.callbacks.onOpenSheet(nameEl.getAttribute('data-hero-name'));
                return;
            }
            const cmdBtn = e.target.closest('.cmd-btn');
            if (cmdBtn) {
                const hIdx = parseInt(cmdBtn.getAttribute('data-hero'));
                const cmd = cmdBtn.getAttribute('data-cmd');
                if (cmd === 'GUARD') {
                    this.#promptGuardTarget(hIdx);
                    return;
                }
                if (cmd === 'CAST' || cmd === 'PRAY') {
                    const spellIndex = parseInt(cmdBtn.getAttribute('data-spell-index'));
                    this.callbacks.onCommand(hIdx, cmd, { spellIndex });
                    return;
                }
                this.callbacks.onCommand(hIdx, cmd);
                return;
            }
            if (e.target.closest('#pick-lock-btn')) this.callbacks.onUIAction('PICK_LOCK');
            if (e.target.closest('#find-trap-btn')) this.callbacks.onUIAction('FIND_TRAP');
            if (e.target.closest('#scout-btn')) this.callbacks.onUIAction('SCOUT_AHEAD');
            if (e.target.closest('#disarm-trap-btn')) this.callbacks.onUIAction('DISARM_TRAP');
            if (e.target.closest('#hide-shadows-btn')) this.callbacks.onUIAction('HIDE_SHADOWS');
            if (e.target.closest('#pickpocket-npc-btn')) this.callbacks.onUIAction('PICKPOCKET_NPC');
            if (e.target.closest('#study-grimoire-btn')) this.callbacks.onUIAction('STUDY_GRIMOIRE');
            if (e.target.closest('#study-prayers-btn')) this.callbacks.onUIAction('STUDY_PRAYERS');
            if (e.target.closest('#bash-btn')) this.callbacks.onUIAction('BASH_DOOR');
            if (e.target.closest('#read-magic-btn')) this.callbacks.onUIAction('READ_MAGIC');

            const mageBtn = e.target.closest('.mage-spell-btn');
            if (mageBtn) {
                this.callbacks.onUIAction('CAST_MAGE_SPELL', parseInt(mageBtn.getAttribute('data-index')));
            }
            const clericBtn = e.target.closest('.cleric-spell-btn');
            if (clericBtn) {
                this.callbacks.onUIAction('CAST_CLERIC_PRAYER', parseInt(clericBtn.getAttribute('data-index')));
            }
        });

        this.elements.partyContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('target-select')) {
                this.callbacks.onTargetChange(parseInt(e.target.getAttribute('data-hero')), e.target.value);
            }
        });

        this.elements.globalActions.addEventListener('click', (e) => {
            if (e.target.closest('#resolve-round-btn')) this.callbacks.onGlobalAction('RESOLVE_ROUND');
            if (e.target.closest('#open-btn')) this.callbacks.onGlobalAction('OPEN_OBJECT');
            if (e.target.closest('#shop-btn')) this.callbacks.onGlobalAction('OPEN_SHOP');
            if (e.target.closest('#rest-btn')) this.callbacks.onGlobalAction('REST_CAMP');
        });
    }

    /** 2D enemy HP overlay (replaces former 3D billboard bars). */
    #updateEnemyHpOverlay(aliveEnemies) {
        const overlay = document.getElementById('enemy-hp-overlay');
        if (!overlay) return;

        if (!aliveEnemies || aliveEnemies.length === 0) {
            overlay.classList.remove('visible');
            overlay.innerHTML = '';
            return;
        }

        overlay.innerHTML = aliveEnemies.map(e => {
            const pct = Math.max(0, Math.min(100, Math.round((e.hp / (e.maxHp || 1)) * 100)));
            let fillColor = 'var(--hp-green)';
            if (pct <= 25) fillColor = 'var(--guard-red)';
            else if (pct <= 50) fillColor = '#d29922';
            return `
              <div class="enemy-hp-row">
                <div class="enemy-hp-name">${e.name} — ${e.hp}/${e.maxHp}</div>
                <div class="enemy-hp-bar-bg">
                  <div class="enemy-hp-bar-fill" style="width:${pct}%; background:${fillColor};"></div>
                </div>
              </div>`;
        }).join('');

        overlay.classList.add('visible');
    }

    /** Modal: pick a prepared (unspent) spell to release this round. */
    #promptCastSpell(heroIndex) {
        const hero = this.state.party[heroIndex];
        if (!hero || hero.hp <= 0 || !hero.spells) return;

        const prepared = hero.spells
            .map((s, idx) => ({ s, idx }))
            .filter(({ s }) => !s.spent);

        if (prepared.length === 0) {
            this.showInteractionModal({
                title: `${hero.name} — Spells`,
                prompt: 'No constructs remain in mind. Rest and Study Grimoire to rememorize.',
                choices: [{ text: 'Close', callback: () => { } }]
            });
            return;
        }

        const choices = prepared.map(({ s, idx }) => ({
            text: `🔮 ${s.name} (load ${s.cognitive_load || '?'})`,
            callback: () => {
                this.callbacks.onCommand(heroIndex, 'CAST', { spellIndex: idx });
            }
        }));

        this.showInteractionModal({
            title: `${hero.name} — Release Spell`,
            prompt: 'Untie a held construct. Casting is slow — foes may strike first.',
            choices
        });
    }

    /** Modal: pick self or a living ally to Guard this round. */
    #promptGuardTarget(heroIndex) {
        const hero = this.state.party[heroIndex];
        if (!hero || hero.hp <= 0) return;

        const choices = this.state.party
            .map((h, idx) => ({ h, idx }))
            .filter(({ h }) => h.hp > 0)
            .map(({ h, idx }) => ({
                text: idx === heroIndex ? `🛡️ Guard self (+1 AC)` : `🛡️ Shield ${h.name}`,
                callback: () => {
                    this.callbacks.onCommand(heroIndex, 'GUARD', { guardTargetIndex: idx });
                }
            }));

        this.showInteractionModal({
            title: `${hero.name} — Guard`,
            prompt: 'Choose whom to protect this round. You will not attack.',
            choices
        });
    }

    /**
     * Lightweight combat-presentation update: refreshes only the enemy overlay
     * and party HP bars from visual snapshots. Does NOT rebuild action buttons
     * or target selects (those stay frozen during the 1.5s resolution beats).
     */
    applyVisualCombatHp(visualEnemies, visualHeroHp) {
        const alive = (visualEnemies || []).filter(e => e.hp > 0);
        this.#updateEnemyHpOverlay(alive);

        if (!visualHeroHp || !this.hudCache.heroes.length) return;

        this.state.party.forEach((hero, index) => {
            const cache = this.hudCache.heroes[index];
            if (!cache) return;
            const hp = visualHeroHp[index] !== undefined ? visualHeroHp[index] : hero.hp;
            const isInc = hp <= 0;
            cache.hpText.textContent = `HP: ${hp}/${hero.maxHp}`;
            cache.hpText.style.color = isInc ? '#f85149' : '#3fb950';
            cache.hpFill.style.width = `${Math.max(0, Math.round((hp / hero.maxHp) * 100))}%`;
            if (isInc) {
                cache.card.classList.add('incapacitated');
                // Show badge immediately during staged resolution (not only on next updateHUD)
                if (cache.actions && !cache.actions.querySelector('.incapacitated-badge')) {
                    cache.actions.innerHTML = `<div class="incapacitated-badge">💀 INCAPACITATED</div>`;
                }
            } else {
                cache.card.classList.remove('incapacitated');
            }
        });
    }

    showSavingThrowCue(st) {
        if (!st) return;
        const banner = document.getElementById('saving-throw-cue-banner');
        if (!banner) return;

        const catEl = document.getElementById('st-cue-cat');
        const heroEl = document.getElementById('st-cue-hero');
        const rollEl = document.getElementById('st-cue-roll');
        const outcomeEl = document.getElementById('st-cue-outcome');
        const narrativeEl = document.getElementById('st-cue-narrative');

        if (catEl) catEl.textContent = st.categoryLabel || `VS. ${st.category}`;
        if (heroEl) heroEl.textContent = st.heroName || 'HERO';
        if (rollEl) rollEl.textContent = `d20: ${st.roll}${st.abilityMod ? (st.abilityMod > 0 ? `+${st.abilityMod}` : st.abilityMod) : ''} vs Target ${st.target}`;
        
        if (outcomeEl) {
            outcomeEl.textContent = st.success ? '✨ SAVED' : '💀 FAILED';
            outcomeEl.className = `st-cue-outcome ${st.success ? 'pass' : 'fail'}`;
        }

        if (narrativeEl) {
            narrativeEl.textContent = `"${st.narrative}"`;
        }

        banner.className = `active ${st.success ? 'pass' : 'fail'}`;

        if (this._stTimeout) clearTimeout(this._stTimeout);
        this._stTimeout = setTimeout(() => {
            banner.className = '';
        }, 4500);
    }

    showInteractionModal({ title, prompt, choices }) {
        this.elements.interactionTitle.textContent = title;
        this.elements.interactionPrompt.textContent = prompt;
        this.elements.interactionActions.innerHTML = '';
        choices.forEach((choice) => {
            const btn = document.createElement('button');
            btn.className = 'action-tab';
            btn.style.textAlign = 'left';
            btn.style.padding = '8px 12px';
            btn.style.margin = '4px 0';
            btn.style.width = '100%';
            btn.disabled = !!choice.disabled;
            btn.textContent = choice.text;
            btn.addEventListener('click', () => {
                this.elements.interactionModal.style.display = 'none';
                if (choice.callback) choice.callback();
            });
            this.elements.interactionActions.appendChild(btn);
        });
        this.elements.interactionModal.style.display = 'flex';
    }
}