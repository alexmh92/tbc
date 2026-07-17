import { Player as PlayerProto } from '../../../proto/api';

export interface LegacyTbcImport {
	charClass: PlayerProto['class'];
	equipmentSpec: NonNullable<PlayerProto['equipment']>;
	race: PlayerProto['race'];
	talentsStr: string;
}

export const parseLegacyTbcJson = (data: string): LegacyTbcImport | null => {
	const json = JSON.parse(data);
	if (!json || typeof json !== 'object' || Array.isArray(json)) return null;

	const player = json.player;
	const isLegacyExport =
		player &&
		typeof player === 'object' &&
		(Array.isArray(player.bonusStats) || Object.prototype.hasOwnProperty.call(player, 'consumes') || Array.isArray(json.epWeights));
	if (!isLegacyExport || !player.equipment) return null;

	const legacyPlayer = PlayerProto.fromJson(
		{
			class: player.class,
			equipment: player.equipment,
			race: player.race,
			talentsString: player.talentsString,
		},
		{ ignoreUnknownFields: true },
	);
	if (!legacyPlayer.equipment) return null;

	return {
		charClass: legacyPlayer.class,
		equipmentSpec: legacyPlayer.equipment,
		race: legacyPlayer.race,
		talentsStr: legacyPlayer.talentsString,
	};
};
