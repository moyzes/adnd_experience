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

        if (npcState.completed) {
            if (npcState.endBehavior === 'repeat_terminal' && npcState.currentNode) {
                this.renderDialogueUI(npcId, npcState.currentNode);
                return;
            } else {
                this.uiController.showInteractionModal({
                    title: `ENCOUNTER: ${npcSpec.name.toUpperCase()}`,
                    prompt: `"${npcSpec.name} acknowledges your presence, but has nothing further to say to the party."`,
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

        const consciousParty = this.state.party.filter(p => p.hp > 0);
        const speakerChoices = consciousParty.map(hero => ({
            text: `${hero.name} (${hero.className}) steps forward to speak.`,
            callback: () => {
                this.state.activeSpeaker = hero;
                this.renderDialogueUI(npcId, npcState.currentNode);
            }
        }));

        this.uiController.showInteractionModal({
            title: `ENCOUNTER: ${npcSpec.name.toUpperCase()}`,
            prompt: `Select who will lead the conversation:`,
            choices: speakerChoices
        });
    }

    renderDialogueUI(npcId, nodeId) {
        const npcSpec = this.adventureData.npcs[npcId];
        const node = this.adventureData.dialogues[npcId][nodeId];
        const npcState = this.state.getNPCState(npcId);
        const speaker = this.state.activeSpeaker;

        if (!node) {
            this.callbacks.log(`Conversation with ${npcSpec.name} concluded.`, "info");
            this.state.activeNpc = null;
            this.state.activeSpeaker = null;
            this.callbacks.updateHUD();
            return;
        }

        const speakerHeader = `[Speaker: ${speaker.name} (${speaker.className}) | NPC Attitude: ${npcState.attitude}]`;
        const fullPrompt = `${speakerHeader}\n\n"${node.text}"`;

        const choiceButtons = node.choices.map(choice => {
            const hasSpecialty = choice.specialtyClass && (speaker.classKey.toLowerCase() === choice.specialtyClass.toLowerCase());
            const bonusText = hasSpecialty ? ` ⭐ [${choice.specialtyClass} Specialty +${choice.specialtyBonus}]` : '';

            let canAfford = true;
            if (choice.cost) {
                if (choice.cost.gold) {
                    const goldItem = this.state.inventory.find(i => i.name === "Gold Pieces");
                    canAfford = goldItem && goldItem.amount >= choice.cost.gold;
                }
                if (choice.cost.rations) {
                    const rationItem = this.state.inventory.find(i => (i.name || "").toLowerCase().includes("ration"));
                    const count = rationItem ? (rationItem.amount !== undefined ? rationItem.amount : rationItem.count || 0) : 0;
                    canAfford = count >= choice.cost.rations;
                }
            }

            return {
                text: `${choice.text}${bonusText}`,
                disabled: !canAfford,
                callback: () => this.resolveDialogueChoice(npcId, choice)
            };
        });

        this.uiController.showInteractionModal({
            title: `CONVERSING WITH ${npcSpec.name.toUpperCase()}`,
            prompt: fullPrompt,
            choices: choiceButtons
        });
    }

    resolveDialogueChoice(npcId, choice) {
        const speaker = this.state.activeSpeaker;
        const npcSpec = this.adventureData.npcs[npcId];
        const npcState = this.state.getNPCState(npcId);

        if (choice.cost) {
            if (choice.cost.gold) {
                const goldItem = this.state.inventory.find(i => i.name === "Gold Pieces");
                if (goldItem) goldItem.amount -= choice.cost.gold;

                if (choice.briberyInsulted) {
                    // The module author has flagged this NPC/context as one where money offends.
                    // No roll — this is narrative certainty, decided by the story, not the dice.
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

        if (choice.moral_tax) {
            this.state.applyMoralTax(choice.moral_tax, speaker, choice.clericMultiplier || null);
        }

        if (choice.attitudeShift) {
            npcState.attitude = Math.min(100, Math.max(-100, npcState.attitude + choice.attitudeShift));
        }

        let success = true;
        if (choice.dc || choice.attribute) {
            const isThief = speaker.classKey === 'thief';
            const skillKey = choice.id ? choice.id.replace('choice_', '') : null;
            const skill = speaker.skills && skillKey ? speaker.skills[skillKey] : null;

            if (isThief && skill && skill.type === 'percentile') {
                const roll = Math.floor(Math.random() * 100) + 1;
                const target = this.state.getSkillTarget(speaker, skillKey);
                const attitudeMod = Math.floor(npcState.attitude / 5);
                const effectiveTarget = Math.min(99, Math.max(1, target + attitudeMod));

                success = roll <= effectiveTarget;
                this.callbacks.log(`${speaker.name} ${skill.name}: d100 Roll(${roll}) vs Target ${effectiveTarget}% (${target}% + Attitude:${attitudeMod}%) -> ${success ? 'SUCCESS' : 'FAILURE'}`, success ? 'success' : 'danger');
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