import * as PresetUtils from '../../core/preset_utils.js';
import {
	Class,
	ConsumesSpec,
	Debuffs,
	Drums,
	IndividualBuffs,
	PartyBuffs,
	Profession,
	Race,
	RaidBuffs,
	Stat,
	TristateEffect,
	UnitReference,
} from '../../core/proto/common.js';
import { BalanceDruid_Options as BalanceDruidOptions } from '../../core/proto/druid.js';
import { SavedTalents } from '../../core/proto/ui.js';
import { Stats } from '../../core/proto_utils/stats';
import { defaultRaidBuffMajorDamageCooldowns } from '../../core/proto_utils/utils';
import DefaultAPL from './apls/default.apl.json';
import PreraidGear from './gear_sets/preraid.gear.json';
import Phase1AllianceGear from './gear_sets/p1_a.gear.json';
import Phase2AllianceGear from './gear_sets/p2_a.gear.json';
import Phase3Gear from './gear_sets/p3.gear.json';
import Phase4Gear from './gear_sets/p4.gear.json';
import Phase5Gear from './gear_sets/p5.gear.json';

export const PreraidPresetGear = PresetUtils.makePresetGear('Pre-raid', PreraidGear);
export const Phase1AlliancePresetGear = PresetUtils.makePresetGear('Phase 1 (A)', Phase1AllianceGear);
export const Phase2AlliancePresetGear = PresetUtils.makePresetGear('Phase 2 (A)', Phase2AllianceGear);
export const Phase3PresetGear = PresetUtils.makePresetGear('Phase 3', Phase3Gear);
export const Phase4PresetGear = PresetUtils.makePresetGear('Phase 4', Phase4Gear);
export const Phase5PresetGear = PresetUtils.makePresetGear('Phase 5', Phase5Gear);

export const StandardRotation = PresetUtils.makePresetAPLRotation('Default', DefaultAPL);

export const PreRaidEPWeights = PresetUtils.makePresetEpWeights(
	'Pre-raid',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.6,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 0.99,
		[Stat.StatNatureDamage]: 0.01,
		[Stat.StatSpellHitRating]: 1.56,
		[Stat.StatSpellCritRating]: 0.59,
		[Stat.StatSpellHasteRating]: 1.13,
		[Stat.StatSpirit]: 0.14,
		[Stat.StatMP5]: 0.08,
	}),
);

export const Phase1EPWeights = PresetUtils.makePresetEpWeights(
	'Phase 1',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.64,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 0.99,
		[Stat.StatNatureDamage]: 0.01,
		[Stat.StatSpellHitRating]: 1.58,
		[Stat.StatSpellCritRating]: 0.67,
		[Stat.StatSpellHasteRating]: 1.16,
		[Stat.StatSpirit]: 0.13,
		[Stat.StatMP5]: 0.05,
	}),
);

export const Phase2EPWeights = PresetUtils.makePresetEpWeights(
	'Phase 2',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.54,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 0.99,
		[Stat.StatNatureDamage]: 0.01,
		[Stat.StatSpellHitRating]: 1.56,
		[Stat.StatSpellCritRating]: 0.63,
		[Stat.StatSpellHasteRating]: 1.16,
		[Stat.StatSpirit]: 0.12,
		[Stat.StatMP5]: 0.06,
	}),
);

export const Phase3EPWeights = PresetUtils.makePresetEpWeights(
	'Phase 3',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.56,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 1,
		[Stat.StatNatureDamage]: 0,
		[Stat.StatSpellHitRating]: 1.76,
		[Stat.StatSpellCritRating]: 0.64,
		[Stat.StatSpellHasteRating]: 0.48,
		[Stat.StatSpirit]: 0.14,
		[Stat.StatMP5]: 0.1,
	}),
);

export const Phase3_5EPWeights = PresetUtils.makePresetEpWeights(
	'Phase 3.5',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.57,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 1,
		[Stat.StatNatureDamage]: 0,
		[Stat.StatSpellHitRating]: 1.68,
		[Stat.StatSpellCritRating]: 0.67,
		[Stat.StatSpellHasteRating]: 1,
		[Stat.StatSpirit]: 0.13,
		[Stat.StatMP5]: 0.05,
	}),
);

export const Phase4EPWeights = PresetUtils.makePresetEpWeights(
	'Phase 4',
	Stats.fromMap({
		[Stat.StatIntellect]: 0.59,
		[Stat.StatSpellDamage]: 1,
		[Stat.StatArcaneDamage]: 1,
		[Stat.StatNatureDamage]: 0,
		[Stat.StatSpellHitRating]: 1.78,
		[Stat.StatSpellCritRating]: 0.7,
		[Stat.StatSpellHasteRating]: 1.22,
		[Stat.StatSpirit]: 0.16,
		[Stat.StatMP5]: 0.11,
	}),
);

export const DefaultEPWeights = PresetUtils.makePresetEpWeights('Default (P2)', Phase2EPWeights.epWeights);
// Default talents. Uses the wowhead calculator format, make the talents on
// https://wowhead.com/tbc/talent-calc and copy the numbers in the url.
export const StandardTalents = {
	name: 'Standard',
	data: SavedTalents.create({
		talentsString: '510022312503135231351--520033',
	}),
};

export const DefaultOptions = BalanceDruidOptions.create({
	classOptions: {
		innervateTarget: UnitReference.create(),
	},
});

export const DefaultRaidBuffs = RaidBuffs.create({
	...defaultRaidBuffMajorDamageCooldowns(Class.ClassShaman),
	arcaneBrilliance: true,
	giftOfTheWild: TristateEffect.TristateEffectImproved,
	powerWordFortitude: TristateEffect.TristateEffectImproved,
	divineSpirit: TristateEffect.TristateEffectImproved,
});

export const DefaultPartyBuffs = PartyBuffs.create({
	chainOfTheTwilightOwl: true,
	draeneiRacialCaster: true,
	drums: Drums.LesserDrumsOfBattle,
	eyeOfTheNight: true,
	totemOfWrath: 1,
	wrathOfAirTotem: TristateEffect.TristateEffectImproved,
});

export const DefaultIndividualBuffs = IndividualBuffs.create({
	blessingOfKings: true,
	blessingOfWisdom: TristateEffect.TristateEffectImproved,
	shadowPriestDps: 800,
});

export const DefaultDebuffs = Debuffs.create({
	bloodFrenzy: true,
	curseOfElements: TristateEffect.TristateEffectImproved,
	curseOfRecklessness: true,
	exposeArmor: TristateEffect.TristateEffectImproved,
	giftOfArthas: true,
	huntersMark: TristateEffect.TristateEffectImproved,
	improvedSealOfTheCrusader: TristateEffect.TristateEffectImproved,
	judgementOfWisdom: true,
	mangle: true,
	misery: true,
	sunderArmor: true,
});

export const DefaultConsumables = ConsumesSpec.create({
	conjuredId: 12662, // Demonic Rune
	drumsId: Drums.LesserDrumsOfBattle,
	flaskId: 22861, // Flask of Blinding Light
	foodId: 27657, // Blackened Basilisk
	mhImbueId: 25122, // Brilliant Wizard Oil
	potId: 22832, // Super Mana Potion
});

export const OtherDefaults = {
	distanceFromTarget: 20,
	profession1: Profession.Enchanting,
	profession2: Profession.Tailoring,
	race: Race.RaceNightElf,
};
