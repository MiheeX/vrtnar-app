import React, { useRef, useState, useEffect } from "react";
import GardenCanvas from "../components/garden/GardenCanvas";
import type { GardenCanvasHandle } from "../components/garden/GardenCanvas";
import { useGardenStore } from "../store/useGardenStore";
import type { GardenBed } from "../types/garden";
import { Toolbar } from "../components/Toolbar";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useUserInventory } from "../hooks/useUserInventory";
//import { PlantSelectorModal } from "../components/PlantSelectorModal";
import { useGarden } from "../hooks/useGarden";
import { supabase } from "../lib/supabaseClient";
import { InventoryModal } from "../components/InventoryModal";
import { PlantPickerModal } from "../components/PlantPickerModal";
import { useBedPlants } from "../hooks/useBedPlants";
import { SettingsModal } from "../components/SettingsModal";
import type { PlantNeighbor } from "../types";

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { userId } = useCurrentUser();
  //const { inventory, addPlant, removePlant, decrementPlant, consumePlant } =
  //  useUserInventory(userId ?? "");

  const { inventory, addPlant, removePlant, decrementPlant, consumePlant } =
    useUserInventory(userId ?? "");

  const { gardenId } = useGarden(userId);

  const handleBedSelect = (bed: GardenBed) => {
    selectBed(bed.id);
    setEditName(bed.name);
  };

  const [inventoryOpen, setInventoryOpen] = useState(false);

  const [plantPickerOpen, setPlantPickerOpen] = useState(false);
  const [plantTarget, setPlantTarget] = useState<{
    bedId: string;
    cellX: number;
    cellY: number;
  } | null>(null);

  const { bedPlants, refresh: refreshBedPlants } = useBedPlants(gardenId ?? "");

  const [plantNeighbors, setPlantNeighbors] = useState<PlantNeighbor[]>([]);

  const [showSubGrid, setShowSubGrid] = useState(false);

  // TODO: kasneje iz baze/userSettings
  const allowBadNeighborDrop = false;

  useEffect(() => {
    supabase
      .from("plant_neighbors")
      .select("*")
      .then(({ data }) => {
        if (data) setPlantNeighbors(data);
      });
  }, []);

  useEffect(() => {
    const fetchBeds = async () => {
      const { data } = await supabase
        .from("beds")
        .select("*")
        .eq("garden_id", gardenId);
      if (data) useGardenStore.setState({ beds: data });
    };
    fetchBeds();
  }, [gardenId]);

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
          onSettingsOpen={() => setSettingsOpen(true)}
          onInventoryOpen={() => setInventoryOpen(true)}
        />
      </div>

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
        />
      </div>

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
              onClick={async () => {
                const { error } = await supabase
                  .from("beds")
                  .delete()
                  .eq("id", selectedBed.id);
                if (error) {
                  console.error("Delete error:", error);
                  return; // ← ta return mora biti tukaj!
                }
                removeBed(selectedBed.id);
                selectBed(null);
              }}
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
      {/* Settings modal */}
      {/*
      <PlantSelectorModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        inventory={inventory}
        onAdd={addPlant}
        onRemove={removePlant}
      />
      */}

      <SettingsModal
        showSubGrid={showSubGrid}
        onToggleSubGrid={() => setShowSubGrid((s) => !s)}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        inventory={inventory}
        onAdd={addPlant}
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
        />
      )}
    </div>
  );
};

export default GardenPage;
