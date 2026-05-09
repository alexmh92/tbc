import { OtherDefaults as SimUIOtherDefaults } from '../../core/individual_sim_ui';
import * as PresetUtils from '../../core/preset_utils.js';
import { ConsumesSpec, HealingModel, Profession, Race, Spec, Stat } from '../../core/proto/common';
import { FeralBearDruid_Options as DruidOptions, FeralBearDruid_Rotation as DruidRotation, FeralBearDruid_Rotation_SwipeUsage as SwipeUsage } from '../../core/proto/druid.js';
import { SavedTalents } from '../../core/proto/ui.js';
import { Stats } from '../../core/proto_utils/stats';
import PreraidGear from './gear_sets/preraid.gear.json';
import P1Gear from './gear_sets/p1.gear.json';
import P2Gear from './gear_sets/p2.gear.json';
import P3Gear from './gear_sets/p3.gear.json';
import P4Gear from './gear_sets/p4.gear.json';
import P5Gear from './gear_sets/p5.gear.json';
import P2HydrossFrostGear from './gear_sets/p2_hydross_frost.gear.json';
import P2HydrossNatureGear from './gear_sets/p2_hydross_nature.gear.json';

// Preset options for this spec.
export const PRERAID_PRESET = PresetUtils.makePresetGear('Pre-Raid', PreraidGear, { group: 'Default' });
export const P1_PRESET = PresetUtils.makePresetGear('P1', P1Gear, { group: 'Default' });
export const P2_PRESET = PresetUtils.makePresetGear('P2', P2Gear, { group: 'Default' });
export const P3_PRESET = PresetUtils.makePresetGear('P3', P3Gear, { group: 'Default' });
export const P4_PRESET = PresetUtils.makePresetGear('P4', P4Gear, { group: 'Default' });
export const P5_PRESET = PresetUtils.makePresetGear('P5', P5Gear, { group: 'Default' });
export const P2_HYDROSS_FROST_PRESET = PresetUtils.makePresetGear('Hydross (Frost Resist)', P2HydrossFrostGear, { group: 'Encounter specific' });
export const P2_HYDROSS_NATURE_PRESET = PresetUtils.makePresetGear('Hydross (Nature Resist)', P2HydrossNatureGear, { group: 'Encounter specific' });

export const DefaultSimpleRotation = DruidRotation.create({
	maintainFaerieFire: true,
	maintainDemoralizingRoar: true,
	maulRageThreshold: 50,
	swipeUsage: SwipeUsage.SwipeUsage_WithEnoughAP,
	swipeApThreshold: 2700,
});

import DefaultApl from './apls/default.apl.json';
export const ROTATION_SIMPLE = PresetUtils.makePresetSimpleRotation('Simple', Spec.SpecFeralBearDruid, DefaultSimpleRotation);
export const ROTATION_DEFAULT = PresetUtils.makePresetAPLRotation('APL', DefaultApl);

import DefaultBuild from './builds/default_encounter_only.build.json';
import MagtheridonBuild from './builds/magtheridon_encounter_only.build.json';
import KarazhanBuild from './builds/karazhan_encounter_only.build.json';
import MorogrimBuild from './builds/morogrim_encounter_only.build.json';
import HydrossBuild from './builds/hydross_encounter_only.build.json';
export const DEFAULT_PRESET_BUILD = PresetUtils.makePresetBuildFromJSON('Default', Spec.SpecFeralBearDruid, DefaultBuild);
export const MAGTHERIDON_PRESET_BUILD = PresetUtils.makePresetBuildFromJSON('Magtheridon', Spec.SpecFeralBearDruid, MagtheridonBuild);
export const KARAZHAN_PRESET_BUILD = PresetUtils.makePresetBuildFromJSON('Karazhan (Boss Average)', Spec.SpecFeralBearDruid, KarazhanBuild);
export const MOROGRIM_PRESET_BUILD = PresetUtils.makePresetBuildFromJSON('Morogrim', Spec.SpecFeralBearDruid, MorogrimBuild);
export const HYDROSS_PRESET_BUILD = PresetUtils.makePresetBuildFromJSON('Hydross', Spec.SpecFeralBearDruid, HydrossBuild);

// Preset options for EP weights
export const P1_EP_PRESET = PresetUtils.makePresetEpWeights(
	'P1',
	Stats.fromMap({
		[Stat.StatStrength]: 0.452,
		[Stat.StatAgility]: 0.763,
		[Stat.StatStamina]: 1.025,
		[Stat.StatAttackPower]: 0.200,
		[Stat.StatFeralAttackPower]: 0.200,
		[Stat.StatMeleeHitRating]: 0.941,
		[Stat.StatMeleeCritRating]: 0.373,
		[Stat.StatMeleeHasteRating]: 0.438,
		[Stat.StatArmorPenetration]: 0.070,
		[Stat.StatExpertiseRating]: 2.147,
		[Stat.StatDefenseRating]: 0.326,
		[Stat.StatDodgeRating]: 0.228,
		[Stat.StatResilienceRating]: 0.388,
		[Stat.StatArmor]: 0.135,
		[Stat.StatBonusArmor]: 0.135,
		[Stat.StatPhysicalDamage]: 1.203,
	}),
);

// Default talents — Standard feral bear TBC build.
export const StandardTalents = {
	name: 'Standard',
	data: SavedTalents.create({
		talentsString: '-503032132322105301251-05503301',
	}),
};

// Alternative talents focused on Demoralizing Roar uptime.
export const DemoRoarTalents = {
	name: 'DemoRoar',
	data: SavedTalents.create({
		talentsString: '-553032132322105301051-05503001',
	}),
};

export const DefaultOptions = DruidOptions.create({
	startingRage: 0,
});

export const DefaultConsumables = ConsumesSpec.create({
	battleElixirId: 22831,  // Elixir of Major Agility
	guardianElixirId: 9088, // Gift of Arthas
	foodId: 27667,          // Spicy Crawdad
	potId: 22849,           // Ironshield Potion
	conjuredId: 22105,      // Healthstone
    mhImbueId: 34340,       // Adamantite Weightstone
	goblinSapper: true,
	superSapper: true,
	scrollAgi: true,
	scrollStr: true,
	scrollArm: true,
	nightmareSeed: true,
});

export const OtherDefaults: Partial<SimUIOtherDefaults> = {
	profession1: Profession.Engineering,
	profession2: Profession.Enchanting,
	race: Race.RaceNightElf,
	distanceFromTarget: 0,
	reactionTime: 250,
	healingModel: HealingModel.create({
		hps: 2200,
		cadenceSeconds: 0.4,
		cadenceVariation: 1.2,
		absorbFrac: 0.02,
		burstWindow: 6,
		inspirationUptime: 0.25,
	}),
};
