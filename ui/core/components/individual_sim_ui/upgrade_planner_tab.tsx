import clsx from 'clsx';
import { ref } from 'tsx-vanilla';

import { translateSlotName } from '../../../i18n/localization';
import { IndividualSimUI, IndividualSimUIConfig } from '../../individual_sim_ui';
import { PresetGear } from '../../preset_utils';
import { DistributionMetrics, ProgressMetrics, RaidSimResult } from '../../proto/api';
import { HandType, ItemSlot, ItemSpec } from '../../proto/common';
import { EquippedItem } from '../../proto_utils/equipped_item';
import { Gear } from '../../proto_utils/gear';
import { RequestTypes } from '../../sim_signal_manager';
import { formatToNumber } from '../../utils';
import { ProgressTrackerModal } from '../progress_tracker_modal';
import { SimTab } from '../sim_tab';
import Toast from '../toast';

type UpgradePlannerConfig = NonNullable<IndividualSimUIConfig<any>['upgradePlanner']>;

export interface UpgradeCandidate {
	key: string;
	itemSpec: ItemSpec;
	phaseNames: Array<string>;
	slot: ItemSlot;
}

type UpgradeResultStatus = 'simulated' | 'owned' | 'dependency' | 'error';

export interface UpgradeResult {
	candidate: UpgradeCandidate;
	status: UpgradeResultStatus;
	baselineDps: number;
	candidateDps?: number;
	dpsDelta?: number;
	dpsPercent?: number;
	isSignificant?: boolean;
	message?: string;
}

interface CandidateWork {
	candidate: UpgradeCandidate;
	gears: Array<Gear>;
	status?: Exclude<UpgradeResultStatus, 'simulated'>;
	message?: string;
}

const normalizeCandidateSlot = (slot: ItemSlot): ItemSlot => {
	if (slot === ItemSlot.ItemSlotFinger2) return ItemSlot.ItemSlotFinger1;
	if (slot === ItemSlot.ItemSlotTrinket2) return ItemSlot.ItemSlotTrinket1;
	return slot;
};

const candidateSlots = (slot: ItemSlot): Array<ItemSlot> => {
	if (slot === ItemSlot.ItemSlotFinger1) return [ItemSlot.ItemSlotFinger1, ItemSlot.ItemSlotFinger2];
	if (slot === ItemSlot.ItemSlotTrinket1) return [ItemSlot.ItemSlotTrinket1, ItemSlot.ItemSlotTrinket2];
	return [slot];
};

export const buildUpgradeCandidates = (presets: Array<PresetGear>): Array<UpgradeCandidate> => {
	const candidates = new Map<string, UpgradeCandidate>();

	for (const preset of presets) {
		preset.gear.items.forEach((itemSpec, index) => {
			if (!itemSpec.id) return;

			const slot = normalizeCandidateSlot(index as ItemSlot);
			const key = `${slot}:${ItemSpec.toJsonString(itemSpec)}`;
			const existing = candidates.get(key);
			if (existing) {
				if (!existing.phaseNames.includes(preset.name)) existing.phaseNames.push(preset.name);
				return;
			}

			candidates.set(key, {
				key,
				itemSpec: ItemSpec.clone(itemSpec),
				phaseNames: [preset.name],
				slot,
			});
		});
	}

	return Array.from(candidates.values());
};

export class UpgradePlannerTab extends SimTab {
	private readonly individualSimUI: IndividualSimUI<any>;
	private readonly plannerConfig: UpgradePlannerConfig;
	private readonly availablePresets: Array<PresetGear>;
	private readonly selectedPresetNames = new Set<string>();

	private readonly presetListElem: HTMLElement;
	private readonly resultsElem: HTMLElement;
	private readonly staleElem: HTMLElement;
	private readonly runButton: HTMLButtonElement;
	private readonly clearButton: HTMLButtonElement;
	private readonly progressModal: ProgressTrackerModal;

	private results: Array<UpgradeResult> = [];
	private isRunning = false;
	private isCancelling = false;
	private abortController: AbortController | null = null;

	constructor(parentElem: HTMLElement, simUI: IndividualSimUI<any>, config: UpgradePlannerConfig) {
		super(parentElem, simUI, { identifier: 'upgrade-planner-tab', title: 'Upgrade Planner' });

		this.individualSimUI = simUI;
		this.plannerConfig = config;
		this.availablePresets = simUI.individualConfig.presets.gear.filter(preset => !preset.enableWhen || preset.enableWhen(simUI.player));

		const presetListRef = ref<HTMLDivElement>();
		const resultsRef = ref<HTMLDivElement>();
		const staleRef = ref<HTMLDivElement>();
		const runButtonRef = ref<HTMLButtonElement>();
		const clearButtonRef = ref<HTMLButtonElement>();

		this.contentContainer.appendChild(
			<div className="upgrade-planner-layout">
				<section className="upgrade-planner-controls">
					<h3>BiS presets</h3>
					<p className="text-body-secondary">
						Select one or more presets. Each preset item is tested as a single swap against your current imported gear.
					</p>
					<div className="upgrade-planner-preset-list" ref={presetListRef} />
					<div className="upgrade-planner-actions">
						<button className="btn btn-primary" ref={runButtonRef}>
							<i className="fa fa-bolt me-1" /> Sim upgrades
						</button>
						<button className="btn btn-outline-secondary" ref={clearButtonRef}>
							Clear results
						</button>
					</div>
					<p className="upgrade-planner-attribution">
						Simulation engine and data from{' '}
						<a href="https://github.com/wowsims/tbc-new" target="_blank" rel="noreferrer">
							WoWSims TBC
						</a>
						.
					</p>
				</section>
				<section className="upgrade-planner-results">
					<div className="alert alert-warning upgrade-planner-stale d-none" ref={staleRef}>
						Your gear or simulation settings changed. Run the planner again before using these results.
					</div>
					<div ref={resultsRef} />
				</section>
			</div>,
		);

		this.presetListElem = presetListRef.value!;
		this.resultsElem = resultsRef.value!;
		this.staleElem = staleRef.value!;
		this.runButton = runButtonRef.value!;
		this.clearButton = clearButtonRef.value!;

		this.progressModal = new ProgressTrackerModal(simUI.rootElem, {
			id: 'upgrade-planner-progress',
			title: 'Upgrade Planner',
			hasProgressBar: true,
			onCancel: () => this.cancel(),
		});

		this.loadSelectedPresets();
		this.buildPresetList();
		this.renderEmptyState();

		this.runButton.addEventListener('click', () => this.run());
		this.clearButton.addEventListener('click', () => this.clearResults());
		this.individualSimUI.changeEmitter.on(() => {
			if (!this.isRunning && this.results.length) this.markStale();
		});
	}

	protected buildTabContent(): void {}

	private loadSelectedPresets() {
		const availableNames = new Set(this.availablePresets.map(preset => preset.name));
		let selected = this.plannerConfig.defaultPresetNames;
		try {
			const saved = window.localStorage.getItem(this.plannerConfig.storageKey);
			if (saved) selected = JSON.parse(saved) as Array<string>;
		} catch (error) {
			console.warn('Unable to load Upgrade Planner preset selection.', error);
		}

		selected.filter(name => availableNames.has(name)).forEach(name => this.selectedPresetNames.add(name));
	}

	private buildPresetList() {
		this.presetListElem.replaceChildren();
		for (const preset of this.availablePresets) {
			const inputRef = ref<HTMLInputElement>();
			const id = `upgrade-planner-preset-${preset.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
			const row = (
				<div className="form-check">
					<input className="form-check-input" type="checkbox" id={id} checked={this.selectedPresetNames.has(preset.name)} ref={inputRef} />
					<label className="form-check-label" htmlFor={id}>
						{preset.name}
					</label>
				</div>
			);
			this.presetListElem.appendChild(row);
			inputRef.value!.addEventListener('change', () => {
				if (inputRef.value!.checked) this.selectedPresetNames.add(preset.name);
				else this.selectedPresetNames.delete(preset.name);
				window.localStorage.setItem(this.plannerConfig.storageKey, JSON.stringify(Array.from(this.selectedPresetNames)));
				this.clearResults();
			});
		}
	}

	private getSelectedPresets(): Array<PresetGear> {
		return this.availablePresets.filter(preset => this.selectedPresetNames.has(preset.name));
	}

	private prepareCandidate(candidate: UpgradeCandidate, baselineGear: Gear): CandidateWork {
		const item = this.individualSimUI.sim.db.lookupItemSpec(candidate.itemSpec)?.withDynamicStats();
		if (!item) return { candidate, gears: [], status: 'error', message: 'Item data is unavailable.' };

		const slots = candidateSlots(candidate.slot);
		if (slots.some(slot => baselineGear.getEquippedItem(slot)?.id === item.id)) {
			return { candidate, gears: [], status: 'owned', message: 'Already equipped' };
		}

		if (
			candidate.slot === ItemSlot.ItemSlotOffHand &&
			baselineGear.getEquippedItem(ItemSlot.ItemSlotMainHand)?.item.handType === HandType.HandTypeTwoHand
		) {
			return { candidate, gears: [], status: 'dependency', message: 'Requires a compatible one-handed weapon' };
		}

		const gears = slots.map(slot => baselineGear.withEquippedItem(slot, item));
		return { candidate, gears: this.deduplicateGears(gears) };
	}

	private deduplicateGears(gears: Array<Gear>): Array<Gear> {
		const unique = new Map<string, Gear>();
		for (const gear of gears) unique.set(JSON.stringify(gear.asSpec()), gear);
		return Array.from(unique.values());
	}

	private async run() {
		if (this.isRunning) return;
		const selectedPresets = this.getSelectedPresets();
		if (!selectedPresets.length) {
			new Toast({ variant: 'error', body: 'Select at least one BiS preset.' });
			return;
		}

		this.isRunning = true;
		this.isCancelling = false;
		this.abortController = new AbortController();
		this.runButton.disabled = true;
		this.clearButton.disabled = true;
		this.staleElem.classList.add('d-none');
		this.progressModal.show();

		let completedSims = 0;

		try {
			await this.individualSimUI.sim.waitForInit();
			const baselineGear = this.individualSimUI.player.getGear();
			const work = buildUpgradeCandidates(selectedPresets).map(candidate => this.prepareCandidate(candidate, baselineGear));
			const totalSims = 1 + work.reduce((total, candidate) => total + candidate.gears.length, 0);

			await this.individualSimUI.sim.signalManager.abortType(RequestTypes.All);
			const baselineResult = await this.runGearSim(baselineGear, completedSims, totalSims, 'Current gear');
			completedSims += 1;
			const baselineMetrics = baselineResult.raidMetrics!.dps!;
			const results: Array<UpgradeResult> = [];

			for (const candidateWork of work) {
				this.throwIfCancelled();
				if (candidateWork.status) {
					results.push({
						candidate: candidateWork.candidate,
						status: candidateWork.status,
						baselineDps: baselineMetrics.avg,
						message: candidateWork.message,
					});
					continue;
				}

				try {
					const metrics: Array<DistributionMetrics> = [];
					for (const gear of candidateWork.gears) {
						const result = await this.runGearSim(gear, completedSims, totalSims, this.getItemName(candidateWork.candidate));
						completedSims += 1;
						metrics.push(result.raidMetrics!.dps!);
					}
					const best = metrics.sort((a, b) => b.avg - a.avg)[0];
					const delta = best.avg - baselineMetrics.avg;
					results.push({
						candidate: candidateWork.candidate,
						status: 'simulated',
						baselineDps: baselineMetrics.avg,
						candidateDps: best.avg,
						dpsDelta: delta,
						dpsPercent: baselineMetrics.avg ? (delta / baselineMetrics.avg) * 100 : 0,
						isSignificant: this.isStatisticallySignificant(baselineMetrics, best),
					});
				} catch (error) {
					this.throwIfCancelled();
					results.push({
						candidate: candidateWork.candidate,
						status: 'error',
						baselineDps: baselineMetrics.avg,
						message: error instanceof Error ? error.message : 'Simulation failed',
					});
				}
			}

			this.results = this.sortResults(results);
			this.renderResults();
		} catch (error) {
			if (!this.isCancelling) {
				new Toast({ variant: 'error', body: error instanceof Error ? error.message : 'Upgrade simulation failed.' });
			}
		} finally {
			this.isRunning = false;
			this.isCancelling = false;
			this.abortController = null;
			this.runButton.disabled = false;
			this.clearButton.disabled = false;
			this.progressModal.hide();
		}
	}

	private async runGearSim(gear: Gear, completedSims: number, totalSims: number, label: string): Promise<RaidSimResult> {
		this.throwIfCancelled();
		const response = await this.individualSimUI.runSimLightweight(gear, (progress: ProgressMetrics) => {
			const fraction = progress.totalIterations ? progress.completedIterations / progress.totalIterations : 0;
			this.progressModal.updateProgress({
				stage: 'simulating',
				title: `Simulating ${label}`,
				current: completedSims + fraction,
				total: totalSims,
			});
		});
		this.throwIfCancelled();
		if (!response || 'type' in response) throw new Error('The simulator did not return a result.');
		return response[1];
	}

	private isStatisticallySignificant(baseline: DistributionMetrics, candidate: DistributionMetrics): boolean {
		const iterations = this.individualSimUI.sim.getIterations();
		const standardError = Math.sqrt(Math.pow(baseline.stdev / Math.sqrt(iterations), 2) + Math.pow(candidate.stdev / Math.sqrt(iterations), 2));
		return standardError > 0 && Math.abs(candidate.avg - baseline.avg) / standardError > 1.96;
	}

	private sortResults(results: Array<UpgradeResult>): Array<UpgradeResult> {
		const order: Record<UpgradeResultStatus, number> = { simulated: 0, owned: 1, dependency: 2, error: 3 };
		return results.sort((a, b) => order[a.status] - order[b.status] || (b.dpsDelta ?? Number.NEGATIVE_INFINITY) - (a.dpsDelta ?? Number.NEGATIVE_INFINITY));
	}

	private getItemName(candidate: UpgradeCandidate): string {
		return this.individualSimUI.sim.db.lookupItemSpec(candidate.itemSpec)?.item.name || `Item ${candidate.itemSpec.id}`;
	}

	private getSlotName(slot: ItemSlot): string {
		if (slot === ItemSlot.ItemSlotFinger1) return 'Finger';
		if (slot === ItemSlot.ItemSlotTrinket1) return 'Trinket';
		return translateSlotName(slot);
	}

	private renderResults() {
		const rows = this.results.map(result => {
			const deltaClass = result.dpsDelta === undefined ? '' : result.dpsDelta > 0 ? 'positive' : result.dpsDelta < 0 ? 'negative' : '';
			return (
				<tr>
					<td>
						{result.candidate.phaseNames.map(name => (
							<span className="badge text-bg-secondary upgrade-planner-phase-badge">{name}</span>
						))}
					</td>
					<td>{this.getSlotName(result.candidate.slot)}</td>
					<td>
						<a
							className="upgrade-planner-item-link"
							href={`https://www.wowhead.com/tbc/item=${result.candidate.itemSpec.id}`}
							target="_blank"
							rel="noreferrer">
							{this.getItemName(result.candidate)}
						</a>
					</td>
					<td>{formatToNumber(result.baselineDps)}</td>
					<td>{result.candidateDps === undefined ? '-' : formatToNumber(result.candidateDps)}</td>
					<td className={deltaClass}>{result.dpsDelta === undefined ? '-' : `${result.dpsDelta >= 0 ? '+' : ''}${result.dpsDelta.toFixed(2)}`}</td>
					<td className={deltaClass}>
						{result.dpsPercent === undefined ? '-' : `${result.dpsPercent >= 0 ? '+' : ''}${result.dpsPercent.toFixed(2)}%`}
					</td>
					<td>
						{result.status === 'simulated' ? (
							<span className={clsx('badge', result.isSignificant ? 'text-bg-success' : 'text-bg-warning')}>
								{result.isSignificant ? 'Significant' : 'Within sim noise'}
							</span>
						) : (
							<span className={clsx('badge', result.status === 'owned' ? 'text-bg-info' : 'text-bg-secondary')}>{result.message}</span>
						)}
					</td>
				</tr>
			);
		});

		this.resultsElem.replaceChildren(
			<div className="upgrade-planner-table-wrap">
				<table className="table table-striped table-hover align-middle upgrade-planner-table">
					<thead>
						<tr>
							<th>Preset</th>
							<th>Slot</th>
							<th>Item</th>
							<th>Current DPS</th>
							<th>Item DPS</th>
							<th>DPS gain</th>
							<th>Gain %</th>
							<th>Confidence</th>
						</tr>
					</thead>
					<tbody>{rows}</tbody>
				</table>
			</div>,
		);
	}

	private renderEmptyState() {
		this.resultsElem.replaceChildren(
			<div className="text-center text-body-secondary py-5">
				<h3>Rank your next upgrade</h3>
				<p>Import your current gear, choose the relevant phase presets, then run the planner.</p>
			</div>,
		);
	}

	private markStale() {
		this.staleElem.classList.remove('d-none');
	}

	private clearResults() {
		if (this.isRunning) return;
		this.results = [];
		this.staleElem.classList.add('d-none');
		this.renderEmptyState();
	}

	private async cancel() {
		if (!this.isRunning || this.isCancelling) return;
		this.isCancelling = true;
		this.abortController?.abort();
		await this.individualSimUI.sim.signalManager.abortType(RequestTypes.All);
	}

	private throwIfCancelled() {
		if (this.isCancelling || this.abortController?.signal.aborted) throw new Error('Upgrade simulation cancelled.');
	}
}
