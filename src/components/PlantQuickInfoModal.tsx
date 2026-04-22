import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { BedPlant } from "../hooks/useBedPlants";
import type { PlantInfoModalHandle } from "./PlantInfoModal";

interface Props {
  bedPlant: BedPlant | null;
  onClose: () => void;
  onOpenDetail: () => void;
  onSwipeStart?: (quickInfoTop: number) => void;
  onSwipeCommit: () => void;
  onSwipeCancel: (onDone: () => void) => void;
  plantInfoModalRef: React.RefObject<PlantInfoModalHandle | null>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Datum ni znan";
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PlantQuickInfo({
  bedPlant,
  onClose,
  onOpenDetail,
  onSwipeStart,
  onSwipeCommit,
  onSwipeCancel,
  plantInfoModalRef,
}: Props) {
  const touchStartY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const swipeStarted = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  if (!bedPlant) return null;
  const plant = bedPlant.plant;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
    swipeStarted.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    const delta = e.touches[0].clientY - touchStartY.current;

    if (delta < -10 && !swipeStarted.current) {
      swipeStarted.current = true;
      const top =
        panelRef.current?.getBoundingClientRect().top ??
        window.innerHeight * 0.75;
      // Najprej nastavi top v modalu (sinhronо, prek ref)
      plantInfoModalRef.current?.prepareOpen(top);
      // Šele potem odpri modal (React state)
      onSwipeStart?.(top);
    }

    if (swipeStarted.current) {
      plantInfoModalRef.current?.startDrag(delta);
    }

    setDragY(Math.min(20, delta));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    setIsDragging(false);
    const delta = e.changedTouches[0].clientY - touchStartY.current;

    if (swipeStarted.current) {
      if (delta < -80) {
        onSwipeCommit();
      } else {
        onSwipeCancel(() => {});
      }
    }

    swipeStarted.current = false;
    setDragY(0);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex justify-center"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg bg-white rounded-t-2xl shadow-xl px-4 pt-3 pb-6"
        style={{
          transform: `translateY(${Math.max(0, dragY)}px)`,
          transition: isDragging
            ? "none"
            : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-stone-300" />
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{plant?.img}</span>
            <div>
              <p className="font-semibold text-stone-800">{plant?.name}</p>
              {bedPlant.variety && (
                <p className="text-xs text-stone-400">· {bedPlant.variety}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-1 mb-4 text-sm text-stone-500">
          <p>🌱 {formatDate(bedPlant.planted_at)}</p>
          {bedPlant.last_watered_at && (
            <p>💧 Zalivano: {formatDate(bedPlant.last_watered_at)}</p>
          )}
        </div>

        <button
          onClick={onOpenDetail}
          className="w-full py-2.5 rounded-xl bg-stone-800 text-white text-sm font-medium"
        >
          Več info →
        </button>
      </div>
    </div>
  );
}
