# PLAYER'S HANDBOOK: THE ART OF MAGIC
### An In-Depth Tome of Arcane Formulae, Divine Petitions, and Vancian Mechanics
*Grounded in the AD&D 2nd Edition Rules Engine*

---

## 1. FUNDAMENTAL PHILOSOPHY: TWO SACRED PATHS

In this realm, magical energy is not a generic mana bar. Magic operates under two deeply distinct, mechanically authentic systems:

1. **Arcane Sorcery (The Mage / Wizard)**: Follows strict **Vancian cognitive mechanics**. Mages must study physical grimoires to seat complex geometric thought-forms into their minds. The mind has finite bandwidth (**Cognitive Capacity**). Releasing a spell erases the construct, but the strain remains until a full rest.
2. **Divine Invocations (The Cleric / Priest)**: Operates through **Divine Favor & Holy Communion**. Clerics do not memorize books; they petition their patron deity. Their power is bound to moral conduct, piety, and communion thresholds. Transgressions impose spiritual fines that can sever their connection entirely.

---

## 2. THE ARCANE SYSTEM: VANCIAN COGNITION & GRIMOIRES

### A. The Grimoire & Active Memory
- **The Grimoire (`mage.grimoire`)**: The permanent library of formulas known to the wizard.
- **Active Memory (`mage.spells`)**: The prepared constructs currently held in working memory, primed for instant somatic release.

### B. Cognitive Capacity & Cognitive Load
- **Max Cognition**: Begins at **100** at 1st Level and increases by **+10 per level** (reaching 190 by Level 10).
- **Cognitive Load**: Every arcane spell has an inherent mental burden (ranging from 15 for *Shield* up to 70 for *Time Stop*).
- **Working Burden**: When spells are seated in memory, they consume cognition:
  $$\text{Available Cognition} = \text{Max Cognition} - \sum \text{Cognitive Load of Prepared Spells}$$

### C. Studying the Grimoire (Memorization)
- **Town & Sanctuary**: Studying prepares all formulas that safely fit within the caster's 100+ cognitive capacity.
- **In the Field**: Studying in the dungeon requires seating formulas **one at a time**, taking **10 minutes per spell tier** (e.g., Tier 1 = 10 min, Tier 3 = 30 min).
- **Brain Burn**: If a wizard forces a construct into an overburdened mind beyond their maximum capacity:
  - The wizard immediately suffers unpreventable damage equal to the cognitive overflow.
  - If HP falls below 25%, the mental trauma causes an **INT Bruise** (-1 Intelligence until the next full rest).

### D. The "Scorched Seat" Rule
- When an arcane spell is cast in combat or exploration, the construct is released (`spent = true`).
- **Crucial Vancian Principle**: Expending a spell **does not** immediately refund cognitive capacity! The "scorched seat" of the expended formula remains occupied by mental strain. Cognition only resets to full upon taking a **Full 8-Hour Rest with Rations**.

### E. Combat Disruption & Concentration
- Arcane casting requires uninterrupted concentration. If a monster strikes and wounds the mage during a combat round before their initiative completes, **concentration is broken**. The spell fizzles, the construct collapses, and the preparation is lost for the day.

---

## 3. THE DIVINE SYSTEM: THE CLERIC'S PATRON ETHOS & ALIGNMENT CONCORDANCE

### A. The Nature of Divine Favor & Sacred Ethos
Unlike arcane spellcasters who wrestle with mental cognitive formulas, the Cleric serves as a direct conduit for a celestial or infernal patron. Their power is governed by **Divine Favor** (base **100%**, +5% per level), but Divine Favor is inextricably bound to **Ethos Concordance**.

In this realm, characters do not select an abstract alignment checkbox at birth. Morality is **emergent**, tracked as a two-dimensional vector:
- **Order Axis (X)**: Ranging from **-100 (Chaotic)** to **+100 (Lawful)**.
- **Morality Axis (Y)**: Ranging from **-100 (Evil)** to **+100 (Good)**.

All heroes begin at **True Neutral (0, 0)**. Their deeds, promises made or broken, mercy bestowed, and cruelties committed dynamically pull their moral coordinates across the 9 classic alignments:
- **Lawful Good (LG)**, **Neutral Good (NG)**, **Chaotic Good (CG)**
- **Lawful Neutral (LN)**, **True Neutral (TN)**, **Chaotic Neutral (CN)**
- **Lawful Evil (LE)**, **Neutral Evil (NE)**, **Chaotic Evil (CE)**

### B. The Cleric's Sacred Ordination: Pledging to a Patron Deity
While fighters, rogues, and wizards develop emergent alignments organically through experience, **only Clerics must pledge themselves to a specific patron deity at ordination**.

A cleric's Divine Favor pool is measured against their **Ethos Concordance**—the Euclidean distance between the cleric's current emergent moral coordinates $(X_c, Y_c)$ and their patron's sacred ideal coordinates $(X_d, Y_d)$:

$$\text{Distance } D = \sqrt{(X_c - X_d)^2 + (Y_c - Y_d)^2}$$

$$\text{Concordance } \% = \max\left(0, 100 - \frac{D}{2.83}\right)$$

| Concordance | Status | Divine Standing & Spellcasting Penalties |
| :---: | :---: | :--- |
| **75% – 100%** | **Full Communion** | Pure resonance with the deity. Full Divine Favor (100%+); all prepared prayers restore freely upon petition. |
| **40% – 74%** | **Minor Ethos Friction** | Minor spiritual drift. Maximum Divine Favor capped at 80%. |
| **15% – 39%** | **Major Ethos Drift** | The deity is displeased and distant. Divine Favor capped at 40%; prayer recovery restores only half capacity. |
| **0% – 14%** | **Absolute Silence (Heresy)** | **Total spiritual severance!** Divine Favor drops to 0%. Prayers fail to cast, Turn Undead is inert, and the heavens turn deaf until genuine atonement. |

### C. The Three Patron Deities & Their Sacred Tenets

#### 1. ☀️ Pelor (The Sun Father)
- **Alignment & Ideal**: Neutral Good (Order: `0`, Morality: `+75`)
- **Portfolio**: Sun, Light, Healing, Agriculture, Strength against Evil
- **Sacred Ethos Tenets**:
  1. *Eradicate the Shadow*: Purge undead and malignant darkness wherever they take root.
  2. *Relieve Suffering*: Prioritize healing, charity, and defending the vulnerable over personal wealth or glory.
  3. *Nurture Life*: Protect crops, communities, and simple folk, serving as a beacon of warmth and renewal.
  4. *Tempered Mercy*: Offer redemption to those capable of change, but strike down unyielding evil without hesitation.

#### 2. 🕷️ Lolth (The Spider Queen)
- **Alignment & Ideal**: Chaotic Evil (Order: `-75`, Morality: `-75`)
- **Portfolio**: Drow, Spiders, Darkness, Chaos, Treachery, Assassination
- **Sacred Ethos Tenets**:
  1. *Supreme Ambition & Treachery*: Ascend through cunning, betrayal, and absolute strength. Loyalty is for fools.
  2. *Unflinching Cruelty*: Mercy is weakness. Inflict agony and break the spirits of rivals and captives.
  3. *Weave the Web*: Operate through conspiracies, deceit, and poison. Keep all adversaries ensnared in paranoia.
  4. *Blood for the Queen*: Purge the weak, sacrifice enemies to the Spider Queen, and revel in chaos.

#### 3. ⚖️ Tyr (The Maimed God / The Even-Handed)
- **Alignment & Ideal**: Lawful Good (Order: `+75`, Morality: `+60`)
- **Portfolio**: Justice, Law, Duty, Righteous Combat, Judicial Trial
- **Sacred Ethos Tenets**:
  1. *Impartial Justice*: Enforce oaths, laws, and vows without fear, favoritism, or personal sentiment.
  2. *Bear the Burden*: Endure suffering and sacrifice personal comfort in the defense of duty and honor.
  3. *Defend the Wronged*: Stand as a shield for victims of tyranny, unlawful violence, and breach of covenant.
  4. *Truth Over Peace*: Never accept an unjust peace, a corrupt compromise, or a deceitful bargain.

### D. Party Complicity & Moral Drift
When a hero performs a moral action in dialogue, quest choices, or crypt interactions:
- **Direct Actor**: Absorbs **100%** of the order and morality impact.
- **Fellow Party Members**: Absorb a **25% Complicity Drift**. Standing by while allies commit atrocities or sanctified deeds pulls the moral conscience of the entire fellowship!
- **Cleric Ethos Triggers**: If an action bears tags matching a cleric's forbidden sins (e.g., a Pelorite cleric participating in *cruelty* or *intimidation*), the cleric suffers doubled moral tax and immediate favor degradation. Conversely, performing favored sacred deeds restores holy favor.

### E. Petitioning & Rest
- Resting at camp with trail rations restores **+12% Divine Favor** up to the threshold allowed by current Ethos Concordance.
- In town sanctuaries or camp, the Cleric uses **Petition Deity** to commune with their god and restore all prepared prayer capacity.

---

## 4. HOW TO CAST AND USE MAGIC IN-GAME

### In Combat
1. When a caster's turn arrives, select the **CAST** (Mage) or **PRAY** (Cleric) command.
2. Select an unspent spell from the prepared list.
3. Choose a target:
   - **Single Enemy**: *Magic Missile*, *Shocking Grasp*, *Spiritual Hammer*, *Cause Light Wounds*, *Hold Person*, *Dispel Evil*.
   - **All Enemies (AOE)**: *Burning Hands*, *Fireball*, *Lightning Bolt*, *Chain Lightning*, *Blade Barrier*.
   - **Single Ally**: *Cure Light Wounds*, *Cure Serious Wounds*, *Heal*.
   - **Party-Wide**: *Bless*, *Purify Food & Drink*, *Holy Blessing*, *Divine Intervention*, *Haste*.
   - **Self**: *Shield*, *Armor*, *Sanctuary*, *Invisibility*, *Time Stop*.

### During Dungeon Exploration (Out of Combat)
Open the **Character Sheet** (`C` key or portrait click) or party interaction panel:
- **Cleric Healing**: Cast *Cure Light Wounds*, *Cure Serious*, *Heal*, or *Holy Blessing* directly to tend to wounded comrades.
- **Arcane Illumination (*Light*)**: Cast *Light* to summon a floating arcane orb lasting **60 minutes** (6 turns / 60 steps), dispelling darkness and gloom penalties without consuming wooden torches.
- **Wards (*Armor*, *Sanctuary*)**: Cast protective buffs prior to opening dangerous doors or descending stairwells.

---

## 5. LEVEL PROGRESSION & SPELL TIER UNLOCKS

Casters advance in power by accumulating Experience Points (XP) and training with dedicated mentors in town settlements or patron encampments:
- **Mage Mentor**: Archmage Cynthia Ravenwing at the *Arcane Spire Sanctum*.
- **Cleric Mentor**: High Priestess Kaelen at the *Sunfire Sanctuary*.
- **Training Fee**: `Current Level × 10 Gold Pieces`.

### Spell Tier Gates
| Character Level | Accessible Spell Tier | Mage Growth on Level Up | Cleric Growth on Level Up |
| :---: | :---: | :--- | :--- |
| **Level 1** | **Tier 1** | 100 Cognition, 2–5 Grimoire Spells (by INT) | 100 Favor, 1–4 Prayers (by WIS) |
| **Level 2** | **Tier 1** | +10 Max Cognition (110) | +5 Max Divine Favor (105) |
| **Level 3** | **Tier 2 Unlocked** | +10 Max Cognition (120), learn Tier 2 Spells | +5 Max Favor (110), learn Tier 2 Prayers |
| **Level 4** | **Tier 2** | +10 Max Cognition (130) | +5 Max Divine Favor (115) |
| **Level 5** | **Tier 2** | +10 Max Cognition (140) | +5 Max Divine Favor (120) |
| **Level 6** | **Tier 3 Unlocked** | +10 Max Cognition (150), learn Tier 3 Spells | +5 Max Favor (125), learn Tier 3 Prayers |
| **Level 7** | **Tier 3** | +10 Max Cognition (160) | +5 Max Divine Favor (130) |
| **Level 8** | **Tier 3** | +10 Max Cognition (170) | +5 Max Divine Favor (135) |
| **Level 9** | **Tier 4 Unlocked** | +10 Max Cognition (180), learn Tier 4 Spells | +5 Max Favor (140), learn Tier 4 Prayers |
| **Level 10** | **Tier 4** | +10 Max Cognition (190) | +5 Max Divine Favor (145) |

### Attribute Scaling at Character Creation
- **Intelligence (Mage Starting Grimoire Size)**:
  - INT ≤ 12: 2 starting formulas
  - INT 13–15: 3 starting formulas
  - INT 16–17: 4 starting formulas
  - INT 18: 5 starting formulas
- **Wisdom (Cleric Starting Prepared Prayers)**:
  - WIS ≤ 12: 1 prepared prayer
  - WIS 13–15: 2 prepared prayers
  - WIS 16–17: 3 prepared prayers
  - WIS 18: 4 prepared prayers

---

## 6. COMPLETE SPELL & PRAYER COMPENDIUM

### ARCANE SPELLS (MAGE)

#### Tier 1 Arcane
- **Magic Missile**
  - *Load*: 20 Cognition | *Casting*: Instant | *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Releases glowing darts of magical force that strike unfailingly for **3d4+3** damage. Cannot miss.
- **Sleep**
  - *Load*: 30 Cognition | *Casting*: Normal | *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Overcomes the mind of a foe with magical slumber for **2 rounds** (effective against creatures with 30 HP or fewer).
- **Shield**
  - *Load*: 15 Cognition | *Casting*: Instant | *Target*: Self | *Timing*: Combat
  - *Effect*: An invisible barrier turns aside blows, improving Armor Class by **+2 AC** for **4 rounds**.
- **Light**
  - *Load*: 15 Cognition | *Casting*: Instant | *Target*: Party | *Timing*: Exploration
  - *Effect*: Conjures a floating orb of arcane radiance illuminating the dungeon for **240 seconds (60 exploration minutes)**.
- **Burning Hands**
  - *Load*: 25 Cognition | *Casting*: Instant | *Target*: All Enemies | *Timing*: Combat
  - *Effect*: A searing fan of flame erupts from fingertips, dealing **1d3+2 fire damage** to each foe.
- **Shocking Grasp**
  - *Load*: 20 Cognition | *Casting*: Instant | *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Crackles with electric touch discharge dealing **1d8+1 lightning damage**.
- **Armor**
  - *Load*: 20 Cognition | *Casting*: Instant | *Target*: Self | *Timing*: Combat & Exploration
  - *Effect*: Encases the wizard in a magical force field, granting **+2 AC** for **6 rounds**.

#### Tier 2 Arcane (Unlocks at Level 3)
- **Fireball**
  - *Load*: 40 Cognition | *Casting*: Normal | *Target*: All Enemies | *Timing*: Combat
  - *Effect*: A roaring bead detonates into an explosive inferno, dealing **5d6 fire damage** to all enemies.
- **Invisibility**
  - *Load*: 35 Cognition | *Casting*: Normal | *Target*: Self | *Timing*: Combat
  - *Effect*: Vanishes from sight, granting **+4 AC** dodge protection for **6 rounds**.
- **Web**
  - *Load*: 30 Cognition | *Casting*: Normal | *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Ensnaring strands immobilize a target, inflicting a **-3 to-hit penalty** for **4 rounds**.

#### Tier 3 Arcane (Unlocks at Level 6)
- **Lightning Bolt**
  - *Load*: 50 Cognition | *Casting*: Normal | *Target*: All Enemies | *Timing*: Combat
  - *Effect*: A blinding stroke of lightning pierces enemy ranks, inflicting **5d6 lightning damage** to each target.
- **Ice Storm**
  - *Load*: 45 Cognition | *Casting*: Normal | *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Freezing sleet and jagged hailstones strike a foe, inflicting a **-2 to-hit penalty** for **5 rounds**.
- **Haste**
  - *Load*: 40 Cognition | *Casting*: Instant | *Target*: Party | *Timing*: Combat
  - *Effect*: Accelerates physical momentum, giving all party members **+2 to-hit** for **2 rounds**.

#### Tier 4 Arcane (Unlocks at Level 9)
- **Chain Lightning**
  - *Load*: 60 Cognition | *Casting*: Normal | *Target*: All Enemies | *Timing*: Combat
  - *Effect*: A devastating electrical discharge leaps between enemies, blasting each for **8d6 lightning damage**.
- **Time Stop**
  - *Load*: 70 Cognition | *Casting*: Instant | *Target*: Self | *Timing*: Combat
  - *Effect*: Suspends the local time continuum, granting **+3 attack bonus** and overwhelming tactical superiority for **1 round**.

---

### DIVINE PRAYERS (CLERIC)

#### Tier 1 Divine
- **Bless**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: Instills holy courage, granting **+1 to-hit** to all living companions for **4 rounds**.
- **Cure Light Wounds**
  - *Target*: Single Ally | *Timing*: Combat & Exploration
  - *Effect*: Channels soothing positive energy to restore **1d8 HP** to a wounded ally.
- **Sanctuary**
  - *Target*: Self | *Timing*: Combat & Exploration
  - *Effect*: An aura of divine peace turns aside attacks, providing **+2 AC** for **3 rounds**.
- **Detect Evil**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: Senses malevolence and warns the party, granting **+1 to-hit** for **4 rounds**.
- **Remove Fear**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: Bolsters spiritual resolve against dread and despair, granting **+1 to-hit** for **4 rounds**.
- **Cause Light Wounds**
  - *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Channels retribution through touch, inflicting **1d8 holy/unholy damage** upon a foe.
- **Purify Food & Drink**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: Cleanses trail rations and blesses companions, restoring **1d4 HP** to each party member.

#### Tier 2 Divine (Unlocks at Level 3)
- **Holy Blessing**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: A wave of divine grace washes over the fellowship, healing **1d8 HP** to each living companion.
- **Spiritual Hammer**
  - *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Conjures a flying hammer of luminous force that smites a foe for **2d6+1 damage**.
- **Hold Person**
  - *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Binds a humanoid target in spiritual paralysis, inflicting a **-4 to-hit penalty** for **3 rounds**.

#### Tier 3 Divine (Unlocks at Level 6)
- **Cure Serious Wounds**
  - *Target*: Single Ally | *Timing*: Combat & Exploration
  - *Effect*: A concentrated surge of positive energy mends deep flesh, restoring **2d8+1 HP**.
- **Blade Barrier**
  - *Target*: All Enemies | *Timing*: Combat
  - *Effect*: Summons a whirling wall of razor-sharp divine force blades, slashing each enemy for **4d8 damage**.
- **Dispel Evil**
  - *Target*: Single Enemy | *Timing*: Combat
  - *Effect*: Shatters dark enchantments and strips supernatural defenses, imposing a **-3 AC penalty** for **4 rounds**.

#### Tier 4 Divine (Unlocks at Level 9)
- **Heal**
  - *Target*: Single Ally | *Timing*: Combat & Exploration
  - *Effect*: A miraculous outpouring of grace that mends catastrophic wounds, restoring **4d8+4 HP**.
- **Divine Intervention**
  - *Target*: Party | *Timing*: Combat & Exploration
  - *Effect*: Direct intervention by the deity, restoring **2d8+2 HP** to every party member simultaneously.
