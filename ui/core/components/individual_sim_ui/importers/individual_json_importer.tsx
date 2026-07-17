import { IndividualSimUI } from '../../../individual_sim_ui';
import { Spec } from '../../../proto/common';
import { IndividualSimSettings } from '../../../proto/ui';
import { Database } from '../../../proto_utils/database';
import { TypedEvent } from '../../../typed_event';
import Toast from '../../toast';
import { IndividualImporter } from './individual_importer';
import { parseLegacyTbcJson } from './legacy_tbc_json';
import i18n from '../../../../i18n/config';

export class IndividualJsonImporter<SpecType extends Spec> extends IndividualImporter<SpecType> {
	constructor(parent: HTMLElement, simUI: IndividualSimUI<SpecType>) {
		super(parent, simUI, { title: i18n.t('import.json.title'), allowFileUpload: true });

		this.descriptionElem.appendChild(
			<div>
				<p>{i18n.t('import.json.description')}</p>
				<p>{i18n.t('import.json.instructions')}</p>
			</div>,
		);
	}

	async onImport(data: string) {
		let proto: ReturnType<typeof IndividualSimSettings.fromJsonString> | null = null;
		try {
			proto = IndividualSimSettings.fromJsonString(data, { ignoreUnknownFields: true });
		} catch {
			try {
				const legacy = parseLegacyTbcJson(data);
				if (!legacy) throw new Error();
				await this.finishIndividualImport(this.simUI, { ...legacy, professions: [] });
				new Toast({
					variant: 'info',
					body: 'Imported gear, race, and talents from the legacy TBC WoWSims JSON. Review your rotation, buffs, and consumes before simming.',
				});
				return;
			} catch {
				throw new Error(i18n.t('import.json.error_invalid_json'));
			}
		}
		if (proto.player?.equipment) {
			await Database.loadLeftoversIfNecessary(proto.player.equipment);
		}
		if (this.simUI.isWithinRaidSim) {
			if (proto.player) {
				this.simUI.player.fromProto(TypedEvent.nextEventID(), proto.player);
			}
		} else {
			this.simUI.fromProto(TypedEvent.nextEventID(), proto);
		}
		this.close();
	}
}
