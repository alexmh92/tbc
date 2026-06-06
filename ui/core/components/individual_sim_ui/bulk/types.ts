import { DistributionMetrics } from '../../../proto/api';
import { Gear } from '../../../proto_utils/gear';

export const WEB_DEFAULT_ITERATIONS = 5_000;
export const WEB_ITERATIONS_LIMIT = 100_000;
export const LOCAL_ITERATIONS_LIMIT = 5_000_000;

export const WEB_COMBINATIONS_LIMIT = 5_000;
export const LOCAL_COMBINATIONS_LIMIT = 50_000;

export interface TopGearResult {
	gear: Gear;
	dpsMetrics: DistributionMetrics;
}

export interface BulkSimRoundConfig {
	currentRound: number;
	totalRounds: number;
	title?: string;
	stageCurrentRound?: number;
	stageRounds?: number;
}

export interface BulkSimProgressConfig extends BulkSimRoundConfig {
	aggregateCompletedIterations?: number;
	aggregateTotalIterations?: number;
	aggregateStartedAt?: number;
	useSimCountProgress?: boolean;
}
