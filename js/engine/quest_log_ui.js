/**
 * QuestLogUI
 * AD&D / OSR Expedition Chronicle & Quest Log Modal.
 * Provides rich storyline tracking, zone location context, acquired quest objectives,
 * inventory relics, and intelligent storyline guidance ("Where to go next").
 */

export class QuestLogUI {
  constructor(state, context) {
    this.state = state;
    this.context = context; // { playSFX, log, updateHUD }

    this.activeTab = 'quests'; // 'quests' | 'location' | 'guidance'

    // DOM references
    this.modal = document.getElementById('quest-log-modal');
    this.titleEl = document.getElementById('quest-log-title');
    this.contentEl = document.getElementById('quest-log-content');
    this.headerBtn = document.getElementById('open-quest-log-btn');

    this.initEventListeners();
  }

  initEventListeners() {
    if (this.headerBtn) {
      this.headerBtn.addEventListener('click', () => this.toggle());
    }

    const closeBtn = document.getElementById('close-quest-log-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
    }
  }

  isOpen() {
    return this.modal && this.modal.style.display === 'flex';
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (!this.modal || !this.contentEl) return;
    if (this.context.playSFX) this.context.playSFX('sheet');

    this.render();
    this.modal.style.display = 'flex';
  }

  close() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
  }

  setTab(tabKey) {
    this.activeTab = tabKey;
    if (this.context.playSFX) this.context.playSFX('button');
    this.render();
  }

  render() {
    if (!this.contentEl) return;

    const moduleName = (this.state.spec && this.state.spec.name) || 'The Expedition';
    if (this.titleEl) {
      this.titleEl.textContent = `📜 EXPEDITION CHRONICLE — ${moduleName.toUpperCase()}`;
    }

    const tabsHTML = `
      <div style="display: flex; gap: 6px; border-bottom: 2px solid var(--border-steel); padding-bottom: 8px; margin-bottom: 14px;">
        <button id="tab-quests-btn" class="action-tab ${this.activeTab === 'quests' ? 'primary' : ''}" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: bold;">
          📜 Quests & Objectives
        </button>
        <button id="tab-location-btn" class="action-tab ${this.activeTab === 'location' ? 'primary' : ''}" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: bold;">
          📍 Location & Presence
        </button>
        <button id="tab-guidance-btn" class="action-tab ${this.activeTab === 'guidance' ? 'primary' : ''}" style="flex: 1; padding: 6px 10px; font-size: 11px; font-weight: bold;">
          🧭 Storyline Compass
        </button>
      </div>
    `;

    let bodyHTML = '';
    if (this.activeTab === 'quests') {
      bodyHTML = this.renderQuestsTab();
    } else if (this.activeTab === 'location') {
      bodyHTML = this.renderLocationTab();
    } else if (this.activeTab === 'guidance') {
      bodyHTML = this.renderGuidanceTab();
    }

    this.contentEl.innerHTML = tabsHTML + bodyHTML;

    // Bind tab buttons
    const qBtn = document.getElementById('tab-quests-btn');
    const lBtn = document.getElementById('tab-location-btn');
    const gBtn = document.getElementById('tab-guidance-btn');
    if (qBtn) qBtn.addEventListener('click', () => this.setTab('quests'));
    if (lBtn) lBtn.addEventListener('click', () => this.setTab('location'));
    if (gBtn) gBtn.addEventListener('click', () => this.setTab('guidance'));
  }

  /**
   * Evaluates the current module and game state to construct structured quest records.
   */
  getModuleQuestData() {
    const moduleId = (this.state.spec && this.state.spec.id) || '';
    const moduleName = (this.state.spec && this.state.spec.name) || 'Epic Adventure';
    const briefing = (this.state.spec && this.state.spec.briefing) || 'Embark into the unknown and secure the realm.';
    
    // Check party items
    const hasItem = (name) => this.state.partyHasItem ? this.state.partyHasItem(name) : (this.state.inventory || []).some(i => (typeof i === 'string' ? i : i.name) === name);
    
    // Check encounters
    const completedEncounters = (this.state.spec && this.state.spec.encounters || []).filter(e => e.completed);
    const hasClearedEncounter = (id) => (this.state.spec && this.state.spec.encounters || []).some(e => e.id === id && e.completed);

    let quests = [];

    if (moduleId.includes('blackstone') || moduleName.toLowerCase().includes('blackstone')) {
      const hasCrown = hasItem('Ashen Crown of Binding');
      const hasSignet = hasItem('Highstone Signet Ring');
      const bossDefeated = hasClearedEncounter('enc_malakor') || hasCrown;
      const cultCleared = hasClearedEncounter('enc_ashen_cultists');

      quests.push({
        id: 'main_blackstone',
        title: 'The Shadow of Blackstone Keep',
        category: 'Main Campaign Quest',
        giver: 'Baron Justinian Vane (Highstone Manor)',
        status: (hasCrown && this.state.isTownActive && this.state.isTownActive()) ? 'COMPLETED' : 'IN_PROGRESS',
        lore: 'Necromancer Malakor the Despoiler has desecrated the subterranean crypts beneath ruined Blackstone Keep. Recover the ancient Ashen Crown of Binding and crush his undead host.',
        reward: '3,600 Quest XP & Baron\'s Favor',
        objectives: [
          { text: 'Confer with Baron Justinian Vane in Highstone Hamlet', done: true },
          { text: 'Visit class mentors (Garrison, Spire, Temple, Guild) for training & gear', done: this.state.party.some(h => (h.xp || 0) > 0 || h.level > 1) },
          { text: 'Breach the Sunken Crypts entrance beyond the iron gates', done: !this.state.isTownActive || !this.state.isTownActive() || hasCrown || bossDefeated },
          { text: 'Cleanse the Ashen Hand cultist zealots', done: cultCleared || bossDefeated },
          { text: 'Confront and destroy Necromancer Malakor', done: bossDefeated },
          { text: 'Recover the Ashen Crown of Binding', done: hasCrown },
          { text: 'Return the Crown to Baron Vane in Highstone Hamlet', done: hasCrown && (this.state.isTownActive && this.state.isTownActive()) }
        ]
      });

      // Class Mentor side activities
      quests.push({
        id: 'mentors_highstone',
        title: 'Highstone Hamlet Class Mentorship & Mastery',
        category: 'Faction & Training',
        giver: 'Village Class Mentors',
        status: 'ACTIVE',
        lore: 'The veterans of Highstone can hone your fellowship. Visit Captain Valerius for Weapon Mastery, Archmage Cynthia for Arcane Focus, Priestess Kaelen for Divine Favor, and Master Jax for Lockpicking Tools.',
        reward: 'Level Advancements, Weapon Mastery Bonuses, Restored Tools & Favor',
        objectives: [
          { text: 'Fighter Mastery with Captain Valerius (Military Garrison)', done: this.state.party.some(h => h.classKey === 'fighter' && (h.weaponUsage && Object.values(h.weaponUsage).some(v => v >= 25))) },
          { text: 'Arcane Grimoire preparation with Archmage Cynthia (Arcane Spire)', done: this.state.party.some(h => h.classKey === 'mage' && h.grimoire && h.grimoire.length > 0) },
          { text: 'Divine Devotion with High Priestess Kaelen (Sunfire Temple)', done: this.state.party.some(h => h.classKey === 'cleric' && (h.divineFavor || 0) > 0) },
          { text: 'Thieves\' Tools maintenance with Master Jax (Thieves\' Guild)', done: this.state.party.some(h => h.classKey === 'thief' && (h.toolsDurability || 0) >= 80) }
        ]
      });
    } else if (moduleId.includes('goblin') || moduleName.toLowerCase().includes('relic') || moduleName.toLowerCase().includes('goblin')) {
      const hasRelic = hasItem('Sun-Forged Relic of Dawn');
      const bossDefeated = hasClearedEncounter('enc_goblin_chieftain') || hasRelic;

      quests.push({
        id: 'main_goblin_relic',
        title: 'The Sun-Forged Relic of Dawn',
        category: 'Main Campaign Quest',
        giver: 'Lord Albright (Oakhaven Manor)',
        status: (hasRelic && this.state.isTownActive && this.state.isTownActive()) ? 'COMPLETED' : 'IN_PROGRESS',
        lore: 'Goblins raided the sacred shrine and fled with the Sun-Forged Relic of Dawn into the deep pine ruins. Slay Chieftain Gorn and return the blessed artifact to Oakhaven.',
        reward: '3,500 Quest XP & Lord Albright\'s Signet',
        objectives: [
          { text: 'Speak with Lord Albright in Oakhaven', done: true },
          { text: 'Stock provisions, torches, and arrows at the Village Outfitter', done: (this.state.inventory || []).length > 2 },
          { text: 'Navigate through the Pine Wilderness', done: !this.state.isTownActive || !this.state.isTownActive() },
          { text: 'Infiltrate the Goblin Warrens and bypass the spiked pit traps', done: hasClearedEncounter('enc_goblin_patrol') || bossDefeated },
          { text: 'Slay Goblin Chieftain Gorn in the Throne Chamber', done: bossDefeated },
          { text: 'Recover the Sun-Forged Relic of Dawn', done: hasRelic },
          { text: 'Return the Relic safely to Oakhaven Village', done: hasRelic && (this.state.isTownActive && this.state.isTownActive()) }
        ]
      });
    } else if (moduleId.includes('b2') || moduleName.toLowerCase().includes('borderlands') || moduleName.toLowerCase().includes('caves')) {
      const shrineCleared = hasClearedEncounter('enc_shrine_priest') || hasClearedEncounter('enc_evil_curate');
      const upperCleared = hasClearedEncounter('enc_orc_chieftain') || hasClearedEncounter('enc_goblin_king');
      const lowerCleared = hasClearedEncounter('enc_minotaur') || hasClearedEncounter('enc_bugbear_chief');

      quests.push({
        id: 'main_b2_borderlands',
        title: 'Expedition to the Caves of Chaos',
        category: 'Main Campaign Quest',
        giver: 'The Castellan of the Keep',
        status: shrineCleared ? 'COMPLETED' : 'IN_PROGRESS',
        lore: 'The frontier stands threatened by the warring monster clans nesting in the rocky ravine known as the Caves of Chaos. Scout the upper and lower warrens, dismantle the evil shrine, and pacify the wilderness.',
        reward: '5,000 Expedition XP & Keep Citations',
        objectives: [
          { text: 'Establish base camp and muster resources inside the Keep', done: true },
          { text: 'Cross the wild borderlands ravine into the Caves of Chaos', done: (this.state.spec.id || '').includes('caves') || (this.state.spec.id || '').includes('shrine') },
          { text: 'Assault the Upper Ravine Warrens (Orc & Goblin strongholds)', done: upperCleared },
          { text: 'Explore the Lower Warrens (Bugbear & Minotaur labyrinths)', done: lowerCleared },
          { text: 'Discover and destroy the hidden Shrine of Evil Cult', done: shrineCleared },
          { text: 'Return victorious to the Keep on the Borderlands', done: shrineCleared && (this.state.spec.id || '').includes('keep') }
        ]
      });
    } else {
      // Generic / Custom Module quest generator
      const bossEnc = (this.state.spec && this.state.spec.encounters || []).slice(-1)[0];
      const bossDefeated = bossEnc ? bossEnc.completed : false;

      quests.push({
        id: 'main_custom',
        title: moduleName,
        category: 'Campaign Mission',
        giver: 'Expedition Patron',
        status: bossDefeated ? 'COMPLETED' : 'IN_PROGRESS',
        lore: briefing,
        reward: 'Expedition Honor & Combat Glory',
        objectives: [
          { text: 'Begin the expedition and scout local terrain', done: true },
          { text: 'Overcome hostile encounters and navigate dungeon obstacles', done: completedEncounters.length > 0 },
          { text: `Defeat the primary threat${bossEnc ? ` (${bossEnc.name})` : ''}`, done: bossDefeated },
          { text: 'Secure the zone and return to safety', done: bossDefeated }
        ]
      });
    }

    return { moduleId, moduleName, briefing, quests };
  }

  /**
   * Renders Tab 1: Quests & Objectives
   */
  renderQuestsTab() {
    const { moduleName, briefing, quests } = this.getModuleQuestData();

    // Get Quest Items held by party
    const partyQuestItems = [];
    (this.state.party || []).forEach(hero => {
      (hero.inventory || []).forEach(item => {
        const itemObj = typeof item === 'string' ? { name: item, type: 'general' } : item;
        if (itemObj.type === 'quest' || (itemObj.name && (itemObj.name.includes('Relic') || itemObj.name.includes('Crown') || itemObj.name.includes('Ring') || itemObj.name.includes('Ledger') || itemObj.name.includes('Signet')))) {
          partyQuestItems.push({ ...itemObj, carrier: hero.name });
        }
      });
    });

    const questsListHTML = quests.map(q => {
      const statusBadge = q.status === 'COMPLETED'
        ? `<span style="background: rgba(63,185,80,0.2); border: 1px solid #3fb950; color: #7ee787; font-size: 9.5px; font-weight: bold; padding: 2px 8px; border-radius: 2px;">✓ COMPLETED</span>`
        : `<span style="background: rgba(210,153,34,0.2); border: 1px solid #d29922; color: var(--gold-tsr); font-size: 9.5px; font-weight: bold; padding: 2px 8px; border-radius: 2px;">⚡ IN PROGRESS</span>`;

      const objectivesHTML = q.objectives.map(obj => `
        <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 11px; margin-bottom: 5px; color: ${obj.done ? '#7ee787' : 'var(--text-parchment)'};">
          <span style="font-weight: bold; flex-shrink: 0; color: ${obj.done ? '#3fb950' : 'var(--text-muted)'};">${obj.done ? '☑' : '☐'}</span>
          <span style="${obj.done ? 'text-decoration: line-through; opacity: 0.85;' : ''}">${obj.text}</span>
        </div>
      `).join('');

      return `
        <div style="background: #0d1117; border: 1px solid var(--border-steel); border-left: 3px solid var(--gold-tsr); border-radius: 3px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div>
              <span style="font-size: 10px; text-transform: uppercase; color: var(--text-muted); font-weight: bold; letter-spacing: 0.5px;">${q.category}</span>
              <h4 style="margin: 2px 0 0 0; font-family: 'Cinzel', serif; font-size: 14px; color: var(--gold-tsr); font-weight: bold;">${q.title}</h4>
            </div>
            ${statusBadge}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px; line-height: 1.4;">
            <b>Quest Giver:</b> <span style="color: var(--text-parchment);">${q.giver}</span> | <b>Reward:</b> <span style="color: #e3b341;">${q.reward}</span>
          </div>
          <p style="font-size: 11px; color: #c9d1d9; line-height: 1.5; margin: 0 0 10px 0; font-style: italic; background: rgba(0,0,0,0.3); padding: 6px 8px; border-radius: 2px; border-left: 2px solid #30363d;">
            "${q.lore}"
          </p>
          <div style="margin-top: 8px; border-top: 1px dashed var(--border-iron); padding-top: 8px;">
            <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: var(--gold-tsr); margin-bottom: 6px; letter-spacing: 0.5px;">Mission Objectives:</div>
            ${objectivesHTML}
          </div>
        </div>
      `;
    }).join('');

    const questItemsHTML = partyQuestItems.length > 0
      ? partyQuestItems.map(item => `
          <div style="background: #161b22; border: 1px solid var(--border-gold-frame); padding: 8px 10px; border-radius: 3px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">👑</span>
              <div>
                <div style="font-size: 11px; font-weight: bold; color: var(--gold-tsr);">${item.name}</div>
                <div style="font-size: 9.5px; color: var(--text-muted);">${item.description || 'Key quest artifact recovered during the expedition.'}</div>
              </div>
            </div>
            <span style="font-size: 9.5px; background: #0d1117; border: 1px solid var(--border-iron); padding: 2px 6px; border-radius: 2px; color: var(--text-parchment);">Carried by: <b>${item.carrier}</b></span>
          </div>
        `).join('')
      : `<div style="font-size: 11px; color: var(--text-muted); font-style: italic; background: #0d1117; padding: 8px; border: 1px dashed var(--border-iron); border-radius: 3px; text-align: center;">No key story artifacts or relics recovered in party inventory yet.</div>`;

    return `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          ${questsListHTML}
        </div>

        <div style="background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; padding: 10px;">
          <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: var(--gold-tsr); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>🏺</span> Recovered Quest Artifacts & Relics (${partyQuestItems.length})
          </div>
          ${questItemsHTML}
        </div>
      </div>
    `;
  }

  /**
   * Renders Tab 2: Location & Module Presence ("Where is the party?")
   */
  renderLocationTab() {
    const px = this.state.player.x;
    const py = this.state.player.y;
    const facing = this.state.player.facing || 'NORTH';
    const zoneName = (this.state.spec && (this.state.spec.zoneName || this.state.spec.name)) || 'Unknown Territory';
    
    // Determine Environment Type
    let envType = 'Town / Fortress Hub (Civilized)';
    let envColor = '#3fb950';
    let envIcon = '🏰';

    if (this.state.isWildernessActive && this.state.isWildernessActive()) {
      envType = 'Pine Wilderness / Rugged Ravine (Hostile)';
      envColor = '#e3b341';
      envIcon = '🌲';
    } else if (this.state.isDungeonActive && this.state.isDungeonActive()) {
      envType = 'Subterranean Crypt / Warrens (Dungeon Hazard)';
      envColor = '#ff7b72';
      envIcon = '⚔️';
    }

    // Tile description
    const currentLegend = (this.state.spec && this.state.spec.legend) ? this.state.getLegendAt(px, py) : null;
    const tileName = currentLegend ? currentLegend.name : 'Unknown Stone Floor';

    // Lighting & Visibility
    const isDarkness = this.state.isDarknessActive ? this.state.isDarknessActive() : false;
    const canSee = this.state.canPartySeeAhead ? this.state.canPartySeeAhead() : true;
    const lightStatus = isDarkness
      ? (canSee ? '🕯️ Illuminated by Torchlight' : '🌑 Pitch Darkness (Blindness Hazard!)')
      : '☀️ Natural / Atmospheric Daylight';

    // Encumbrance
    const partyTier = this.state.getPartyTier ? this.state.getPartyTier() : { tier: 'unencumbered', label: 'Unencumbered' };

    // Adjacent Transitions
    const transitions = (this.state.spec && this.state.spec.transitions) || [];
    const transitionsHTML = transitions.length > 0
      ? transitions.map(t => {
          const isAtTrans = t.x === px && t.y === py;
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: ${isAtTrans ? 'rgba(210,153,34,0.15)' : '#161b22'}; border: 1px solid ${isAtTrans ? 'var(--gold-tsr)' : 'var(--border-iron)'}; padding: 6px 10px; border-radius: 3px; font-size: 11px; margin-bottom: 4px;">
              <div>
                <span style="font-weight: bold; color: ${isAtTrans ? 'var(--gold-tsr)' : 'var(--text-parchment)'};">🚪 ${t.prompt || t.targetZone || 'Portal Passage'}</span>
                <span style="font-size: 9.5px; color: var(--text-muted); margin-left: 6px;">[Coordinates: ${t.x}, ${t.y}]</span>
              </div>
              <span style="font-size: 9.5px; color: ${isAtTrans ? '#3fb950' : 'var(--text-muted)'}; font-weight: bold;">
                ${isAtTrans ? '📍 STANDING ON GATE' : 'Explorable'}
              </span>
            </div>
          `;
        }).join('')
      : `<div style="font-size: 11px; color: var(--text-muted); font-style: italic;">No interconnected zone passages found in this map sector.</div>`;

    return `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Location Header Card -->
        <div style="background: #0d1117; border: 1px solid var(--border-steel); border-radius: 4px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 20px;">${envIcon}</span>
              <div>
                <h3 style="margin: 0; font-family: 'Cinzel', serif; font-size: 15px; color: var(--gold-tsr); font-weight: bold;">${zoneName}</h3>
                <span style="font-size: 10.5px; color: ${envColor}; font-weight: bold;">${envType}</span>
              </div>
            </div>
            <div style="text-align: right; background: #161b22; border: 1px solid var(--border-iron); padding: 4px 8px; border-radius: 3px;">
              <div style="font-size: 11px; color: var(--gold-tsr); font-weight: bold;">X: ${px}, Y: ${py}</div>
              <div style="font-size: 9.5px; color: var(--text-muted);">Facing: <b>${facing}</b></div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; font-size: 11px; border-top: 1px dashed var(--border-iron); padding-top: 10px;">
            <div>
              <span style="color: var(--text-muted);">Current Terrain:</span>
              <div style="font-weight: bold; color: var(--text-parchment);">${tileName}</div>
            </div>
            <div>
              <span style="color: var(--text-muted);">Atmosphere / Light:</span>
              <div style="font-weight: bold; color: var(--text-parchment);">${lightStatus}</div>
            </div>
            <div>
              <span style="color: var(--text-muted);">Party Encumbrance:</span>
              <div style="font-weight: bold; text-transform: capitalize; color: ${partyTier.tier === 'unencumbered' ? '#3fb950' : partyTier.tier === 'encumbered' ? '#e3b341' : '#ff7b72'};">
                ⚖️ ${partyTier.label || partyTier.tier}
              </div>
            </div>
            <div>
              <span style="color: var(--text-muted);">Expedition Treasury:</span>
              <div style="font-weight: bold; color: var(--gold-tsr);">💰 ${this.state.partyGold || 0} gp | 🍖 ${this.state.partyRations || 0} Rations</div>
            </div>
          </div>
        </div>

        <!-- Zone Transitions and Passages -->
        <div style="background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; padding: 10px;">
          <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: var(--gold-tsr); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>🗺️</span> Known Portals & Zone Transitions
          </div>
          ${transitionsHTML}
        </div>
      </div>
    `;
  }

  /**
   * Renders Tab 3: Storyline Compass & Strategic Guidance ("Where should they go?")
   */
  renderGuidanceTab() {
    const { moduleId, moduleName } = this.getModuleQuestData();
    const hasItem = (name) => this.state.partyHasItem ? this.state.partyHasItem(name) : (this.state.inventory || []).some(i => (typeof i === 'string' ? i : i.name) === name);
    const hasClearedEncounter = (id) => (this.state.spec && this.state.spec.encounters || []).some(e => e.id === id && e.completed);

    let nextStepTitle = 'Advance into the Adventure';
    let nextStepText = 'Explore the surroundings, prepare resources, and follow the mission path.';
    let tacticalAdvice = [];

    const isTown = this.state.isTownActive ? this.state.isTownActive() : true;
    const isWilderness = this.state.isWildernessActive ? this.state.isWildernessActive() : false;
    const isDungeon = this.state.isDungeonActive ? this.state.isDungeonActive() : false;

    if (moduleId.includes('blackstone')) {
      const hasCrown = hasItem('Ashen Crown of Binding');
      const bossDead = hasClearedEncounter('enc_malakor') || hasCrown;

      if (hasCrown && isTown) {
        nextStepTitle = '🎉 Return Artifact to Baron Vane';
        nextStepText = 'You have recovered the Ashen Crown of Binding! Walk up to Baron Justinian Vane at Highstone Manor (coordinates 1, 14) to present the crown, receive your massive XP reward, and conclude the module storyline.';
        tacticalAdvice = [
          'Approach Baron Vane and initiate conversation to trigger the victory conclusion.',
          'Visit mentors to level up any heroes who gained experience during the crypt assault.'
        ];
      } else if (hasCrown && !isTown) {
        nextStepTitle = '🏃 Backtrack to Highstone Hamlet';
        nextStepText = 'The Ashen Crown of Binding is in your possession! Retrace your steps back through the iron gates to the surface and return to Highstone Hamlet.';
        tacticalAdvice = [
          'Keep weapons ready against wandering patrols.',
          'Conserve torchlight or rest at a campfire if heroes are wounded.'
        ];
      } else if (isDungeon) {
        nextStepTitle = '⚔️ Storm the Crypt Sanctum & Slay Malakor';
        nextStepText = 'You have penetrated the Sunken Crypts of Blackstone Keep. Delve north through the flagstone corridors towards coordinates (7, 1) where Necromancer Malakor the Despoiler conducts his blasphemous ritual.';
        tacticalAdvice = [
          'Have your Cleric brandish Holy Symbols (Turn Undead) against skeletons and ghouls.',
          'Have your Thief check for mechanical pit traps and pressure plates on doors.',
          'Focus missile fire and heavy melee strikes on Necromancer Malakor before he raises more minions.'
        ];
      } else {
        nextStepTitle = '🏰 Muster in Highstone & Enter the Sunken Warrens';
        nextStepText = 'Speak with Baron Vane at the Manor to formalize the quest, visit Captain Valerius and the mentors for weapon mastery, buy torches and rations at the Outfitter, then march north through the gate at (7, 8) into the ruined keep.';
        tacticalAdvice = [
          'Ensure your Magic-User has spells memorized in their Grimoire.',
          'Equip shields and ranged weapons on front and rear rank heroes.',
          'Stockpile at least 3 torches and 6 rations before leaving town.'
        ];
      }
    } else if (moduleId.includes('goblin') || moduleId.includes('relic')) {
      const hasRelic = hasItem('Sun-Forged Relic of Dawn');
      if (hasRelic) {
        nextStepTitle = '🏆 Deliver the Relic to Lord Albright';
        nextStepText = 'The Sun-Forged Relic of Dawn is safe in your pack! Return through the pine woods to Oakhaven and present the artifact to Lord Albright at the village manor.';
        tacticalAdvice = [
          'Claim your reward from Lord Albright to earn quest XP and the Albright Signet.',
          'Celebrate at the local tavern!'
        ];
      } else if (isDungeon) {
        nextStepTitle = '⚔️ Infiltrate Chieftain Gorn\'s Throne Room';
        nextStepText = 'Navigate the goblin tunnels to the chieftain\'s chamber in the northern depths. Defeat Chieftain Gorn and secure the Sun-Forged Relic of Dawn.';
        tacticalAdvice = [
          'Beware of goblin ambushers hiding in alcoves.',
          'Keep your party\'s light source active to prevent surprise attacks.'
        ];
      } else {
        nextStepTitle = '🌲 Trek Through the Pine Wilderness to the Ruins';
        nextStepText = 'Leave Oakhaven and march through the wilderness towards the ancient ruined temple where the goblins made their lair.';
        tacticalAdvice = [
          'Stock up on arrows and rations at the Outfitter.',
          'Keep your thief in stealth when approaching suspicious clearings.'
        ];
      }
    } else if (moduleId.includes('b2')) {
      if (isTown) {
        nextStepTitle = '🏰 Equip at the Keep & Venture into the Caves of Chaos';
        nextStepText = 'Gather intelligence from the Castellan and Curate, stock up on supplies at the provisioner, and step through the southern gates to cross the wild ravine into the Caves of Chaos.';
        tacticalAdvice = [
          'Recruit hirelings or train at the guild if you have accumulated sufficient XP.',
          'Carry ample torches—the ravine caves are pitch black.'
        ];
      } else {
        nextStepTitle = '⚔️ Explore the Ravine Caves & Cleanse the Cult';
        nextStepText = 'Explore the cave entrances lining the ravine walls. Clear out the monster lairs and seek out the hidden Temple of Chaos in the lower depths.';
        tacticalAdvice = [
          'Start with the smaller cave complexes before tackling the main temple.',
          'Use the Retreat command if your party is heavily outnumbered.'
        ];
      }
    } else {
      nextStepTitle = '🧭 Explore & Complete Campaign Objectives';
      nextStepText = 'Follow the primary quest objectives outlined in the Quests tab, manage your party resources carefully, and overcome all dungeon challenges.';
      tacticalAdvice = [
        'Keep a steady supply of rations and torches.',
        'Rest at secure campfires when low on hit points and spell slots.'
      ];
    }

    const tacticalHTML = tacticalAdvice.map(tip => `
      <div style="display: flex; align-items: flex-start; gap: 8px; font-size: 11px; margin-bottom: 6px; color: var(--text-parchment);">
        <span style="color: var(--gold-tsr); flex-shrink: 0;">⚔️</span>
        <span>${tip}</span>
      </div>
    `).join('');

    return `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <!-- Primary Compass Banner -->
        <div style="background: linear-gradient(135deg, rgba(33,38,45,0.95) 0%, rgba(13,17,23,0.98) 100%); border: 1.5px solid var(--gold-tsr); border-radius: 4px; padding: 14px; box-shadow: 0 0 16px rgba(210,153,34,0.15);">
          <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: var(--gold-tsr); letter-spacing: 0.5px; margin-bottom: 4px;">
            🧭 CURRENT STORYLINE OBJECTIVE
          </div>
          <h3 style="margin: 0 0 8px 0; font-family: 'Cinzel', serif; font-size: 15px; color: #ffffff; font-weight: bold;">
            ${nextStepTitle}
          </h3>
          <p style="margin: 0; font-size: 11.5px; color: #e6edf3; line-height: 1.6;">
            ${nextStepText}
          </p>
        </div>

        <!-- Tactical Survival & Exploration Tips -->
        <div style="background: #0d1117; border: 1px solid var(--border-iron); border-radius: 3px; padding: 12px;">
          <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: var(--gold-tsr); margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>🛡️</span> Tactical & Module Guidance
          </div>
          ${tacticalHTML}
        </div>
      </div>
    `;
  }
}
