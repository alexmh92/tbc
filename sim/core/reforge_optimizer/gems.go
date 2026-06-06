package reforgeoptimizer

import (
	"cmp"
	"fmt"
	"log"
	"math"
	"slices"

	"github.com/wowsims/tbc/sim/core"
	"github.com/wowsims/tbc/sim/core/proto"
	"github.com/wowsims/tbc/sim/core/stats"
)

func buildReforgeGemOptions(request *proto.ReforgeOptimizeRequest, player *proto.Player, weights core.UnitStats, hardCaps []reforgeHardCap, softCaps []reforgeSoftCap) map[proto.GemColor][]reforgeGemOption {
	options := make(map[proto.GemColor][]reforgeGemOption)
	settings := request.GetSettings()
	if settings == nil {
		return options
	}
	gemWeights := gemObjectiveWeights(weights, hardCaps, softCaps)
	isTank := playerIsTankSpec(player)
	allowedStats := allowedGemStats(gemWeights)
	if request.GetDebug() {
		log.Printf("[reforgeOptimize] gem sort weights=%s", formatGemChoiceEPWeights(gemWeights))
	}

	for _, socketColor := range []proto.GemColor{
		proto.GemColor_GemColorPrismatic,
		proto.GemColor_GemColorRed,
		proto.GemColor_GemColorBlue,
		proto.GemColor_GemColorYellow,
	} {
		candidates := filteredGemCandidatesForSocket(request.GetGemOptions(), player, socketColor, gemWeights, hardCaps, softCaps, settings, allowedStats, isTank)
		options[socketColor] = selectGemCandidates(candidates)
		if request.GetDebug() {
			logTopGemOptions(socketColor, options[socketColor], gemWeights)
		}
	}
	return options
}

func gemObjectiveWeights(weights core.UnitStats, hardCaps []reforgeHardCap, softCaps []reforgeSoftCap) core.UnitStats {
	gemWeights := weights
	if shouldIgnoreSpiritTieBreakForGems(hardCaps, softCaps) && math.Abs(gemWeights.Stats[stats.Spirit]) <= 0.01+1e-9 {
		gemWeights.Stats[stats.Spirit] = 0
	}
	if hasSpellHitHardCap(hardCaps) && math.Abs(gemWeights.Stats[stats.MP5]) <= 0.29+1e-9 {
		gemWeights.Stats[stats.MP5] = 0
	}
	return gemWeights
}

func shouldIgnoreSpiritTieBreakForGems(hardCaps []reforgeHardCap, softCaps []reforgeSoftCap) bool {
	for _, hardCap := range hardCaps {
		if isNatureSpellHitUnitStat(hardCap.unitStat) {
			return true
		}
	}
	for _, softCap := range softCaps {
		if isNatureSpellHitUnitStat(softCap.unitStat) {
			return true
		}
	}
	return false
}

func isNatureSpellHitUnitStat(unitStat stats.UnitStat) bool {
	if !unitStat.IsPseudoStat() {
		return false
	}
	switch unitStat.PseudoStatIdx() {
	case int(proto.PseudoStat_PseudoStatSchoolHitPercentNature):
		return true
	default:
		return false
	}
}

func hasSpellHitHardCap(hardCaps []reforgeHardCap) bool {
	spellHitUnitStat := stats.UnitStatFromPseudoStat(proto.PseudoStat_PseudoStatSpellHitPercent)
	for _, hardCap := range hardCaps {
		if hardCap.unitStat == spellHitUnitStat && hardCap.cap > 0 {
			return true
		}
	}
	return false
}

func logTopGemOptions(socketColor proto.GemColor, options []reforgeGemOption, weights core.UnitStats) {
	if len(options) == 0 {
		log.Printf("[reforgeOptimize] gem options color=%s none", socketColor.String())
		return
	}
	limit := min(8, len(options))
	for idx := 0; idx < limit; idx++ {
		option := options[idx]
		name := "unknown"
		statsSummary := "none"
		epSummary := "none"
		cappedSummary := formatCappedStatSummary(option.cappedStats)
		if gem, ok := core.GemsByID[option.id]; ok {
			name = gem.Name
			statsSummary = formatStatsArray(stats.Stats(gem.Stats))
		}
		epSummary = formatGemOptionEPBreakdown(option.objectiveDelta, weights)
		log.Printf("[reforgeOptimize] gem options color=%s rank=%d id=%d name=%q score=%.3f jc=%t unique=%t stats=%s ep=%s capped=%s", socketColor.String(), idx+1, option.id, name, option.score, option.isJewelcrafting, option.unique, statsSummary, epSummary, cappedSummary)
	}
}

func forEachGemOptionForSocket(gemOptions map[proto.GemColor][]reforgeGemOption, socketColor proto.GemColor, forceSocketBonus bool, visit func(reforgeGemOption)) {
	var gemColorKeys [2]proto.GemColor
	gemColorKeyCount := 0
	switch socketColor {
	case proto.GemColor_GemColorPrismatic:
		gemColorKeys[gemColorKeyCount] = socketColor
		gemColorKeyCount++
	case proto.GemColor_GemColorRed, proto.GemColor_GemColorBlue, proto.GemColor_GemColorYellow:
		gemColorKeys[gemColorKeyCount] = socketColor
		gemColorKeyCount++
		if forceSocketBonus {
			break
		}
		gemColorKeys[gemColorKeyCount] = proto.GemColor_GemColorPrismatic
		gemColorKeyCount++
	default:
		return
	}

	var seenGemIDs [16]int32
	seenGemIDCount := 0
	var overflowSeenGemIDs map[int32]bool
	for _, gemColorKey := range gemColorKeys[:gemColorKeyCount] {
		for _, option := range gemOptions[gemColorKey] {
			if gemOptionSeen(option.id, seenGemIDs[:seenGemIDCount], overflowSeenGemIDs) {
				continue
			}
			if seenGemIDCount < len(seenGemIDs) {
				seenGemIDs[seenGemIDCount] = option.id
				seenGemIDCount++
			} else {
				if overflowSeenGemIDs == nil {
					overflowSeenGemIDs = make(map[int32]bool, len(seenGemIDs)+1)
					for _, seenGemID := range seenGemIDs {
						overflowSeenGemIDs[seenGemID] = true
					}
				}
				overflowSeenGemIDs[option.id] = true
			}
			visit(option)
		}
	}
}

func gemOptionSeen(gemID int32, seenGemIDs []int32, overflowSeenGemIDs map[int32]bool) bool {
	if overflowSeenGemIDs != nil {
		return overflowSeenGemIDs[gemID]
	}
	return slices.Contains(seenGemIDs, gemID)
}

func filteredGemCandidatesForSocket(gems []*proto.ReforgeGemOption, player *proto.Player, socketColor proto.GemColor, weights core.UnitStats, hardCaps []reforgeHardCap, softCaps []reforgeSoftCap, settings *proto.ReforgeSettings, allowedStats map[stats.Stat]bool, isTank bool) []reforgeGemOption {
	candidates := make([]reforgeGemOption, 0)
	hasJewelcrafting := playerHasProfession(player, proto.Profession_Jewelcrafting)
	for _, gem := range gems {
		if gem.GetId() == 0 || !gemMatchesSocket(gem.GetColor(), socketColor) {
			continue
		}
		isJewelcrafting := gem.GetRequiredProfession() == proto.Profession_Jewelcrafting
		if isJewelcrafting && !hasJewelcrafting {
			continue
		}
		if settings.GetDisableUniqueGems() && gem.GetUnique() && !isJewelcrafting {
			continue
		}
		if gem.GetPhase() > settings.GetMaxGemPhase() {
			continue
		}
		if gem.GetQuality() > settings.GetMaxGemQuality() {
			continue
		}

		gemStats := adjustedGemStatsForRace(stats.FromProtoArray(gem.GetStats()), player.GetRace())
		if !gemStatsAllowed(gemStats, allowedStats, isTank) {
			continue
		}
		delta := unitStatsFromStats(gemStats, weights)
		candidates = append(candidates, reforgeGemOption{
			id:              gem.GetId(),
			color:           gem.GetColor(),
			isJewelcrafting: isJewelcrafting,
			unique:          gem.GetUnique(),
			objectiveDelta:  delta,
			score:           dotUnitStats(delta, weights),
			cappedStats:     cappedGemStats(delta, hardCaps, softCaps),
		})
	}
	slices.SortStableFunc(candidates, func(a, b reforgeGemOption) int {
		return cmp.Compare(b.score, a.score)
	})
	return candidates
}

func adjustedGemStatsForRace(gemStats stats.Stats, race proto.Race) stats.Stats {
	adjusted := gemStats
	if race == proto.Race_RaceHuman && adjusted[stats.Spirit] != 0 {
		adjusted[stats.Spirit] *= 1.1
	}
	if race == proto.Race_RaceGnome && adjusted[stats.Intellect] != 0 {
		adjusted[stats.Intellect] *= 1.05
	}
	return adjusted
}

func selectGemCandidates(candidates []reforgeGemOption) []reforgeGemOption {
	included := make([]reforgeGemOption, 0, len(candidates))
	foundUncappedJCGem := false
	foundUncappedNormalGem := false
	for _, gem := range candidates {
		if (!gem.isJewelcrafting || !foundUncappedJCGem) && (len(gem.cappedStats) == 0 || !foundUncappedNormalGem) {
			included = append(included, gem)
		}

		if len(gem.cappedStats) == 0 {
			if gem.isJewelcrafting {
				foundUncappedJCGem = true
			} else {
				foundUncappedNormalGem = true
			}
		}
	}
	return included
}

func formatGemChoiceEPWeights(weights core.UnitStats) string {
	parts := make([]string, 0)
	for statIdx, value := range weights.Stats {
		if value == 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%.3f", stats.Stat(statIdx).StatName(), value))
	}
	for pseudoIdx, value := range weights.PseudoStats {
		if value == 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%.3f", proto.PseudoStat(pseudoIdx).String(), value))
	}
	return formatLimitedStringList(parts, 24)
}

func formatGemOptionEPBreakdown(delta core.UnitStats, weights core.UnitStats) string {
	parts := make([]string, 0)
	for statIdx, value := range delta.Stats {
		if value == 0 || weights.Stats[statIdx] == 0 {
			continue
		}
		contribution := value * weights.Stats[statIdx]
		parts = append(parts, fmt.Sprintf("%s=%.3fx%.3f=>%.3f", stats.Stat(statIdx).StatName(), value, weights.Stats[statIdx], contribution))
	}
	for pseudoIdx, value := range delta.PseudoStats {
		if value == 0 || weights.PseudoStats[pseudoIdx] == 0 {
			continue
		}
		contribution := value * weights.PseudoStats[pseudoIdx]
		parts = append(parts, fmt.Sprintf("%s=%.3fx%.3f=>%.3f", proto.PseudoStat(pseudoIdx).String(), value, weights.PseudoStats[pseudoIdx], contribution))
	}
	return formatLimitedStringList(parts, 12)
}

func formatStatsArray(values stats.Stats) string {
	parts := make([]string, 0)
	for statIdx, value := range values {
		if value == 0 {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%.3f", stats.Stat(statIdx).StatName(), value))
	}
	return formatLimitedStringList(parts, 8)
}

func formatCappedStatSummary(cappedStats []stats.UnitStat) string {
	parts := make([]string, 0, len(cappedStats))
	for _, unitStat := range cappedStats {
		parts = append(parts, unitStatName(unitStat))
	}
	return formatLimitedStringList(parts, 8)
}

func allowedGemStats(weights core.UnitStats) map[stats.Stat]bool {
	allowed := make(map[stats.Stat]bool)
	for statIdx, weight := range weights.Stats {
		if weight != 0 {
			allowed[stats.Stat(statIdx)] = true
		}
	}
	// Keep parent rating stats gem-eligible when weight normalization moves EP
	// onto pseudo child stats (frontend parity for hit/crit/haste style caps).
	for _, parent := range []stats.Stat{
		stats.MeleeHitRating,
		stats.SpellHitRating,
		stats.MeleeCritRating,
		stats.SpellCritRating,
		stats.MeleeHasteRating,
		stats.SpellHasteRating,
		stats.DefenseRating,
		stats.ResilienceRating,
	} {
		if allowed[parent] {
			continue
		}
		for _, child := range childPseudoStats(parent) {
			if getUnitStat(weights, stats.UnitStatFromPseudoStat(child)) != 0 {
				allowed[parent] = true
				break
			}
		}
	}
	if allowed[stats.AttackPower] {
		allowed[stats.RangedAttackPower] = true
	}
	if allowed[stats.RangedAttackPower] {
		allowed[stats.AttackPower] = true
	}
	return allowed
}

func gemStatsAllowed(gemStats stats.Stats, allowedStats map[stats.Stat]bool, isTank bool) bool {
	statCount := 0
	for statIdx := 0; statIdx < int(stats.ProtoStatsLen); statIdx++ {
		if gemStats[statIdx] > 0 {
			statCount++
		}
	}
	if statCount == 0 {
		return false
	}

	for statIdx := 0; statIdx < int(stats.ProtoStatsLen); statIdx++ {
		if gemStats[statIdx] == 0 {
			continue
		}

		stat := stats.Stat(statIdx)
		if !allowedStats[stat] {
			if !(stat == stats.Stamina && (isTank || statCount > 1)) && !(stat == stats.HealingPower && allowedStats[stats.SpellDamage]) {
				return false
			}
		}
	}
	return true
}

func cappedGemStats(delta core.UnitStats, hardCaps []reforgeHardCap, softCaps []reforgeSoftCap) []stats.UnitStat {
	cappedStats := make([]stats.UnitStat, 0)
	seen := make(map[stats.UnitStat]bool)
	addIfPresent := func(unitStat stats.UnitStat) {
		if !seen[unitStat] && getUnitStat(delta, unitStat) != 0 {
			seen[unitStat] = true
			cappedStats = append(cappedStats, unitStat)
		}
	}
	for _, hardCap := range hardCaps {
		addIfPresent(hardCap.unitStat)
	}
	for _, softCap := range softCaps {
		addIfPresent(softCap.unitStat)
	}
	return cappedStats
}

func currentSocketColors(item core.Item) []proto.GemColor {
	return slices.Clone(item.GemSockets)
}

func gemEligibleForSocket(gemColor proto.GemColor, socketColor proto.GemColor) bool {
	switch socketColor {
	case proto.GemColor_GemColorMeta:
		return gemColor == proto.GemColor_GemColorMeta
	default:
		return gemColor != proto.GemColor_GemColorMeta
	}
}

func clearGems(equipment *proto.EquipmentSpec, settings *proto.ReforgeSettings) {
	frozenSlots := frozenItemSlots(settings)
	for slotIdx, item := range equipment.Items {
		slot := proto.ItemSlot(slotIdx)
		if item == nil || frozenSlots[slot] {
			continue
		}

		for gemIdx, gemID := range item.Gems {
			if gemID == 0 {
				continue
			}
			if gem, ok := core.GemsByID[gemID]; ok && gem.Color == proto.GemColor_GemColorMeta {
				continue
			}
			if isHeadMetaSocket(item, slot, gemIdx) {
				continue
			}
			if gem, ok := core.GemsByID[gemID]; !ok || gem.Color != proto.GemColor_GemColorMeta {
				item.Gems[gemIdx] = 0
			}
		}
	}
}

func isHeadMetaSocket(item *proto.ItemSpec, slot proto.ItemSlot, gemIdx int) bool {
	if slot != proto.ItemSlot_ItemSlotHead {
		return false
	}
	if dbItem, ok := core.ItemsByID[item.GetId()]; ok && gemIdx < len(dbItem.GemSockets) {
		return dbItem.GemSockets[gemIdx] == proto.GemColor_GemColorMeta
	}
	return gemIdx == 0
}
