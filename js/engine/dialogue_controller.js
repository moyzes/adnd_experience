export class DialogueController {
    constructor(adventureData, state, uiController, callbacks) {
        this.adventureData = adventureData;
        this.state = state;
        this.uiController = uiController;
        this.callbacks = callbacks; // { log, updateHUD, playSFX }
    }

    startNPCInteraction(npcId) {
        const npcSpec = this.adventureData.npcs[npcId];
        if (!npcSpec) return;

        const npcState = this.state.getNPCState(npcId);
        if (npcState.despawned) return;

        this.state.activeNpc = npcSpec;

        // Dynamic quest node check (e.g. returning relic to patron)
        if (npcSpec.questConditions) {
            for (const cond of npcSpec.questConditions) {
                if (cond.requiresItem && this.state.inventory.some(i => i.name === cond.requiresItem && (i.amount || 1) > 0)) {
                    npcState.currentNode = cond.targetNode;
                    npcState.completed = false;
                    break;
                }
            }
        }

        if (npcState.completed) {
            if (npcState.endBehavior === 'repeat_terminal' && npcState.currentNode) {
                if (!this.state.activeSpeaker) {
                    this.state.activeSpeaker = this.state.party.find(p => p && p.hp > 0) || this.state.party[0];
                }
                this.renderDialogueUI(npcId, npcState.currentNode);
                return;
            } else {
                const displayName = npcSpec && npcSpec.name ? npcSpec.name : 'Unknown NPC';
                this.uiController.showInteractionModal({
                    title: `ENCOUNTER: ${displayName.toUpperCase()}`,
                    prompt: `"${displayName} acknowledges your presence, but has nothing further to say to the party."`,
                    choices: [{
                        text: "Leave",
                        callback: () => {
                            this.state.activeNpc = null;
                            this.callbacks.updateHUD();
                        }
                    }]
                });
                return;
            }
        }

        if (!npcState.currentNode) {
            npcState.currentNode = npcSpec.initialNode;
            npcState.met = true;
        }

        const consciousParty = this.state.party.filter(p => p && p.hp > 0);
        const speakerChoices = (consciousParty.length > 0 ? consciousParty : this.state.party).map(hero => ({
            text: `${hero.name} (${hero.className}) steps forward to speak.`,
            callback: () => {
                this.state.activeSpeaker = hero;
                this.renderDialogueUI(npcId, npcState.currentNode);
            }
        }));

        const displayName = npcSpec && npcSpec.name ? npcSpec.name : 'Unknown NPC';
        this.uiController.showInteractionModal({
            title: `ENCOUNTER: ${displayName.toUpperCase()}`,
            prompt: `Select who will lead the conversation:`,
            choices: speakerChoices
        });
    }

    renderDialogueUI(npcId, nodeId) {
        const npcSpec = (this.adventureData.npcs && this.adventureData.npcs[npcId]) || { name: 'NPC' };
        const node = this.adventureData.dialogues && this.adventureData.dialogues[npcId] ? this.adventureData.dialogues[npcId][nodeId] : null;
        const npcState = this.state.getNPCState(npcId);
        const speaker = this.state.activeSpeaker || this.state.party.find(p => p && p.hp > 0) || this.state.party[0] || { name: 'Adventurer', className: 'Fighter', classKey: 'fighter', attributes: {} };
        this.state.activeSpeaker = speaker;

        if (!node) {
            this.callbacks.log(`Conversation with ${npcSpec.name || 'NPC'} concluded.`, "info");
            this.state.activeNpc = null;
            this.state.activeSpeaker = null;
            this.callbacks.updateHUD();
            return;
        }

        const speakerHeader = `[Speaker: ${speaker.name || 'Adventurer'} (${speaker.className || 'Fighter'}) | NPC Attitude: ${npcState ? npcState.attitude : 0}]`;
        const fullPrompt = `${speakerHeader}\n\n"${node.text}"`;

        const choiceButtons = (node.choices || []).map(choice => {
            const hasSpecialty = choice.specialtyClass && speaker.classKey && (speaker.classKey.toLowerCase() === choice.specialtyClass.toLowerCase());
            const bonusText = hasSpecialty ? ` ⭐ [${choice.specialtyClass} Specialty +${choice.specialtyBonus}]` : '';

            let canAfford = true;
            if (choice.cost) {
                if (choice.cost.gold) {
                    const goldItem = (this.state.inventory || []).find(i => i && i.name === "Gold Pieces");
                    canAfford = goldItem && goldItem.amount >= choice.cost.gold;
                }
                if (choice.cost.rations) {
                    const rationItem = (this.state.inventory || []).find(i => i && (i.name || "").toLowerCase().includes("ration"));
                    const count = rationItem ? (rationItem.amount !== undefined ? rationItem.amount : rationItem.count || 0) : 0;
                    canAfford = count >= choice.cost.rations;
                }
            }

            if (choice.requiresItem) {
                const hasReqItem = (this.state.inventory || []).some(i => i && i.name === choice.requiresItem && (i.amount || 1) > 0);
                if (!hasReqItem) canAfford = false;
            }

            return {
                text: `${choice.text}${bonusText}`,
                disabled: !canAfford,
                callback: () => this.resolveDialogueChoice(npcId, choice)
            };
        });

        const titleName = (npcSpec.name || 'NPC').toUpperCase();
        this.uiController.showInteractionModal({
            title: `CONVERSING WITH ${titleName}`,
            prompt: fullPrompt,
            choices: choiceButtons
        });
    }

    resolveDialogueChoice(npcId, choice) {
        const speaker = this.state.activeSpeaker || this.state.party.find(p => p && p.hp > 0) || this.state.party[0] || { name: 'Adventurer', className: 'Fighter', classKey: 'fighter', attributes: {} };
        this.state.activeSpeaker = speaker;
        const npcSpec = (this.adventureData.npcs && this.adventureData.npcs[npcId]) || { name: 'NPC' };
        const npcState = this.state.getNPCState(npcId);

        if (choice.cost) {
            if (choice.cost.gold) {
                const goldItem = this.state.inventory.find(i => i.name === "Gold Pieces");
                if (goldItem) goldItem.amount -= choice.cost.gold;

                if (choice.briberyInsulted) {
                    npcState.attitude = Math.max(-100, npcState.attitude - (choice.insultSeverity || 25));
                    this.callbacks.log(`${npcSpec.name} recoils — gold was the wrong offer here.`, "danger");
                } else {
                    this.callbacks.log(`Spent ${choice.cost.gold} gold.`, "info");
                }
            }
            if (choice.cost.rations) {
                const rationItem = this.state.inventory.find(i => (i.name || "").toLowerCase().includes("ration"));
                if (rationItem) {
                    if (rationItem.amount !== undefined) rationItem.amount -= choice.cost.rations;
                    else if (rationItem.count !== undefined) rationItem.count -= choice.cost.rations;
                }
                this.callbacks.log(`Gave away ${choice.cost.rations} ration(s).`, "info");
            }
        }

        if (choice.takeItem) {
            this.state.removePartyItem(choice.takeItem, choice.takeAmount || 1);
            this.callbacks.log(`Handed over: ${choice.takeItem}.`, "info");
        }

        if (choice.giveItem) {
            const item = typeof choice.giveItem === 'string' ? { name: choice.giveItem, amount: 1 } : choice.giveItem;
            this.state.addPartyItem(item.name, item.amount || 1);
            this.callbacks.log(`🎁 Acquired Item: ${item.name}!`, "success");
            if (!choice.playSFX && this.callbacks.playSFX) {
                this.callbacks.playSFX('reward');
            }
        }

        if (choice.giveGold) {
            this.state.addPartyItem("Gold Pieces", choice.giveGold);
            this.callbacks.log(`💰 Acquired ${choice.giveGold} Gold Pieces!`, "success");
            if (this.callbacks.playSFX) this.callbacks.playSFX('coins');
        }

        if (choice.questXP) {
            const levelUps = this.state.awardQuestXP(choice.questXP);
            this.callbacks.log(`⭐ Gained +${choice.questXP} Quest XP!`, "success");
            if (levelUps && levelUps.length > 0 && this.callbacks.onLevelUp) {
                this.callbacks.onLevelUp(levelUps);
            }
        }

        if (choice.playSFX && this.callbacks.playSFX) {
            this.callbacks.playSFX(choice.playSFX);
        }

        if (choice.moral_tax) {
            this.state.applyMoralTax(choice.moral_tax, speaker, choice.clericMultiplier || null);
        }

        if (choice.attitudeShift) {
            npcState.attitude = Math.min(100, Math.max(-100, npcState.attitude + choice.attitudeShift));
        }

        let success = true;
        if (choice.templeCure) {
            const incHeroes = this.state.party.map((h, idx) => ({ h, idx })).filter(item => item.h && item.h.hp <= 0 && item.h.hp > -10);
            if (incHeroes.length === 0) {
                const deadHeroes = this.state.party.filter(h => h && h.hp <= -10);
                if (deadHeroes.length > 0) {
                    this.callbacks.log(`Priestess Kaelen examines the fallen: "Alas, their wounds are fatal (-10 HP). Only a true Resurrection miracle far beyond standard temple care can restore a dead soul."`, "danger");
                } else {
                    this.callbacks.log(`Priestess Kaelen checks the party: "All members of your fellowship are conscious and standing."`, "info");
                }
                success = false;
            } else {
                const targetToCure = incHeroes[0];
                const res = this.state.cureIncapacitatedHeroAtTemple(targetToCure.idx);
                if (res.success) {
                    success = true;
                    this.callbacks.log(res.log, "success");
                    if (this.callbacks.playSFX) this.callbacks.playSFX('holy');
                    this.callbacks.updateHUD();
                } else {
                    success = false;
                    this.callbacks.log(`Priestess Kaelen shakes her head: "${res.reason}"`, "warning");
                }
            }
        } else if (choice.trainClass) {
            const heroIdx = this.state.party.findIndex(p => p.classKey.toLowerCase() === choice.trainClass.toLowerCase());
            if (heroIdx !== -1) {
                const targetHero = this.state.party[heroIdx];
                if (targetHero.canLevelUp) {
                    success = true;
                    this.state.activeNpc = null;
                    this.state.activeSpeaker = null;
                    if (this.callbacks.onLevelUpClick) {
                        this.callbacks.onLevelUpClick(heroIdx);
                    }
                    this.callbacks.updateHUD();
                    return;
                } else {
                    success = false;
                    const reqXP = this.state.getXPForNextLevel(targetHero.classKey, targetHero.level + 1);
                    this.callbacks.log(`${targetHero.name} has ${targetHero.xp} / ${reqXP} XP. More field experience is required before training can be completed.`, "warning");
                }
            }
        } else if (choice.dc || choice.attribute) {
            const isThief = speaker.classKey === 'thief';
            const skillKey = choice.id ? choice.id.replace('choice_', '') : null;
            const skill = speaker.skills && skillKey ? speaker.skills[skillKey] : null;

            if (isThief && skill && skill.type === 'percentile') {
                const roll = Math.floor(Math.random() * 100) + 1;
                const target = this.state.getSkillTarget(speaker, skillKey);
                const attitudeMod = Math.floor(npcState.attitude / 5);
                const effectiveTarget = Math.min(99, Math.max(1, target + attitudeMod));

                success = roll <= effectiveTarget;
                const skName = (skill && skill.name) ? skill.name : (skillKey || 'Skill');
                this.callbacks.log(`${speaker.name} ${skName}: d100 Roll(${roll}) vs Target ${effectiveTarget}% (${target}% + Attitude:${attitudeMod}%) -> ${success ? 'SUCCESS' : 'FAILURE'}`, success ? 'success' : 'danger');
            } else {
                const roll = Math.floor(Math.random() * 20) + 1;
                const attrVal = speaker.attributes[choice.attribute || 'charisma'] || 10;
                const isSpecialty = choice.specialtyClass && (speaker.classKey.toLowerCase() === choice.specialtyClass.toLowerCase());
                const specialtyBonus = isSpecialty ? (choice.specialtyBonus || 2) : 0;
                const attitudeMod = Math.floor(npcState.attitude / 10);

                const effectiveTarget = attrVal + specialtyBonus + attitudeMod;

                if (roll === 20) success = false;
                else if (roll === 1) success = true;
                else success = roll <= effectiveTarget;

                this.callbacks.log(`${speaker.name} Check (${(choice.attribute || 'Ability').toUpperCase()}): d20 Roll(${roll}) vs Target ${effectiveTarget} (Attr:${attrVal} + Specialty:${specialtyBonus} + Attitude:${attitudeMod}) -> ${success ? 'SUCCESS' : 'FAILURE'}`, success ? 'success' : 'danger');
            }
        }

        const nextNode = success ? choice.onSuccess : choice.onFail;

        if (nextNode) {
            npcState.currentNode = nextNode;
            this.renderDialogueUI(npcId, nextNode);
        } else {
            const endDirective = choice.onEnd || "stay_silent";
            npcState.endBehavior = endDirective;

            if (endDirective === "despawn") {
                npcState.despawned = true;
                this.callbacks.log(`${npcSpec.name} departs from the area.`, "info");
            } else {
                npcState.completed = true;
                this.callbacks.log(`Interaction with ${npcSpec.name} concluded.`, "info");
            }

            this.state.activeNpc = null;
            this.state.activeSpeaker = null;
            this.callbacks.updateHUD();
        }
    }
}