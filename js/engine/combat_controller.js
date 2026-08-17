export class CombatController {
    constructor(state, renderer3D, callbacks) {
        this.state = state;
        this.renderer3D = renderer3D;
        // callbacks: { log, updateHUD, playSFX, playCombatBgm, stopCombatBgm, flashHeroCard, ... }
        this.callbacks = callbacks;
    }

    stopCombatMusic() {
        if (this.callbacks.stopCombatBgm) this.callbacks.stopCombatBgm();
    }

    triggerEncounter(encounterId) {
        const success = this.state.startEncounter(encounterId);
        if (!success) return;

        this.stopCombatMusic();

        // Prefer catalog ids; adventure.json may still list legacy paths (AudioManager accepts both)
        const tracks = this.state.spec.combat_tracks || ['combat_1', 'combat_2', 'combat_3'];
        if (this.callbacks.playCombatBgm) this.callbacks.playCombatBgm(tracks);

        this.callbacks.playSFX('combat_turn');

        const encSpec = this.state.spec.encounters.find(e => e.id === encounterId);
        const msg = encSpec.scouted
            ? `👁️ Scouted and sprung! ${encSpec.name} never sees you coming.`
            : `⚠️ AMBUSH! You stepped into ${encSpec.name}!`;
        this.callbacks.log(msg, encSpec.scouted ? "success" : "danger");

        if (this.renderer3D && typeof this.renderer3D.renderEncounterMonsters === 'function') {
            this.renderer3D.renderEncounterMonsters(this.state.combat.enemies, this.state.player);
        }

        this.state.isDirty = true;
    }

    async resolveCombatRoundSequence() {
        const resolveBtn = document.getElementById('resolve-round-btn');
        if (resolveBtn) {
            resolveBtn.disabled = true;
            resolveBtn.style.opacity = '0.6';
            resolveBtn.style.cursor = 'not-allowed';
        }

        // Pure calculation — live HP / victory flags are NOT mutated yet
        const { events, finalMobHp, finalHeroHp, victory, partyWiped, totalXp } =
            this.state.resolveCombatRound();

        // Visual snapshots start at pre-round values; drained event-by-event in sync with beats
        const visualEnemies = this.state.combat.enemies.map(e => ({ ...e }));
        const visualHeroHp = this.state.party.map(h => h.hp);

        const totalEvents = events.length;
        let currentEventIndex = 0;

        for (const evt of events) {
            currentEventIndex++;
            if (resolveBtn && totalEvents > 0) {
                const pct = Math.round((currentEventIndex / totalEvents) * 100);
                resolveBtn.textContent = `⏳ RESOLVING ROUND... ${pct}%`;
            }

            this.callbacks.log(evt.logText, evt.logType);

            if (evt.attackerSpec && evt.attackerSpec.soundAttack) {
                this.callbacks.playSFX(evt.attackerSpec.soundAttack);
            }

            if (evt.eventType === 'HERO_HIT') {
                if (!evt.attackerSpec || !evt.attackerSpec.soundAttack) {
                    this.callbacks.playSFX('sword_hit');
                }
                // Drain visual party HP at the moment of impact
                if (evt.targetHeroIndex != null && visualHeroHp[evt.targetHeroIndex] !== undefined) {
                    visualHeroHp[evt.targetHeroIndex] = Math.max(
                        0,
                        visualHeroHp[evt.targetHeroIndex] - (evt.damage || 0)
                    );
                }
                if (evt.isDead) this.callbacks.playSFX('death');
                this.callbacks.flashHeroCard(evt.targetHeroIndex);
                if (this.callbacks.applyVisualCombatHp) {
                    this.callbacks.applyVisualCombatHp(visualEnemies, visualHeroHp);
                }
            } else if (evt.eventType === 'MONSTER_HIT') {
                if (evt.attackMode === 'ranged') {
                    this.callbacks.playSFX('arrow_impact');
                } else if (evt.attackMode === 'spell') {
                    this.callbacks.playSFX('magic_missile');
                } else {
                    this.callbacks.playSFX('sword_hit');
                }
                const vMob = visualEnemies.find(m => m.instanceId === evt.targetInstanceId);
                if (vMob) vMob.hp = Math.max(0, vMob.hp - (evt.damage || 0));

                if (this.renderer3D && typeof this.renderer3D.shakeMonsterModel === 'function') {
                    this.renderer3D.shakeMonsterModel(evt.targetInstanceId);
                }
                if (this.renderer3D && typeof this.renderer3D.renderEncounterMonsters === 'function') {
                    this.renderer3D.renderEncounterMonsters(visualEnemies, this.state.player);
                }
                if (evt.isDead) this.callbacks.playSFX('death');
                if (this.callbacks.applyVisualCombatHp) {
                    this.callbacks.applyVisualCombatHp(visualEnemies, visualHeroHp);
                }
            } else if (evt.eventType === 'HERO_MISS' || evt.eventType === 'MONSTER_MISS') {
                this.callbacks.playSFX('sword_miss');
            } else if (evt.eventType === 'GUARD') {
                this.callbacks.playSFX('button');
            } else if (evt.eventType === 'SPELL_CAST') {
                if (evt.spellId === 'sleep') {
                    this.callbacks.playSFX('sleep');
                } else if (evt.spellId === 'shield') {
                    this.callbacks.playSFX('bless');
                } else if (evt.spellId === 'magic_missile') {
                    this.callbacks.playSFX('magic_missile');
                } else {
                    this.callbacks.playSFX('magic_missile');
                }
            } else if (evt.eventType === 'SPELL_FIZZLE') {
                this.callbacks.playSFX('sword_miss');
                if (evt.targetHeroIndex != null) {
                    this.callbacks.flashHeroCard(evt.targetHeroIndex);
                }
            } else if (evt.eventType === 'TURN_UNDEAD') {
                this.callbacks.playSFX('turn_undead');
            } else if (evt.eventType === 'SAVE_SUCCESS') {
                this.callbacks.playSFX('reward');
            } else if (evt.eventType === 'SAVE_FAILURE') {
                this.callbacks.playSFX('backstab');
            } else if (evt.eventType === 'VICTORY') {
                this.stopCombatMusic();
                this.callbacks.playSFX('victory');
                if (this.renderer3D && typeof this.renderer3D.clearEncounterMonsters === 'function') {
                    this.renderer3D.clearEncounterMonsters();
                }
                if (this.callbacks.applyVisualCombatHp) {
                    this.callbacks.applyVisualCombatHp([], visualHeroHp);
                }
            } else if (evt.eventType === 'PARTY_WIPED') {
                this.stopCombatMusic();
                this.callbacks.playSFX('death');
            }

            // Immersion beat: log + SFX + HP drain land together, then wait
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        // Commit real state only after every beat has played
        this.state.commitCombatRoundResults(finalMobHp, finalHeroHp, victory, totalXp);

        if (partyWiped || this.state.party.every(h => h.hp <= 0)) {
            this.stopCombatMusic();
            if (this.renderer3D && typeof this.renderer3D.clearEncounterMonsters === 'function') {
                this.renderer3D.clearEncounterMonsters();
            }
            this.state.combat.active = false;
            this.callbacks.log(`💀 PARTY WIPED. The expedition ends here.`, "danger");
            if (this.callbacks.onPartyWiped) {
                this.callbacks.onPartyWiped();
            }
        } else if (victory) {
            this.stopCombatMusic();
            if (this.renderer3D && typeof this.renderer3D.clearEncounterMonsters === 'function') {
                this.renderer3D.clearEncounterMonsters();
            }
            const currentEnc = this.state.spec.encounters.find(e => e.id === this.state.combat.encounterId);
            if (currentEnc) currentEnc.completed = true;
            this.callbacks.log(`Area secured! Return to exploration stance.`, "success");
        } else {
            this.callbacks.playSFX('combat_turn');
            if (resolveBtn) {
                resolveBtn.disabled = false;
                resolveBtn.style.opacity = '1';
                resolveBtn.style.cursor = 'pointer';
                resolveBtn.textContent = `🔥 RESOLVE ROUND ${this.state.combat.round}`;
            }
        }

        this.state.isDirty = true;
        this.callbacks.updateHUD();
    }
}