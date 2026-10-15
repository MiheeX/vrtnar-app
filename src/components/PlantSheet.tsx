import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Droplets, Trash2 } from "lucide-react";
import type { BedPlant } from "../hooks/useBedPlants";
import type { PlantNeighbor } from "../types";
import { supabase } from "../lib/supabaseClient";
import { PlantIcon } from "./PlantIcon";

// Bottom sheet za rastlino z dvema položajema (kot Google Maps):
// "peek" = mali povzetek na dnu, "full" = podrobnosti čez skoraj cel zaslon.
// Isti element sledi prstu 1:1, ob spustu se zaskoči na najbližji položaj
// (ali glede na hitrost swipa). Swipe dol iz "peek" zapre sheet.
export type SheetSnap = "peek" | "full";

interface Props {
  bedPlant: BedPlant | null;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onClose: () => void;
  plantNeighbors: PlantNeighbor[];
  allBedPlants: BedPlant[];
  onUpdated: () => void;
  onOptimisticUpdate: (
    field: "variety" | "notes",
    value: string | null,
  ) => void;
  // Odstrani rastlino iz gredice (z možnostjo razveljavitve)
  onRemove?: (bedPlantId: string) => void;
}

const SNAP_TRANSITION = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
const ANIM_MS = 300;
// Hitrost swipa (px/ms), nad katero swipe premakne na naslednji položaj
const FLICK_VELOCITY = 0.5;
// Premik prsta (px), preden se odločimo med vlečenjem sheeta in scrollom
const DRAG_SLOP = 6;

function formatDate(dateStr: string | null, empty: string): string {
  if (!dateStr) return empty;
  return new Date(dateStr).toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24),
  );
}

export function PlantSheet(props: Props) {
  if (!props.bedPlant) return null;
  return <PlantSheetInner {...props} bedPlant={props.bedPlant} />;
}

function PlantSheetInner({
  bedPlant,
  snap,
  onSnapChange,
  onClose,
  plantNeighbors,
  allBedPlants,
  onUpdated,
  onOptimisticUpdate,
  onRemove,
}: Props & { bedPlant: BedPlant }) {
  const [variety, setVariety] = useState(bedPlant.variety ?? "");
  const [notes, setNotes] = useState(bedPlant.notes ?? "");
  const [viewportH, setViewportH] = useState(window.innerHeight);
  const [peekH, setPeekH] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const safeAreaRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(window.innerHeight); // trenutni translateY v px
  const shownRef = useRef(false);
  const closingRef = useRef(false);

  const sheetH = Math.round(viewportH * 0.9);
  const peekOffset = Math.max(0, sheetH - peekH);
  const offsetFor = (s: SheetSnap) => (s === "full" ? 0 : peekOffset);

  // Sveže vrednosti za native event listenerje
  const live = useRef({ snap, sheetH, peekOffset, onSnapChange, onClose });
  live.current = { snap, sheetH, peekOffset, onSnapChange, onClose };

  // Neposredno nastavi pozicijo (brez React renderja med vlečenjem)
  const applyOffset = (y: number, animate: boolean) => {
    offsetRef.current = y;
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    const transition = animate ? SNAP_TRANSITION : "none";
    if (sheet) {
      sheet.style.transition = transition;
      sheet.style.transform = `translateY(${y}px)`;
    }
    if (backdrop) {
      const { peekOffset: peek } = live.current;
      // 0 v "peek", 1 v "full"
      const progress = peek > 0 ? Math.min(1, Math.max(0, 1 - y / peek)) : 1;
      backdrop.style.transition = animate ? "opacity 0.3s" : "none";
      backdrop.style.opacity = String(progress);
    }
  };
  const applyRef = useRef(applyOffset);
  applyRef.current = applyOffset;

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    applyRef.current(live.current.sheetH, true);
    setTimeout(() => live.current.onClose(), ANIM_MS);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Nova rastlina ali sprememba z druge naprave → naloži polja,
  // razen tistega, ki ga uporabnik prav zdaj ureja
  const varietyRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (document.activeElement !== varietyRef.current)
      setVariety(bedPlant.variety ?? "");
  }, [bedPlant.id, bedPlant.variety]);
  useEffect(() => {
    if (document.activeElement !== notesRef.current)
      setNotes(bedPlant.notes ?? "");
  }, [bedPlant.id, bedPlant.notes]);

  // Višina zaslona (tipkovnica, rotacija, Firefox URL bar)
  useEffect(() => {
    const onResize = () => setViewportH(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Izmeri višino "peek" dela (+ safe area spodaj)
  useLayoutEffect(() => {
    const el = peekRef.current;
    if (!el) return;
    const measure = () =>
      setPeekH(el.offsetHeight + (safeAreaRef.current?.offsetHeight ?? 0));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Premakni sheet na položaj iz props (prvič z animacijo od spodaj)
  useLayoutEffect(() => {
    if (peekH === 0 || closingRef.current) return;
    const target = offsetFor(snap);
    if (!shownRef.current) {
      shownRef.current = true;
      applyOffset(sheetH, false);
      sheetRef.current?.getBoundingClientRect(); // reflow pred animacijo
    }
    applyOffset(target, true);
    if (snap === "peek" && scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, peekH, sheetH]);

  // Spust prsta/miške: izberi položaj glede na hitrost ali najbližjega
  const releaseRef = useRef((velocity: number) => {
    void velocity;
  });
  releaseRef.current = (velocity: number) => {
    const { snap: current, peekOffset: peek, sheetH: h } = live.current;
    const y = offsetRef.current;
    let target: SheetSnap | "closed";
    if (velocity > FLICK_VELOCITY) target = y < peek ? "peek" : "closed";
    else if (velocity < -FLICK_VELOCITY) target = "full";
    else if (y < peek / 2) target = "full";
    else if (y < peek + (h - peek) / 2) target = "peek";
    else target = "closed";

    if (target === "closed") {
      closeRef.current();
    } else if (target === current) {
      applyRef.current(target === "full" ? 0 : peek, true);
    } else {
      live.current.onSnapChange(target);
    }
  };

  // Touch: native listenerji, ker touchmove potrebuje preventDefault (React je passive)
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    let startY = 0;
    let startOffset = 0;
    let inScroll = false;
    let decided: "drag" | "scroll" | null = null;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closingRef.current) return;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
      startOffset = offsetRef.current;
      inScroll = !!scrollRef.current?.contains(e.target as Node);
      decided = null;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || closingRef.current) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (decided === null) {
        if (Math.abs(dy) < DRAG_SLOP) return;
        // V "full" se vsebina scrolla; sheet vlečemo le dol, ko je vsebina na vrhu
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        const scrollContent =
          live.current.snap === "full" && inScroll && (scrollTop > 0 || dy < 0);
        decided = scrollContent ? "scroll" : "drag";
        startY = y; // brez skoka za DRAG_SLOP
      }
      if (decided !== "drag") return;
      e.preventDefault();
      let next = startOffset + (y - startY);
      if (next < 0) next = next / 3; // upor nad vrhom
      applyRef.current(next, false);
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
    };

    const onEnd = (e: TouchEvent) => {
      if (decided !== "drag") return;
      decided = null;
      // Prst se je ustavil pred spustom → ni flick
      const v = e.timeStamp - lastT > 100 ? 0 : velocity;
      releaseRef.current(v);
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // Miška: vlečenje za zgornji del (handle + glava), za desktop
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, input, textarea")) return;
    const startY = e.clientY;
    const startOffset = offsetRef.current;
    let lastY = startY;
    let lastT = e.timeStamp;
    let velocity = 0;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) < DRAG_SLOP) return;
      moved = true;
      let next = startOffset + dy;
      if (next < 0) next = next / 3;
      applyRef.current(next, false);
      const dt = ev.timeStamp - lastT;
      if (dt > 0) velocity = (ev.clientY - lastY) / dt;
      lastY = ev.clientY;
      lastT = ev.timeStamp;
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (moved) releaseRef.current(ev.timeStamp - lastT > 100 ? 0 : velocity);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const plant = bedPlant.plant;
  const isFull = snap === "full";
  const daysSinceWatered = daysSince(bedPlant.last_watered_at);
  const daysSincePlanted = daysSince(bedPlant.planted_at);

  const neighborIds = plantNeighbors
    .filter(
      (pn) =>
        pn.plant_id === bedPlant.plant_id ||
        pn.neighbor_id === bedPlant.plant_id,
    )
    .reduce<{ good: string[]; bad: string[] }>(
      (acc, pn) => {
        const otherId =
          pn.plant_id === bedPlant.plant_id ? pn.neighbor_id : pn.plant_id;
        if (pn.relationship === "good") acc.good.push(otherId);
        else if (pn.relationship === "bad") acc.bad.push(otherId);
        return acc;
      },
      { good: [], bad: [] },
    );

  const getNeighborPlants = (ids: string[]) => [
    ...new Map(
      allBedPlants
        .filter((bp) => ids.includes(bp.plant_id) && bp.plant)
        .map((bp) => [bp.plant_id, bp.plant!]),
    ).values(),
  ];

  const goodNeighbors = getNeighborPlants(neighborIds.good);
  const badNeighbors = getNeighborPlants(neighborIds.bad);

  const saveField = async (field: "variety" | "notes", value: string) => {
    onOptimisticUpdate(field, value || null);
    const { error } = await supabase
      .from("bed_plants")
      .update({ [field]: value || null })
      .eq("id", bedPlant.id);
    if (error) console.error("Napaka pri shranjevanju rastline:", error);
  };

  const waterPlant = async () => {
    const { error } = await supabase
      .from("bed_plants")
      .update({ last_watered_at: new Date().toISOString() })
      .eq("id", bedPlant.id);
    if (error) console.error("Napaka pri zalivanju:", error);
    onUpdated();
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Ozadje — vidno samo v "full", tap ga vrne na "peek" */}
      <div
        ref={backdropRef}
        className="fixed inset-0 z-40 bg-black/40"
        style={{ opacity: 0, pointerEvents: isFull ? "auto" : "none" }}
        onClick={() => onSnapChange("peek")}
      />

      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div
          ref={sheetRef}
          className="pointer-events-auto w-full max-w-lg bg-white rounded-t-2xl shadow-xl flex flex-col overflow-hidden"
          style={{
            height: sheetH,
            transform: `translateY(${sheetH}px)`,
            willChange: "transform",
          }}
        >
          {/* Peek del: vedno viden na dnu zaslona */}
          <div
            ref={peekRef}
            className="flex-shrink-0 px-4 pb-4 cursor-grab active:cursor-grabbing"
            onMouseDown={onHeaderMouseDown}
          >
            <div className="flex justify-center pt-3 pb-3">
              <div className="w-10 h-1 rounded-full bg-stone-300" />
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <PlantIcon icon={plant?.icon} emoji={plant?.img} size={36} title={plant?.name} />
                <div>
                  <p className="font-semibold text-stone-800 text-lg leading-tight">
                    {plant?.name}
                  </p>
                  {bedPlant.variety && (
                    <p className="text-xs text-stone-400">{bedPlant.variety}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {onRemove && (
                  <button
                    onClick={() => onRemove(bedPlant.id)}
                    aria-label="Odstrani iz gredice"
                    className="p-2 rounded-full text-stone-400 hover:text-red-600 active:bg-red-50"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                <button
                  onClick={close}
                  aria-label="Zapri"
                  className="p-1 text-stone-400 hover:text-stone-600"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1 mb-4 text-sm text-stone-500">
              <p>🌱 {formatDate(bedPlant.planted_at, "Datum ni znan")}</p>
              {bedPlant.last_watered_at && (
                <p>
                  💧 Zalivano: {formatDate(bedPlant.last_watered_at, "—")}
                </p>
              )}
            </div>

            {/* Isti gumb razširi ali skrči sheet (višina peek dela ostane enaka) */}
            <button
              onClick={() => onSnapChange(isFull ? "peek" : "full")}
              className="w-full py-2.5 rounded-xl bg-stone-800 text-white text-sm font-medium"
            >
              {isFull ? "Manj info ↓" : "Več info ↑"}
            </button>
          </div>

          {/* Za izračun safe area (Firefox/iOS spodnja vrstica) */}
          <div
            ref={safeAreaRef}
            aria-hidden
            className="absolute"
            style={{ height: "env(safe-area-inset-bottom, 0px)" }}
          />

          {/* Podrobnosti — scroll samo v "full" */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 px-4 pt-2 pb-safe flex flex-col gap-5 border-t border-stone-200"
            style={{
              overflowY: isFull ? "auto" : "hidden",
              overscrollBehavior: "contain",
            }}
          >
            {/* Zalivanje */}
            <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-2">
                <Droplets size={18} className="text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Zalivanje</p>
                  <p className="text-xs text-blue-500">
                    {bedPlant.last_watered_at
                      ? daysSinceWatered === 0
                        ? "Danes"
                        : `Pred ${daysSinceWatered} dnevi`
                      : "Še ni bilo zalivano"}
                  </p>
                </div>
              </div>
              <button
                onClick={waterPlant}
                className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                💧 Zalij
              </button>
            </div>

            {/* Sajenje info */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                Podatki sajenja
              </p>
              <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
                <p className="text-xs text-stone-400">Sorta</p>
                <input
                  ref={varietyRef}
                  value={variety}
                  onChange={(e) => setVariety(e.target.value)}
                  onBlur={() => saveField("variety", variety)}
                  className="text-sm font-medium text-stone-700 bg-transparent focus:outline-none w-full mt-0.5"
                  placeholder="npr. Cherry, Roma..."
                />
              </div>
              <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
                <p className="text-xs text-stone-400">Posajeno</p>
                <p className="text-sm font-medium text-stone-700 mt-0.5">
                  {formatDate(bedPlant.planted_at, "—")}
                  {daysSincePlanted !== null && (
                    <span className="text-xs text-stone-400 ml-2">
                      ({daysSincePlanted} dni)
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Opombe */}
            <div className="p-3 rounded-xl border border-stone-200 bg-stone-50">
              <p className="text-xs text-stone-400">Opombe</p>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => saveField("notes", notes)}
                rows={3}
                className="text-sm text-stone-600 bg-transparent focus:outline-none w-full resize-none"
                placeholder="Ni opomb. Tapni za pisanje..."
              />
            </div>

            {/* Sosedje */}
            {(goodNeighbors.length > 0 || badNeighbors.length > 0) && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                  Sosedje v tem vrtu
                </p>
                {goodNeighbors.length > 0 && (
                  <div className="p-3 rounded-xl border border-green-200 bg-green-50">
                    <p className="text-xs text-green-600 font-medium mb-1.5">
                      ✅ Dobri sosedje
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {goodNeighbors.map((p) => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs text-stone-700 border border-green-200"
                        >
                          <PlantIcon icon={p.icon} emoji={p.img} size={16} /> {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {badNeighbors.length > 0 && (
                  <div className="p-3 rounded-xl border border-red-200 bg-red-50">
                    <p className="text-xs text-red-600 font-medium mb-1.5">
                      ❌ Slabi sosedje
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {badNeighbors.map((p) => (
                        <span
                          key={p.id}
                          className="flex items-center gap-1 px-2 py-1 bg-white rounded-lg text-xs text-stone-700 border border-red-200"
                        >
                          <PlantIcon icon={p.icon} emoji={p.img} size={16} /> {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Dimenzije */}
            <div className="flex flex-col gap-2 pb-4">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">
                Prostorske zahteve
              </p>
              <div className="flex gap-2">
                <div className="flex-1 p-3 rounded-xl border border-stone-200 bg-stone-50 text-center">
                  <p className="text-lg font-bold text-stone-700">
                    {plant?.cells_spacing}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Velikost (cel.)
                  </p>
                </div>
                <div className="flex-1 p-3 rounded-xl border border-stone-200 bg-stone-50 text-center">
                  <p className="text-lg font-bold text-stone-700">
                    {plant?.around_cells_spacing}
                  </p>
                  <p className="text-xs text-stone-400 mt-0.5">Odmik (cel.)</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
