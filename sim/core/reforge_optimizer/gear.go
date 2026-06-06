package reforgeoptimizer

import (
	"github.com/wowsims/tbc/sim/core"
	"github.com/wowsims/tbc/sim/core/proto"
	googleProto "google.golang.org/protobuf/proto"
)

func cloneEquipmentSpec(equipment *proto.EquipmentSpec) *proto.EquipmentSpec {
	if equipment == nil {
		return &proto.EquipmentSpec{}
	}
	return googleProto.Clone(equipment).(*proto.EquipmentSpec)
}

type reforgeGearEditor struct {
	gear         *core.Equipment
	originalGear *core.Equipment
	player       *proto.Player
	settings     *proto.ReforgeSettings
	frozenSlots  map[proto.ItemSlot]bool
}

type reforgeSocketKey struct {
	slot      proto.ItemSlot
	socketIdx int
}

func newReforgeGearEditor(gear *proto.EquipmentSpec, originalGear *proto.EquipmentSpec, player *proto.Player, settings *proto.ReforgeSettings) *reforgeGearEditor {
	editor := &reforgeGearEditor{
		gear:         equipmentFromProto(gear),
		originalGear: optionalEquipmentFromProto(originalGear),
		player:       player,
		settings:     settings,
		frozenSlots:  frozenItemSlots(settings),
	}
	return editor
}

func (editor *reforgeGearEditor) equipment() *proto.EquipmentSpec {
	if editor == nil || editor.gear == nil {
		return &proto.EquipmentSpec{}
	}
	return editor.gear.ToEquipmentSpecProto()
}

func (editor *reforgeGearEditor) applyChoice(choice reforgeChoice) {
	if editor == nil || editor.gear == nil || int(choice.slot) < 0 || int(choice.slot) >= int(core.NumItemSlots) {
		return
	}
	item := editor.gear.GetItemBySlot(choice.slot)
	if item.ID == 0 {
		return
	}

	for _, gemChoice := range choice.gems {
		for len(item.Gems) <= gemChoice.socketIdx {
			item.Gems = append(item.Gems, core.Gem{})
		}
		item.Gems[gemChoice.socketIdx] = gemFromID(gemChoice.gemID)
	}
}

func (editor *reforgeGearEditor) applyChoices(choices []reforgeChoice) {
	for _, choice := range choices {
		editor.applyChoice(choice)
	}
}

func (editor *reforgeGearEditor) minimizeRegems() {
	if editor == nil || editor.gear == nil || editor.originalGear == nil || editor.player == nil {
		return
	}
	protectSocketMatchSwaps := hasSpellHitStatCap(editor.settings)
	for slotIdx := range editor.gear {
		newItem := &editor.gear[slotIdx]
		originalItem := &editor.originalGear[slotIdx]
		if newItem.ID == 0 || originalItem.ID == 0 {
			continue
		}
		socketColors := currentSocketColors(*newItem)
		for socketIdx, socketColor := range socketColors {
			if socketColor == proto.GemColor_GemColorMeta {
				restoreMetaSocketGem(newItem, originalItem, socketIdx)
			}
		}
	}

	for slotIdx := range editor.gear {
		slot := proto.ItemSlot(slotIdx)
		if editor.frozenSlots[slot] {
			continue
		}
		newItem := &editor.gear[slotIdx]
		originalItem := &editor.originalGear[slotIdx]
		if newItem.ID == 0 || originalItem.ID == 0 {
			continue
		}
		socketColors := currentSocketColors(*newItem)
		for socketIdx, socketColor := range socketColors {
			if socketColor == proto.GemColor_GemColorMeta {
				continue
			}
			desiredGemID := gemIDAt(originalItem, socketIdx)
			currentGemID := gemIDAt(newItem, socketIdx)
			if currentGemID == desiredGemID {
				continue
			}
			if protectSocketMatchSwaps {
				currentGem, currentGemOk := core.GemsByID[currentGemID]
				desiredGem, desiredGemOk := core.GemsByID[desiredGemID]
				if currentGemOk && desiredGemOk && gemMatchesSocket(currentGem.Color, socketColor) && !gemMatchesSocket(desiredGem.Color, socketColor) {
					continue
				}
			}
			matchedSlot, matchedSocketIdx, ok := editor.findGemSocketWithCurrentGem(desiredGemID, slot, socketIdx)
			if !ok {
				continue
			}
			if protectSocketMatchSwaps {
				matchedItem := editor.gear.GetItemBySlot(matchedSlot)
				matchedSocketColor := proto.GemColor_GemColorUnknown
				matchedSocketColors := currentSocketColors(*matchedItem)
				if matchedSocketIdx < len(matchedSocketColors) {
					matchedSocketColor = matchedSocketColors[matchedSocketIdx]
				}
				currentGem, currentGemOk := core.GemsByID[currentGemID]
				desiredGem, desiredGemOk := core.GemsByID[desiredGemID]
				if currentGemOk && desiredGemOk && gemMatchesSocket(desiredGem.Color, matchedSocketColor) && !gemMatchesSocket(currentGem.Color, matchedSocketColor) {
					continue
				}
			}
			otherItem := editor.gear.GetItemBySlot(matchedSlot)
			otherGemID := gemIDAt(otherItem, matchedSocketIdx)
			setGemIDAt(newItem, socketIdx, otherGemID)
			setGemIDAt(otherItem, matchedSocketIdx, currentGemID)
		}
	}
}

func hasSpellHitStatCap(settings *proto.ReforgeSettings) bool {
	if settings == nil || settings.StatCaps == nil {
		return false
	}
	pseudoStats := settings.StatCaps.GetPseudoStats()
	spellHitIdx := int(proto.PseudoStat_PseudoStatSpellHitPercent)
	return spellHitIdx < len(pseudoStats) && pseudoStats[spellHitIdx] > 0
}

func restoreMetaSocketGem(newItem *core.Item, originalItem *core.Item, socketIdx int) {
	originalGemID := gemIDAt(originalItem, socketIdx)
	if originalGemID != 0 || socketIdx < len(newItem.Gems) {
		setGemIDAt(newItem, socketIdx, originalGemID)
	}
}

func (editor *reforgeGearEditor) findGemSocketWithCurrentGem(gemID int32, skipSlot proto.ItemSlot, skipSocketIdx int) (proto.ItemSlot, int, bool) {
	for slotIdx, item := range editor.gear {
		slot := proto.ItemSlot(slotIdx)
		if item.ID == 0 || editor.frozenSlots[slot] {
			continue
		}
		socketColors := currentSocketColors(item)
		for socketIdx := range socketColors {
			if slot == skipSlot && socketIdx == skipSocketIdx {
				continue
			}
			if gemIDAt(&item, socketIdx) == gemID {
				return slot, socketIdx, true
			}
		}
	}
	return proto.ItemSlot_ItemSlotHead, 0, false
}

func gemIDAt(item *core.Item, socketIdx int) int32 {
	if item == nil || socketIdx >= len(item.Gems) {
		return 0
	}
	return item.Gems[socketIdx].ID
}

func setGemIDAt(item *core.Item, socketIdx int, gemID int32) {
	if item == nil {
		return
	}
	for len(item.Gems) <= socketIdx {
		item.Gems = append(item.Gems, core.Gem{})
	}
	item.Gems[socketIdx] = gemFromID(gemID)
}

func equipmentFromProto(equipment *proto.EquipmentSpec) *core.Equipment {
	if equipment == nil {
		return &core.Equipment{}
	}
	coreEquipment := core.ProtoToEquipment(equipment)
	return &coreEquipment
}

func optionalEquipmentFromProto(equipment *proto.EquipmentSpec) *core.Equipment {
	if equipment == nil {
		return nil
	}
	return equipmentFromProto(equipment)
}

func gemFromID(gemID int32) core.Gem {
	if gemID == 0 {
		return core.Gem{}
	}
	if gem, ok := core.GemsByID[gemID]; ok {
		return gem
	}
	return core.Gem{ID: gemID}
}

func frozenItemSlots(settings *proto.ReforgeSettings) map[proto.ItemSlot]bool {
	frozen := map[proto.ItemSlot]bool{}
	if settings == nil || !settings.GetFreezeItemSlots() {
		return frozen
	}
	for _, item := range settings.GetFrozenItemSlots() {
		frozen[item] = true
	}
	return frozen
}
