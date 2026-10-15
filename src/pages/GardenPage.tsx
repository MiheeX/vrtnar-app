import React, { useEffect, useMemo, useRef, useState } from "react";
import GardenCanvas, {
  COLS,
  ROWS,
  type GardenCanvasHandle,
  type PlacingPlant,
} from "../components/garden/GardenCanvas";
import { useGardenStore, BED_COLORS } from "../store/useGardenStore";
import type { GardenBed } from "../types/garden";
import type { Plant, PlantNeighbor } from "../types";
import { Toolbar } from "../components/Toolbar";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserInventory } from "../hooks/useUserInventory";
import { useGardens } from "../hooks/useGardens";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { usePlan } from "../hooks/usePlan";
import { useBedPlants, type BedPlant } from "../hooks/useBedPlants";
import { useUserSettings } from "../hooks/useUserSettings";
import { startProCheckout, openBillingPortal } from "../lib/billing";
import { PLAN_LABEL, limitErrorOf } from "../lib/plans";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { UpgradeModal } from "../components/UpgradeModal";
import { promptUpgrade } from "../store/useUpgradePrompt";
import { SideMenu } from "../components/SideMenu";
import { InventoryModal } from "../components/InventoryModal";
import { PlantSelectorModal } from "../components/PlantSelectorModal";
import { PlantSheet, type SheetSnap } from "../components/PlantSheet";
import { StatusArea, type DragWarning } from "../components/StatusArea";
import { useUndo, notify, pushUndo } from "../store/useUndo";
import { GardenFab } from "../components/garden/GardenFab";
import { NewBedSheet } from "../components/garden/NewBedSheet";
import { BedActionBar } from "../components/garden/BedActionBar";
import { PlantPlaceSheet } from "../components/garden/PlantPlaceSheet";
import { PlacementBar } from "../components/garden/PlacementBar";
import {
  buildRelations,
  isPlaceable,
  remainingCapacity,
  type PlacementResult,
} from "../components/garden/placement";

// Prvo prosto mesto za gredico čim bližje sredini pogleda (null = mreža je polna)
function findFreeSpot(
  beds: GardenBed[],
  width: number,
  height: number,
  center: { col: number; row: number },
) {
  const cx = center.col - Math.floor(width / 2);
  const cy = center.row - Math.floor(height / 2);
  let best: { x: number; y: number; d: number } | null = null;
  for (let y = 0; y + height <= ROWS; y++) {
    for (let x = 0; x + width <= COLS; x++) {
      const free = !beds.some(
        (b) => x < b.x + b.width && x + width > b.x && y < b.y + b.height && y + height > b.y,
      );
      if (!free) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best;
}

const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // brez podpore
  }
};

const GardenPage: React.FC = () => {
  const { selectedBedId, beds, selectBed, addBed, removeBed, updateBed } = useGardenStore();
  const selectedBed = beds.find((b) => b.id === selectedBedId) ?? null;
  const canvasRef = useRef<GardenCanvasHandle>(null);
  const navigate = useNavigate();

  const { userId } = useCurrentUser();
  const { settings, updateSetting, refresh: refreshSettings } = useUserSettings(userId);
  const {
    inventory,
    addPlant,
    removePlant,
    decrementPlant,
    consumePlant,
    totalFor,
    refresh: refreshInventory,
  } = useUserInventory(userId ?? "");

  const planApi = usePlan(userId);
  const gardensApi = useGardens(userId, planApi.limits?.max_gardens ?? null);
  const gardenId = gardensApi.currentGardenId;
  const {
    bedPlants,
    refresh: refreshBedPlants,
    applyOptimisticUpdate,
    addLocal,
    removeLocal,
  } = useBedPlants(gardenId ?? "");

  const [menuOpen, setMenuOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [addPlantsOpen, setAddPlantsOpen] = useState(false);
  const [newBedOpen, setNewBedOpen] = useState(false);
  const [plantSheetOpen, setPlantSheetOpen] = useState(false);
  const [bedsLoaded, setBedsLoaded] = useState(false);

  // Sajenje: izbrana rastlina in ciljna gredica (za oceno prostora)
  const [placing, setPlacing] = useState<PlacingPlant | null>(null);
  const [placingBedId, setPlacingBedId] = useState<string | null>(null);
  const [placedCount, setPlacedCount] = useState(0);

  const [quickInfoTargetId, setQuickInfoTargetId] = useState<string | null>(null);
  const quickInfoTarget = bedPlants.find((b) => b.id === quickInfoTargetId) ?? null;
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [dragWarning, setDragWarning] = useState<DragWarning | null>(null);

  const [plantNeighbors, setPlantNeighbors] = useState<PlantNeighbor[]>([]);
  const relations = useMemo(() => buildRelations(plantNeighbors), [plantNeighbors]);

  const showSubGrid = settings.show_sub_grid;
  const allowBadNeighborDrop = settings.allow_bad_neighbor_drop;
  const plantFromInventory = settings.plant_from_inventory;
  // Pri "Sadi iz zaloge": koliko jih je bilo v zalogi ob začetku sajenja
  const [stockAtStart, setStockAtStart] = useState<number | null>(null);

  const undoHistory = useUndo((s) => s.history);
  const undoLast = useUndo((s) => s.undoLast);

  useEffect(() => {
    supabase
      .from("plant_neighbors")
      .select("*")
      .then(({ data, error }) => {
        if (error) console.error("plant_neighbors error:", error);
        if (data) setPlantNeighbors(data);
      });
  }, []);

  // Ob menjavi vrta počisti stanje prejšnjega in naloži njegove gredice
  useEffect(() => {
    if (!gardenId) return;
    let cancelled = false;
    canvasRef.current?.reset();
    selectBed(null);
    useUndo.getState().clear();
    useGardenStore.setState({ beds: [] });
    supabase
      .from("beds")
      .select("*")
      .eq("garden_id", gardenId)
      .then(({ data, error }) => {
        if (error) console.error("Napaka pri nalaganju gredic:", error);
        if (cancelled) return;
        if (data) useGardenStore.setState({ beds: data });
        setBedsLoaded(true);
      });
    return () => {
      cancelled = true;
      setBedsLoaded(false);
      setPlacing(null);
      setQuickInfoTargetId(null);
    };
  }, [gardenId, selectBed]);

  // Ponovno naloži gredice trenutnega vrta (brez čiščenja izbire)
  const gardenIdRef = useRef(gardenId);
  useEffect(() => {
    gardenIdRef.current = gardenId;
  }, [gardenId]);
  const bedsFetchSeq = useRef(0);
  const refetchBeds = async () => {
    const id = gardenId;
    if (!id) return;
    const seq = ++bedsFetchSeq.current;
    const versionAtStart = useGardenStore.getState().bedsVersion;
    const { data, error } = await supabase.from("beds").select("*").eq("garden_id", id);
    if (error) {
      console.error("Napaka pri nalaganju gredic:", error);
      return;
    }
    // Zavrzi zastarel odgovor (drug vrt, novejši refetch ali vmesna lokalna sprememba)
    if (
      !data ||
      gardenIdRef.current !== id ||
      seq !== bedsFetchSeq.current ||
      useGardenStore.getState().bedsVersion !== versionAtStart
    )
      return;
    useGardenStore.setState({ beds: data });
  };

  // Spremembe z drugih naprav/zavihkov se pokažejo brez osvežitve strani
  useRealtimeSync(userId, {
    gardens: () => gardensApi.refresh(),
    beds: () => {
      refetchBeds();
      gardensApi.refresh();
    },
    bed_plants: () => {
      refreshBedPlants();
      refreshInventory();
    },
    user_plants: () => refreshInventory(),
    user_settings: () => refreshSettings(),
    profiles: () => planApi.refresh(),
  });

  // Vrnitev iz Stripe Checkout (?checkout=success|cancel): osveži paket, počisti URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("checkout")) return;
    planApi.refresh();
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Gredice ─────────────────────────────────────────────────────────────

  const bedRow = (bed: GardenBed) => ({
    id: bed.id,
    user_id: bed.user_id,
    garden_id: bed.garden_id,
    name: bed.name,
    x: bed.x,
    y: bed.y,
    width: bed.width,
    height: bed.height,
    color: bed.color,
  });

  const bedPlantRow = (bp: BedPlant) => ({
    id: bp.id,
    user_id: userId,
    garden_id: gardenId,
    bed_id: bp.bed_id,
    plant_id: bp.plant_id,
    cell_x: bp.cell_x,
    cell_y: bp.cell_y,
    quantity: bp.quantity ?? 1,
    variety: bp.variety,
    planted_at: bp.planted_at,
    last_watered_at: bp.last_watered_at,
    notes: bp.notes,
  });

  const createBed = async (width: number, height: number) => {
    setNewBedOpen(false);
    if (!userId || !gardenId) return;
    const center = canvasRef.current?.viewportCenterCell() ?? { col: COLS / 2, row: ROWS / 2 };
    const spot = findFreeSpot(beds, width, height, center);
    if (!spot) {
      notify("Na mreži ni prostora za tako gredico");
      return;
    }
    const { data, error } = await supabase
      .from("beds")
      .insert({
        user_id: userId,
        garden_id: gardenId,
        name: `Gredica ${beds.length + 1}`,
        x: spot.x,
        y: spot.y,
        width,
        height,
        color: BED_COLORS[beds.length % BED_COLORS.length],
      })
      .select()
      .single();
    if (error || !data) {
      console.error("Napaka pri ustvarjanju gredice:", error);
      notify("Gredice ni bilo mogoče ustvariti");
      return;
    }
    const bed = data as GardenBed;
    addBed(bed);
    selectBed(bed.id);
    vibrate(10);
    pushUndo("Gredica dodana", async () => {
      removeBed(bed.id);
      if (useGardenStore.getState().selectedBedId === bed.id) selectBed(null);
      const { error: delError } = await supabase.from("beds").delete().eq("id", bed.id);
      if (delError) throw delError;
    });
  };

  // Brez potrditve: izbriše takoj, toast ponudi razveljavitev (gredica + njene rastline)
  const deleteBed = async (bed: GardenBed) => {
    const plants = bedPlants.filter((bp) => bp.bed_id === bed.id);
    removeBed(bed.id);
    selectBed(null);
    const { error } = await supabase.from("beds").delete().eq("id", bed.id);
    if (error) {
      console.error("Napaka pri brisanju gredice:", error);
      addBed(bed);
      notify("Gredice ni bilo mogoče izbrisati");
      return;
    }
    refreshBedPlants();
    pushUndo(`„${bed.name}“ izbrisana`, async () => {
      const { error: bedError } = await supabase.from("beds").insert(bedRow(bed));
      if (bedError) throw bedError;
      addBed(bed);
      if (plants.length) {
        const { error: plantsError } = await supabase
          .from("bed_plants")
          .insert(plants.map(bedPlantRow));
        if (plantsError) throw plantsError;
      }
      refreshBedPlants();
    });
  };

  const renameBed = async (bed: GardenBed, name: string) => {
    const before = bed.name;
    const save = async (value: string) => {
      updateBed(bed.id, { name: value });
      const { error } = await supabase.from("beds").update({ name: value }).eq("id", bed.id);
      if (error) console.error("Napaka pri preimenovanju gredice:", error);
    };
    await save(name);
    pushUndo("Gredica preimenovana", () => save(before));
  };

  // ── Sajenje: izberi rastlino, nato tapaj po gredicah ─────────────────────

  const openPlantPicker = (bedId: string | null) => {
    setPlacingBedId(bedId);
    setPlantSheetOpen(true);
  };

  const startPlacing = (plant: Plant) => {
    setPlantSheetOpen(false);
    setQuickInfoTargetId(null);
    selectBed(null);
    setPlacing({
      plantId: plant.id,
      spacing: plant.cells_spacing ?? 1,
      name: plant.name,
      img: plant.img ?? null,
      icon: plant.icon ?? null,
    });
    setPlacedCount(0);
    setStockAtStart(
      plantFromInventory
        ? (inventory.find((i) => i.plant_id === plant.id)?.quantity ?? 0)
        : null,
    );
  };

  const stopPlacing = () => {
    setPlacing(null);
    setPlacedCount(0);
  };

  const placeAt = async (bed: GardenBed, ax: number, ay: number, result: PlacementResult) => {
    const pl = placing;
    if (!pl || !userId || !gardenId) return;
    if (!isPlaceable(result.status, allowBadNeighborDrop)) {
      notify(
        result.status === "blocked"
          ? "Tu ni dovolj prostora"
          : `Slab sosed: ${result.badNames.join(", ")}`,
      );
      return;
    }
    // "Sadi iz zaloge": brez zaloge ni sajenja (lokalni števec — zaloga se osveži z zamikom)
    if (stockAtStart != null && stockAtStart - placedCount <= 0) {
      notify(`Zaloga porabljena: ${pl.name} — dodaj jih v zalogo`);
      return;
    }
    const maxPerPlant = planApi.limits?.max_per_plant ?? null;
    const inStock = inventory.find((i) => i.plant_id === pl.plantId)?.quantity ?? 0;
    if (maxPerPlant != null && inStock === 0 && totalFor(pl.plantId) >= maxPerPlant) {
      promptUpgrade("plants", pl.name);
      return;
    }

    // Takoj na zaslonu (tudi hitri zaporedni tapi ne pristanejo na istem mestu)
    const id = crypto.randomUUID();
    const local: BedPlant = {
      id,
      bed_id: bed.id,
      plant_id: pl.plantId,
      cell_x: ax,
      cell_y: ay,
      quantity: 1,
      variety: null,
      planted_at: new Date().toISOString().slice(0, 10),
      last_watered_at: null,
      notes: null,
      plant: {
        id: pl.plantId,
        name: pl.name,
        img: pl.img,
        icon: pl.icon,
        cells_spacing: pl.spacing,
        around_cells_spacing: 0,
      },
    };
    addLocal(local);
    setPlacingBedId(bed.id);
    vibrate(10);

    const { error } = await supabase.from("bed_plants").insert({
      id,
      user_id: userId,
      garden_id: gardenId,
      bed_id: bed.id,
      plant_id: pl.plantId,
      cell_x: ax,
      cell_y: ay,
      quantity: 1,
    });
    if (error) {
      removeLocal(id);
      if (limitErrorOf(error) === "plant_limit_reached") promptUpgrade("plants", pl.name);
      else {
        console.error("Napaka pri sajenju:", error);
        notify("Sajenje ni uspelo");
      }
      return;
    }
    // Rastlina iz zaloge se porabi; brez zaloge (samo, ko "Sadi iz zaloge" ni vklopljeno) se samo posadi
    const consumed = stockAtStart != null || inStock > 0;
    if (consumed) consumePlant(pl.plantId, 1);
    setPlacedCount((c) => c + 1);
    refreshBedPlants();
    pushUndo(`${pl.name} posajen`, async () => {
      removeLocal(id);
      setPlacedCount((c) => Math.max(0, c - 1));
      const { error: delError } = await supabase.from("bed_plants").delete().eq("id", id);
      if (delError) throw delError;
      if (consumed) await addPlant(pl.plantId, 1);
      refreshBedPlants();
    });
  };

  // Odstrani rastlino iz gredice → nazaj v zalogo; razveljavi jo vrne v gredico
  const removePlantFromBed = async (bedPlantId: string) => {
    const bp = bedPlants.find((p) => p.id === bedPlantId);
    if (!bp) return;
    removeLocal(bp.id);
    setQuickInfoTargetId(null);
    const { error } = await supabase.from("bed_plants").delete().eq("id", bp.id);
    if (error) {
      console.error("Napaka pri odstranjevanju rastline:", error);
      refreshBedPlants();
      notify("Rastline ni bilo mogoče odstraniti");
      return;
    }
    await addPlant(bp.plant_id, 1);
    refreshBedPlants();
    const name = bp.plant?.name ?? "Rastlina";
    pushUndo(`${name} odstranjen`, async () => {
      const { error: insError } = await supabase.from("bed_plants").insert(bedPlantRow(bp));
      if (insError) throw insError;
      await consumePlant(bp.plant_id, 1);
      refreshBedPlants();
    });
  };

  // Ocena prostora v ciljni gredici med sajenjem
  const placingBed = beds.find((b) => b.id === placingBedId) ?? null;
  const remaining =
    placing && placingBed
      ? remainingCapacity({
          bed: placingBed,
          plantId: placing.plantId,
          spacing: placing.spacing,
          bedPlants,
          relations,
          allowBad: allowBadNeighborDrop,
        })
      : null;

  const showEmptyState = bedsLoaded && beds.length === 0 && !placing;
  const bottomBar = placing ? "placing" : selectedBed ? "bed" : null;
  const lastUndo = undoHistory[undoHistory.length - 1];

  return (
    <div className="flex flex-col h-screen bg-stone-50 select-none">
      <Toolbar
        gardenName={gardensApi.currentGarden?.name ?? "Moj vrt"}
        onMenuOpen={() => {
          gardensApi.refresh();
          setMenuOpen(true);
        }}
        onInventoryOpen={() => setInventoryOpen(true)}
        canUndo={undoHistory.length > 0}
        undoLabel={lastUndo?.label}
        onUndo={undoLast}
      />

      <UpgradeModal limits={planApi.limits} onUpgrade={startProCheckout} />

      <SideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        gardens={gardensApi.gardens}
        currentGardenId={gardenId}
        plan={planApi.plan}
        onUpgrade={startProCheckout}
        onManageBilling={openBillingPortal}
        maxGardens={planApi.limits?.max_gardens ?? null}
        atLimit={gardensApi.atLimit}
        onSelectGarden={gardensApi.selectGarden}
        onCreateGarden={gardensApi.createGarden}
        onRenameGarden={gardensApi.renameGarden}
        onDeleteGarden={gardensApi.deleteGarden}
        onAddPlants={() => setAddPlantsOpen(true)}
        showSubGrid={showSubGrid}
        onToggleSubGrid={() => updateSetting("show_sub_grid", !showSubGrid)}
        allowBadNeighborDrop={allowBadNeighborDrop}
        onToggleAllowBadNeighborDrop={() =>
          updateSetting("allow_bad_neighbor_drop", !allowBadNeighborDrop)
        }
        plantFromInventory={plantFromInventory}
        onTogglePlantFromInventory={() =>
          updateSetting("plant_from_inventory", !plantFromInventory)
        }
        onSignOut={async () => {
          const { error } = await supabase.auth.signOut();
          if (error) console.error("Napaka pri odjavi:", error);
          navigate("/login", { replace: true });
        }}
      />

      {/* Platno */}
      <div className="flex-1 overflow-hidden relative">
        <GardenCanvas
          ref={canvasRef}
          bedPlants={bedPlants}
          plantNeighbors={plantNeighbors}
          allowBadNeighborDrop={allowBadNeighborDrop}
          showSubGrid={showSubGrid}
          activeQuickInfoId={quickInfoTargetId}
          placing={placing}
          onPlaceAt={placeAt}
          onPlantTap={(id) => {
            setQuickInfoTargetId(id);
            if (id) setSheetSnap("peek");
          }}
          onPlantInfo={(id) => {
            setQuickInfoTargetId(id);
            setSheetSnap("full");
          }}
          onRemovePlant={removePlantFromBed}
          onPlantsChanged={refreshBedPlants}
          onDragWarning={setDragWarning}
        />

        {/* Statusno območje pod zgornjo vrstico: obvestila + Razveljavi, opozorila med vlečenjem */}
        <StatusArea warning={dragWarning} />

        {/* Prazen vrt: prvi korak */}
        {showEmptyState && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 pointer-events-none">
            <div className="pointer-events-auto max-w-xs w-full rounded-2xl bg-white/95 shadow-xl border border-stone-200 p-5 text-center animate-pop-in">
              <div className="text-4xl">🪴</div>
              <p className="mt-2 font-semibold text-stone-800">Tvoj vrt je še prazen</p>
              <p className="mt-1 text-sm text-stone-500">
                Začni z gredico — velikost kasneje prilagodiš z ročaji.
              </p>
              <button
                onClick={() => setNewBedOpen(true)}
                className="mt-4 w-full py-3 rounded-xl bg-green-600 text-white font-semibold active:bg-green-700"
              >
                Dodaj prvo gredico
              </button>
              <p className="mt-3 text-xs text-stone-400">ali tapni ＋ spodaj desno ↘</p>
            </div>
          </div>
        )}

        {/* Spodnja vrstica: izbrana gredica ali sajenje */}
        {bottomBar === "bed" && selectedBed && (
          <BedActionBar
            key={selectedBed.id}
            bed={selectedBed}
            plantCount={bedPlants.filter((bp) => bp.bed_id === selectedBed.id).length}
            onPlant={() => openPlantPicker(selectedBed.id)}
            onRename={(name) => renameBed(selectedBed, name)}
            onDelete={() => deleteBed(selectedBed)}
            onClose={() => selectBed(null)}
          />
        )}
        {bottomBar === "placing" && placing && (
          <PlacementBar
            placing={placing}
            placedCount={placedCount}
            remaining={remaining}
            stockLeft={stockAtStart != null ? Math.max(0, stockAtStart - placedCount) : null}
            onDone={stopPlacing}
            onChange={() => openPlantPicker(placingBedId)}
          />
        )}

        {!placing && (
          <GardenFab
            hasBeds={beds.length > 0}
            onNewBed={() => setNewBedOpen(true)}
            onPlant={() => openPlantPicker(selectedBedId)}
            bottomOffset={bottomBar ? 196 : 20}
          />
        )}
      </div>


      <PlantSheet
        bedPlant={quickInfoTarget}
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        onClose={() => setQuickInfoTargetId(null)}
        plantNeighbors={plantNeighbors}
        allBedPlants={bedPlants}
        onUpdated={refreshBedPlants}
        onOptimisticUpdate={(field, value) => {
          if (quickInfoTargetId) applyOptimisticUpdate(quickInfoTargetId, { [field]: value });
        }}
        onRemove={removePlantFromBed}
      />

      <NewBedSheet open={newBedOpen} onClose={() => setNewBedOpen(false)} onCreate={createBed} />

      <PlantPlaceSheet
        open={plantSheetOpen}
        onClose={() => setPlantSheetOpen(false)}
        onPick={startPlacing}
        inventory={inventory}
        totalFor={totalFor}
        maxPerPlant={planApi.limits?.max_per_plant ?? null}
        targetBedName={beds.find((b) => b.id === placingBedId)?.name ?? null}
        inventoryOnly={plantFromInventory}
        onAddToInventory={() => {
          setPlantSheetOpen(false);
          setAddPlantsOpen(true);
        }}
      />

      <InventoryModal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        inventory={inventory}
        onRemove={removePlant}
        onDecrement={decrementPlant}
      />

      {/* Katalog rastlin — dodajanje v zalogo (iz menija) */}
      <PlantSelectorModal
        open={addPlantsOpen}
        onClose={() => setAddPlantsOpen(false)}
        inventory={inventory}
        onAdd={addPlant}
        maxPerPlant={planApi.limits?.max_per_plant ?? null}
        totalFor={totalFor}
        planLabel={PLAN_LABEL[planApi.plan]}
        onRemove={removePlant}
      />
    </div>
  );
};

export default GardenPage;
