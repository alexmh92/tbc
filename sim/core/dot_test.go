package core

import (
	"testing"
	"time"

	"github.com/wowsims/tbc/sim/core/proto"
	"github.com/wowsims/tbc/sim/core/simsignals"
	"github.com/wowsims/tbc/sim/core/stats"
)

func init() {
	RegisterAgentFactory(
		proto.Player_ElementalShaman{},
		proto.Spec_SpecElementalShaman,
		NewFakeElementalShaman,
		func(player *proto.Player, spec interface{}) {
			playerSpec, ok := spec.(*proto.Player_ElementalShaman)
			if !ok {
				panic("Invalid spec value for Elemental Shaman!")
			}
			player.Spec = playerSpec
		},
	)
}

type FakeAgent struct {
	Spell *Spell
	Dot   *Dot
	Character
	Init func()
}

func (fa *FakeAgent) GetCharacter() *Character {
	return &fa.Character
}

func (fa *FakeAgent) Initialize() {
	if fa.Init != nil {
		fa.Init()
	}
}

func (fa *FakeAgent) ApplyTalents()                  {}
func (fa *FakeAgent) Reset(_ *Simulation)            {}
func (fa *FakeAgent) OnGCDReady(_ *Simulation)       {}
func (fa *FakeAgent) OnEncounterStart(_ *Simulation) {}

func NewFakeElementalShaman(char *Character, _ *proto.Player, _ *proto.Raid) Agent {
	fa := &FakeAgent{
		Character: *char,
	}

	fa.Init = func() {
		fa.Spell = fa.RegisterSpell(SpellConfig{
			ActionID:    ActionID{SpellID: 42},
			SpellSchool: SpellSchoolShadow,
			ProcMask:    ProcMaskSpellDamage,
			Flags:       SpellFlagIgnoreResists,
			Cast:        CastConfig{},

			BonusCritPercent: 3,
			DamageMultiplier: 1.5,
			ThreatMultiplier: 1,

			Dot: DotConfig{
				Aura: Aura{
					Label: "fakedot",
				},
				NumberOfTicks:       6,
				TickLength:          time.Second * 3,
				AffectedByCastSpeed: false,
				BonusCoefficient:    1,

				OnSnapshot: func(sim *Simulation, target *Unit, dot *Dot) {
					dot.Snapshot(target, 100)
				},
				OnTick: func(sim *Simulation, target *Unit, dot *Dot) {
					dot.CalcAndDealPeriodicSnapshotDamage(sim, target, dot.OutcomeTick)
				},
			},

			ApplyEffects: func(sim *Simulation, target *Unit, spell *Spell) {
				result := spell.CalcOutcome(sim, target, spell.OutcomeMagicHit)
				if result.Landed() {
					spell.Dot(target).Apply(sim)
				}
				spell.DealOutcome(sim, result)
			},
		})
		fa.Dot = fa.Spell.CurDot()
	}

	return fa
}

func SetupFakeSim() *Simulation {
	sim := NewSim(&proto.RaidSimRequest{
		SimOptions: &proto.SimOptions{
			RandomSeed: 100,
		},
		Raid: &proto.Raid{
			Parties: []*proto.Party{
				{
					Players: []*proto.Player{
						{
							Name:      "Caster",
							Class:     proto.Class_ClassShaman,
							Buffs:     &proto.IndividualBuffs{},
							Spec:      &proto.Player_ElementalShaman{},
							Equipment: &proto.EquipmentSpec{},
						},
					},
					Buffs: &proto.PartyBuffs{},
				},
			},
		},
		Encounter: &proto.Encounter{
			Targets: []*proto.Target{
				{Name: "target", Level: 70, MobType: proto.MobType_MobTypeDemon},
			},
			Duration: 180,
		},
	}, simsignals.CreateSignals())
	sim.Reset()

	return sim
}

func expectDotTickDamage(t *testing.T, sim *Simulation, dot *Dot, expectedDamage float64) {
	damageBefore := dot.Spell.SpellMetrics[0].TotalDamage
	dot.TickOnce(sim)
	damageAfter := dot.Spell.SpellMetrics[0].TotalDamage
	delta := damageAfter - damageBefore

	if !WithinToleranceFloat64(expectedDamage, delta, 0.01) {
		t.Fatalf("Incorrect tick damage applied: Expected: %0.3f, Actual: %0.3f", expectedDamage, delta)
	}
}

func TestDotSnapshot(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)

	fa.Dot.Apply(sim)
	expectDotTickDamage(t, sim, fa.Dot, 150) // (100) * 1.5
}

func TestDotSnapshotSpellDamage(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)

	fa.Dot.Apply(sim)
	expectDotTickDamage(t, sim, fa.Dot, 150) // (100) * 1.5

	// Spell power shouldn't get applied because dot was already snapshot.
	fa.GetCharacter().AddStatDynamic(sim, stats.SpellDamage, 100)
	expectDotTickDamage(t, sim, fa.Dot, 150) // (100) * 1.5

	fa.Dot.Deactivate(sim)
	fa.Dot.Apply(sim)
	expectDotTickDamage(t, sim, fa.Dot, 300) // (100 + 100) * 1.5
}

func TestDotSnapshotSpellMultiplier(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	spell.DamageMultiplier *= 2

	fa.Dot.Apply(sim)
	expectDotTickDamage(t, sim, fa.Dot, 300) // (100) * 1.5 * 2
}

func TestTargetSchoolBonusAddedAfterAttackerMults(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	target := sim.Encounter.AllTargetUnits[0]

	// Spell config (set in NewFakeElementalShaman): Shadow school,
	// BonusCoefficient (on the dot) = 1, DamageMultiplier = 1.5.
	// We test the cast path here, not the dot path, so we must set
	// BonusCoefficient on the spell itself for the post-attacker bonus to
	// scale correctly (the cast path uses spell.BonusCoefficient, not
	// dot.BonusCoefficient).
	spell.BonusCoefficient = 1

	// Add a 100-point Shadow school bonus on the target. With a coefficient
	// of 1 and a 1.5x DamageMultiplier on the caster, the expected damage is:
	//   baseDamage (200) * 1.5 (attackerMult)  = 300   <- caster-side
	//   + 1.0 * 100                            = 100   <- target-side, no caster mult
	//   = 400
	target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 100
	t.Cleanup(func() {
		target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 0
	})

	result := spell.CalcDamage(sim, target, 200, spell.OutcomeAlwaysHit)
	if !WithinToleranceFloat64(400, result.Damage, 0.01) {
		t.Fatalf("Expected 400, got %0.3f", result.Damage)
	}
}

func TestTargetSchoolBonusIgnoreAttackerModifiersStillApplies(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	target := sim.Encounter.AllTargetUnits[0]

	spell.BonusCoefficient = 1
	spell.Flags |= SpellFlagIgnoreAttackerModifiers
	t.Cleanup(func() { spell.Flags &^= SpellFlagIgnoreAttackerModifiers })

	target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 100
	t.Cleanup(func() {
		target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 0
	})

	// IgnoreAttackerModifiers makes attackerMultiplier=1, so baseDamage 200
	// stays at 200. The post-attacker bonus is still added: 200 + 1.0*100 = 300.
	result := spell.CalcDamage(sim, target, 200, spell.OutcomeAlwaysHit)
	if !WithinToleranceFloat64(300, result.Damage, 0.01) {
		t.Fatalf("Expected 300, got %0.3f", result.Damage)
	}
}

func TestTargetSchoolBonusPhysicalSchoolSkipped(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	target := sim.Encounter.AllTargetUnits[0]

	originalSchool := spell.SpellSchool
	originalIndex := spell.SchoolIndex
	spell.SpellSchool = SpellSchoolPhysical
	spell.SchoolIndex = stats.SchoolIndexPhysical
	spell.BonusCoefficient = 1
	t.Cleanup(func() {
		spell.SpellSchool = originalSchool
		spell.SchoolIndex = originalIndex
	})

	// Set a non-zero school bonus for every magic school; physical should
	// not pick up any of them.
	for i := range target.PseudoStats.SchoolBonusSpellDamage {
		target.PseudoStats.SchoolBonusSpellDamage[i] = 100
	}
	t.Cleanup(func() {
		for i := range target.PseudoStats.SchoolBonusSpellDamage {
			target.PseudoStats.SchoolBonusSpellDamage[i] = 0
		}
	})

	// baseDamage 200 * 1.5 = 300, no post-attacker bonus for physical.
	result := spell.CalcDamage(sim, target, 200, spell.OutcomeAlwaysHit)
	if !WithinToleranceFloat64(300, result.Damage, 0.01) {
		t.Fatalf("Expected 300, got %0.3f", result.Damage)
	}
}

func TestTargetSchoolBonusFallsBackToBonusCoefficient(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	target := sim.Encounter.AllTargetUnits[0]

	spell.BonusCoefficient = 0.5
	spell.TargetBonusCoefficient = 0 // explicit; should fall back to 0.5
	target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 100
	t.Cleanup(func() {
		target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 0
	})

	// baseDamage 200 * 1.5 = 300; post-attacker bonus 0.5 * 100 = 50. Total 350.
	result := spell.CalcDamage(sim, target, 200, spell.OutcomeAlwaysHit)
	if !WithinToleranceFloat64(350, result.Damage, 0.01) {
		t.Fatalf("Expected 350, got %0.3f", result.Damage)
	}
}

func TestTargetSchoolBonusUsesTargetCoefficientWhenSet(t *testing.T) {
	sim := SetupFakeSim()
	fa := sim.Raid.Parties[0].Players[0].(*FakeAgent)
	spell := fa.GetCharacter().Spellbook[0]
	target := sim.Encounter.AllTargetUnits[0]

	spell.BonusCoefficient = 1
	spell.TargetBonusCoefficient = 0.2
	t.Cleanup(func() { spell.TargetBonusCoefficient = 0 })

	target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 100
	t.Cleanup(func() {
		target.PseudoStats.SchoolBonusSpellDamage[stats.SchoolIndexShadow] = 0
	})

	// baseDamage 200 * 1.5 = 300; post-attacker bonus uses 0.2 (not 1.0): 0.2 * 100 = 20. Total 320.
	result := spell.CalcDamage(sim, target, 200, spell.OutcomeAlwaysHit)
	if !WithinToleranceFloat64(320, result.Damage, 0.01) {
		t.Fatalf("Expected 320, got %0.3f", result.Damage)
	}
}
