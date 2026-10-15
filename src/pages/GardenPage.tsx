import React, { useRef, useState, useEffect } from "react";
import GardenCanvas from "../components/garden/GardenCanvas";
import type { GardenCanvasHandle } from "../components/garden/GardenCanvas";
import { useGardenStore } from "../store/useGardenStore";
import type { GardenBed } from "../types/garden";
import { Toolbar } from "../components/Toolbar";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserInventory } from "../hooks/useUserInventory";
import { useGardens } from "../hooks/useGardens";
import { useRealtimeSync } from "../hooks/useRealtimeSync";
import { usePlan } from "../hooks/usePlan";
import { startProCheckout, openBillingPortal } from "../lib/billing";
import { PLAN_LABEL } from "../lib/plans";
import { UpgradeModal } from "../components/UpgradeModal";
import { SideMenu } from "../components/SideMenu";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { InventoryModal } from "../components/InventoryModal";
import { PlantPickerModal } from "../components/PlantPickerModal";
import { useBedPlants } from "../hooks/useBedPlants";
import { PlantSelectorModal } from "../components/PlantSelectorModal";
import type { PlantNeighbor } from "../types";
import { useUserSettings } from "../hooks/useUserSettings";
import { PlantSheet } from "../components/PlantSheet";
import type { SheetSnap } from "../components/PlantSheet";

const GardenPage: React.FC = () => {
  const {
    mode,
    setMode,
    selectedBedId,
    beds,
    selectBed,
    removeBed,
    updateBed,
  } = useGardenStore();

  const selectedBed = beds.find((b) => b.id === selectedBedId) ?? null;
  const [editName, setEditName] = useState("");
  const canvasRef = useRef<GardenCanvasHandle>(null); // ← ref na canvas
  const [addPlantsOpen, setAddPlantsOpen] = useState(false);

  const { userId } = useCurrentUser();
  //const { inventory, addPlant, removePlant, decrementPlant, consumePlant } =
  //  useUserInventory(userId ?? "");

  const {
    settings,
    updateSetting,
    refresh: refreshSettings,
  } = useUserSettings(userId);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const {
    bedPlants,
    refresh: refreshBedPlants,
    applyOptimisticUpdate,
  } = useBedPlants(gardenId ?? "");

  const handleBedSelect = (bed: GardenBed) => {
    selectBed(bed.id);
    setEditName(bed.name);
    setQuickInfoTargetId(null);
  };

  //quick info
  const [quickInfoTargetId, setQuickInfoTargetId] = useState<string | null>(
    null,
  );
  const quickInfoTarget =
    bedPlants.find((b) => String(b.id) === String(quickInfoTargetId)) ?? null;

  const [inventoryOpen, setInventoryOpen] = useState(false);

  const [plantPickerOpen, setPlantPickerOpen] = useState(false);
  const [plantTarget, setPlantTarget] = useState<{
    bedId: string;
    cellX: number;
    cellY: number;
  } | null>(null);
  // Položaj plant sheeta: mali povzetek ali podrobnosti
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");

  const [plantNeighbors, setPlantNeighbors] = useState<PlantNeighbor[]>([]);

  const showSubGrid = settings.show_sub_grid;
  const allowBadNeighborDrop = settings.allow_bad_neighbor_drop;
  const [confirmDeleteBed, setConfirmDeleteBed] = useState(false);


  useEffect(() => {
    supabase
      .from("plant_neighbors")
      .select("*")
      .then(({ data }) => {
        if (data) setPlantNeighbors(data);
      });
  }, []);

  // Ob menjavi vrta počisti stanje prejšnjega in naloži njegove gredice
  useEffect(() => {
    if (!gardenId) return;
    let cancelled = false;
    canvasRef.current?.reset();
    selectBed(null);
    setQuickInfoTargetId(null);
    useGardenStore.setState({ beds: [] });
    supabase
      .from("beds")
      .select("*")
      .eq("garden_id", gardenId)
      .then(({ data, error }) => {
        if (error) console.error("Napaka pri nalaganju gredic:", error);
        if (!cancelled && data) useGardenStore.setState({ beds: data });
      });
    return () => {
      cancelled = true;
    };
  }, [gardenId, selectBed]);

  // Ponovno naloži gredice trenutnega vrta (brez čiščenja izbire)
  const gardenIdRef = useRef(gardenId);
  gardenIdRef.current = gardenId;
  const refetchBeds = async () => {
    const id = gardenId;
    if (!id) return;
    const { data, error } = await supabase
      .from("beds")
      .select("*")
      .eq("garden_id", id);
    if (error) {
      console.error("Napaka pri nalaganju gredic:", error);
      return;
    }
    // Medtem preklopljen vrt → ne prepiši gredic novega vrta
    if (data && gardenIdRef.current === id)
      useGardenStore.setState({ beds: data });
  };

  // Spremembe z drugih naprav/zavihkov se pokažejo brez osvežitve strani
  useRealtimeSync(userId, {
    gardens: () => gardensApi.refresh(),
    beds: () => {
      refetchBeds();
      gardensApi.refresh(); // število gredic v meniju
    },
    bed_plants: () => {
      refreshBedPlants();
      refreshInventory(); // posajeno šteje v omejitev na rastlino
    },
    user_plants: () => refreshInventory(),
    user_settings: () => refreshSettings(),
    profiles: () => planApi.refresh(), // paket se spremeni po Stripe webhooku
  });

  // Vrnitev iz Stripe Checkout (?checkout=success|cancel): osveži paket, počisti URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("checkout")) return;
    planApi.refresh();
    params.delete("checkout");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-screen bg-stone-50 select-none">
      {/* Toolbar */}
      <div
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Toolbar
          mode={mode}
          onModeChange={(m) => {
            canvasRef.current?.reset();
            setMode(m);
          }}
          gardenName={gardensApi.currentGarden?.name ?? "Moj vrt"}
          onMenuOpen={() => {
            gardensApi.refresh(); // sveže število gredic
            setMenuOpen(true);
          }}
          onInventoryOpen={() => setInventoryOpen(true)}
        />
      </div>

      {/* Poziv k nadgradnji — odpre ga vsaka akcija, ki preseže paket Free */}
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
        onSignOut={async () => {
          const { error } = await supabase.auth.signOut();
          if (error) console.error("Napaka pri odjavi:", error);
          navigate("/login", { replace: true });
        }}
      />

      {/* Mode hint */}
      <div
        className={`text-center text-xs py-1.5 font-medium ${
          mode === "draw"
            ? "bg-amber-50 text-amber-700"
            : "bg-green-50 text-green-700"
        }`}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {mode === "draw"
          ? "✏️ Nariši gredico z vlečenjem • Premakni z dotikom sredine • Resize z robom"
          : "✋ Premikaj pogled z vlečenjem • Tapni gredico za info • Desni klik (dolgi tap) za sajenje"}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden relative">
        <GardenCanvas
          showSubGrid={showSubGrid}
          ref={canvasRef}
          onBedSelect={handleBedSelect}
          onPlantCell={(bedId, cellX, cellY) => {
            setPlantTarget({ bedId, cellX, cellY });
            setPlantPickerOpen(true);
          }}
          onPlantsChanged={refreshBedPlants}
          bedPlants={bedPlants}
          userId={userId ?? ""}
          gardenId={gardenId ?? ""}
          onReturnToInventory={(plantId) => addPlant(plantId, 1)}
          plantNeighbors={plantNeighbors}
          allowBadNeighborDrop={allowBadNeighborDrop}
          onPlantInfo={(bedPlantId) => {
            setQuickInfoTargetId(bedPlantId);
            setSheetSnap("full");
          }}
          onPlantQuickInfo={(bedPlantId) => {
            setQuickInfoTargetId(bedPlantId);
            setSheetSnap("peek");
          }}
          onCloseBedPanel={() => selectBed(null)}
          activeQuickInfoId={quickInfoTargetId}
        />
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
          if (quickInfoTargetId)
            applyOptimisticUpdate(quickInfoTargetId, { [field]: value });
        }}
      />

      {/* Info panel — pan mode, bed selected */}
      {mode === "pan" && selectedBed && (
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-200 rounded-t-2xl shadow-lg p-4 z-20">
          <div className="flex items-center justify-between mb-3">
            <input
              className="text-lg font-semibold text-stone-800 bg-transparent border-b border-stone-300 focus:outline-none focus:border-green-500 w-48"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={async () => {
                updateBed(selectedBed.id, { name: editName });
                await supabase
                  .from("beds")
                  .update({ name: editName })
                  .eq("id", selectedBed.id);
              }}
            />
            <button
              onClick={() => selectBed(null)}
              className="text-stone-400 hover:text-stone-600 text-xl"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 text-sm text-stone-500 mb-4">
            <span>
              📐 {selectedBed.width} × {selectedBed.height} celic
            </span>
            <span>•</span>
            <span>
              📍 ({selectedBed.x}, {selectedBed.y})
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDeleteBed(true)}
              className="flex-1 py-2 rounded-xl bg-red-50 text-red-600 font-medium text-sm"
            >
              🗑️ Izbriši gredico
            </button>
          </div>
        </div>
      )}
      {/* Inventory modal*/}
      <InventoryModal
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        inventory={inventory}
        onRemove={removePlant}
        onDecrement={decrementPlant}
      />
      {/* Katalog rastlin — dodajanje v inventar (iz menija) */}
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

      {/* Plant picker modal — sajenje v gredico */}
      {plantTarget && (
        <PlantPickerModal
          open={plantPickerOpen}
          onClose={() => setPlantPickerOpen(false)}
          inventory={inventory}
          bedId={plantTarget.bedId}
          cellX={plantTarget.cellX}
          cellY={plantTarget.cellY}
          onPlanted={refreshBedPlants}
          onConsumeFromInventory={(plantId) => consumePlant(plantId, 1)}
          userId={userId ?? ""}
          gardenId={gardenId ?? ""}
          plantNeighbors={plantNeighbors}
        />
      )}

      {/* Confirm delete*/}
      {confirmDeleteBed && selectedBed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="bg-white rounded-2xl p-6 shadow-xl mx-4 w-full max-w-xs text-center flex flex-col gap-4">
            <p className="text-base font-semibold text-stone-800">
              🗑️ Izbriši gredico?
            </p>
            <p className="text-sm text-stone-500">
              Vse posajene rastline bodo odstranjene.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteBed(false)}
                className="flex-1 py-2 rounded-xl border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
              >
                Prekliči
              </button>
              <button
                onClick={async () => {
                  const { error } = await supabase
                    .from("beds")
                    .delete()
                    .eq("id", selectedBed.id);
                  if (error) {
                    console.error("Delete error:", error);
                    return;
                  }
                  removeBed(selectedBed.id);
                  selectBed(null);
                  setConfirmDeleteBed(false);
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
              >
                Izbriši
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GardenPage;
