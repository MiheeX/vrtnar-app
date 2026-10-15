import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Sprout,
  Trash2,
  X,
} from "lucide-react";
import type { GardenSummary } from "../hooks/useGardens";
import { PLAN_LABEL, type Plan } from "../lib/plans";
import { promptUpgrade } from "../store/useUpgradePrompt";

type Level = "main" | "gardens" | "settings";
type SubLevel = Exclude<Level, "main">;

interface Props {
  open: boolean;
  onClose: () => void;
  gardens: GardenSummary[];
  currentGardenId: string | null;
  plan: Plan;
  // Nadgradnja / upravljanje naročnine (Stripe); vrže napako, če plačila niso nastavljena
  onUpgrade: () => Promise<void>;
  onManageBilling: () => Promise<void>;
  maxGardens: number | null;
  atLimit: boolean;
  onSelectGarden: (id: string) => void;
  onCreateGarden: (
    name: string,
  ) => Promise<{ ok: true } | { ok: false; reason: "limit" | "error" }>;
  onRenameGarden: (id: string, name: string) => void;
  onDeleteGarden: (id: string) => Promise<boolean>;
  onAddPlants: () => void;
  showSubGrid: boolean;
  onToggleSubGrid: () => void;
  allowBadNeighborDrop: boolean;
  onToggleAllowBadNeighborDrop: () => void;
  plantFromInventory: boolean;
  onTogglePlantFromInventory: () => void;
  onSignOut: () => void;
}

const SLIDE = "transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)";
const SLIDE_MS = 280;

const SUB_TITLES: Record<SubLevel, string> = {
  gardens: "Moji vrtovi",
  settings: "Nastavitve",
};

function bedCountLabel(n: number) {
  if (n === 1) return "1 gredica";
  if (n === 2) return "2 gredici";
  if (n === 3 || n === 4) return `${n} gredice`;
  return `${n} gredic`;
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
        on ? "bg-green-500" : "bg-stone-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Stranski meni (burger) z nivoji: glavni → Moji vrtovi / Nastavitve.
// Zapre se s tapom na ozadje, X ali swipom v levo (meni sledi prstu).
export function SideMenu({
  open,
  onClose,
  gardens,
  currentGardenId,
  plan,
  onUpgrade,
  onManageBilling,
  maxGardens,
  atLimit,
  onSelectGarden,
  onCreateGarden,
  onRenameGarden,
  onDeleteGarden,
  onAddPlants,
  showSubGrid,
  onToggleSubGrid,
  allowBadNeighborDrop,
  onToggleAllowBadNeighborDrop,
  plantFromInventory,
  onTogglePlantFromInventory,
  onSignOut,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<Level>("main");
  // Zadnji podnivo ostane izrisan med animacijo nazaj
  const [subLevel, setSubLevel] = useState<SubLevel>("gardens");
  const [actionsId, setActionsId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Preusmeritev na Stripe; ob uspehu stran zapusti aplikacijo
  const handleBilling = async (action: () => Promise<void>) => {
    if (billingBusy) return;
    setBillingBusy(true);
    setBillingError(null);
    try {
      await action();
    } catch {
      setBillingError("Plačila trenutno niso na voljo. Poskusi kasneje.");
      setBillingBusy(false);
    }
  };

  const resetGardenEditing = () => {
    setActionsId(null);
    setEditingId(null);
    setConfirmDeleteId(null);
    setCreating(false);
    setNewName("");
    setMessage(null);
  };

  // Ob zaprtju (po animaciji) se vrni na glavni nivo
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setLevel("main");
      resetGardenEditing();
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [open]);

  const goTo = (next: SubLevel) => {
    resetGardenEditing();
    setSubLevel(next);
    setLevel(next);
  };

  // Swipe v levo za zapiranje — panel sledi prstu
  const swipe = useRef<{
    startX: number;
    startY: number;
    dx: number;
    horizontal: boolean | null;
  } | null>(null);

  const setPanelX = (x: number, animate: boolean) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? SLIDE : "none";
    el.style.transform = `translateX(${x}px)`;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    swipe.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      dx: 0,
      horizontal: null,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.startX;
    const dy = e.touches[0].clientY - s.startY;
    if (s.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!s.horizontal) return; // navpično = scroll seznama
    s.dx = Math.min(0, dx);
    setPanelX(s.dx, false);
  };

  const onTouchEnd = () => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.horizontal) return;
    const width = panelRef.current?.offsetWidth ?? 300;
    if (s.dx < -width * 0.3) {
      onClose();
    } else {
      setPanelX(0, true);
    }
  };

  // Odpiranje/zapiranje z animacijo
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = SLIDE;
    el.style.transform = open ? "translateX(0)" : "translateX(-100%)";
  }, [open]);

  const startRename = (g: GardenSummary) => {
    setActionsId(null);
    setEditingId(g.id);
    setEditName(g.name);
  };

  const commitRename = () => {
    if (editingId) onRenameGarden(editingId, editName);
    setEditingId(null);
  };

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await onCreateGarden(newName);
    setBusy(false);
    if (result.ok) {
      onClose();
    } else if (result.reason === "limit") {
      setCreating(false);
      promptUpgrade("gardens");
    } else {
      setMessage("Vrta ni bilo mogoče ustvariti. Poskusi znova.");
    }
  };

  const handleDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    const ok = await onDeleteGarden(id);
    setBusy(false);
    setConfirmDeleteId(null);
    if (!ok) setMessage("Vrta ni bilo mogoče izbrisati.");
  };

  const currentGarden = gardens.find((g) => g.id === currentGardenId);
  const isSub = level !== "main";

  // ── Nivo: glavni ────────────────────────────────────────────────────
  const mainLevel = (
    <div className="px-2 py-2">
      <button
        onClick={() => goTo("gardens")}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-stone-100"
      >
        <Sprout size={20} className="text-green-600 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] text-stone-800">Moji vrtovi</span>
          {currentGarden && (
            <span className="block text-xs text-stone-400 truncate">
              {currentGarden.name}
            </span>
          )}
        </span>
        <ChevronRight size={18} className="text-stone-300 shrink-0" />
      </button>

      <button
        onClick={() => {
          onClose();
          onAddPlants();
        }}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-stone-100"
      >
        <Plus size={20} className="text-stone-500 shrink-0" />
        <span className="flex-1 text-[15px] text-stone-800">Dodaj rastline</span>
      </button>

      <button
        onClick={() => goTo("settings")}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-stone-100"
      >
        <Settings size={20} className="text-stone-500 shrink-0" />
        <span className="flex-1 text-[15px] text-stone-800">Nastavitve</span>
        <ChevronRight size={18} className="text-stone-300 shrink-0" />
      </button>

      {/* Naročnina */}
      <div className="mt-2 pt-2 border-t border-stone-100">
        {plan === "pro" ? (
          <button
            onClick={() => handleBilling(onManageBilling)}
            disabled={billingBusy}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left active:bg-stone-100 disabled:opacity-50"
          >
            <CreditCard size={20} className="text-stone-500 shrink-0" />
            <span className="flex-1 text-[15px] text-stone-800">Naročnina Pro</span>
          </button>
        ) : (
          <button
            onClick={() => handleBilling(onUpgrade)}
            disabled={billingBusy}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left bg-amber-50 active:bg-amber-100 disabled:opacity-50"
          >
            <Sparkles size={20} className="text-amber-600 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-amber-800">
                Nadgradi na Pro
              </span>
              <span className="block text-xs text-amber-700">
                Več vrtov in rastlin
              </span>
            </span>
          </button>
        )}
        {billingError && (
          <p className="px-3 pt-1 text-xs text-red-500">{billingError}</p>
        )}
      </div>
    </div>
  );

  // ── Nivo: Moji vrtovi ──────────────────────────────────────────────
  const gardensLevel = (
    <>
      {maxGardens !== null && (
        <p className="px-4 pt-3 text-xs text-stone-400">
          {gardens.length} / {maxGardens} vrtov · paket {PLAN_LABEL[plan]}
        </p>
      )}

      <ul className="px-2 pt-2">
        {gardens.map((g) => {
          const isCurrent = g.id === currentGardenId;
          const isEditing = editingId === g.id;
          return (
            <li key={g.id} className="mb-1">
              <div
                className={`flex items-center rounded-xl ${
                  isCurrent ? "bg-green-50" : "active:bg-stone-100"
                }`}
              >
                {isEditing ? (
                  <form
                    className="flex-1 flex items-center gap-2 px-3 py-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitRename();
                    }}
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={commitRename}
                      maxLength={60}
                      className="flex-1 min-w-0 text-base border-b border-green-500 bg-transparent focus:outline-none py-1"
                    />
                    <button
                      type="submit"
                      aria-label="Shrani ime"
                      className="p-2 text-green-600"
                    >
                      <Check size={20} />
                    </button>
                  </form>
                ) : (
                  <button
                    className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-left"
                    onClick={() => {
                      onSelectGarden(g.id);
                      onClose();
                    }}
                  >
                    <Sprout
                      size={20}
                      className={`shrink-0 ${isCurrent ? "text-green-600" : "text-stone-400"}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block truncate text-[15px] ${
                          isCurrent
                            ? "font-semibold text-green-800"
                            : "text-stone-700"
                        }`}
                      >
                        {g.name}
                      </span>
                      <span className="block text-xs text-stone-400">
                        {bedCountLabel(g.bedCount)}
                      </span>
                    </span>
                    {isCurrent && (
                      <Check size={18} className="text-green-600 shrink-0" />
                    )}
                  </button>
                )}
                {!isEditing && (
                  <button
                    aria-label="Možnosti vrta"
                    className="p-3 text-stone-400 active:text-stone-700"
                    onClick={() =>
                      setActionsId(actionsId === g.id ? null : g.id)
                    }
                  >
                    <MoreHorizontal size={20} />
                  </button>
                )}
              </div>

              {/* Možnosti vrta */}
              {actionsId === g.id && confirmDeleteId !== g.id && (
                <div className="flex gap-2 px-3 py-2">
                  <button
                    onClick={() => startRename(g)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-700 active:bg-stone-50"
                  >
                    <Pencil size={15} /> Preimenuj
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(g.id)}
                    disabled={gardens.length <= 1}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-red-200 text-sm text-red-600 active:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 size={15} /> Izbriši
                  </button>
                </div>
              )}

              {/* Potrditev brisanja */}
              {confirmDeleteId === g.id && (
                <div className="mx-3 my-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm text-red-800 font-medium">
                    Izbrišem „{g.name}“?
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Izbrisane bodo tudi vse gredice in rastline v tem vrtu.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-2 rounded-lg border border-stone-200 bg-white text-sm text-stone-600"
                    >
                      Prekliči
                    </button>
                    <button
                      onClick={() => handleDelete(g.id)}
                      disabled={busy}
                      className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      Izbriši
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Nov vrt */}
      <div className="px-4 pt-1 pb-4">
        {creating ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ime vrta, npr. Vikend"
              maxLength={60}
              className="flex-1 min-w-0 border rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-green-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              Ustvari
            </button>
          </form>
        ) : (
          <button
            onClick={() => {
              setMessage(null);
              // Omejitev paketa dosežena → poziv k nadgradnji namesto obrazca
              if (atLimit) promptUpgrade("gardens");
              else setCreating(true);
            }}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium ${
              atLimit
                ? "border-stone-200 text-stone-400 active:bg-stone-50"
                : "border-green-300 text-green-700 active:bg-green-50"
            }`}
          >
            <Plus size={18} /> Nov vrt
          </button>
        )}
        {atLimit && !creating && (
          <div className="mt-2 text-center">
            <p className="text-xs text-stone-400">
              Paket {PLAN_LABEL[plan]} omogoča največ {maxGardens}{" "}
              {maxGardens === 1 ? "vrt" : "vrtov"}.
            </p>
            {plan === "free" && (
              <button
                onClick={() => promptUpgrade("gardens")}
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"
              >
                <Sparkles size={12} /> Nadgradi na Pro za več vrtov
              </button>
            )}
          </div>
        )}
        {message && (
          <p className="text-xs text-red-500 mt-2 text-center">{message}</p>
        )}
      </div>
    </>
  );

  // ── Nivo: Nastavitve ───────────────────────────────────────────────
  const settingsLevel = (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between gap-3 py-3 border-b border-stone-100">
        <div>
          <p className="text-[15px] text-stone-800">Podmreža v gredicah</p>
          <p className="text-xs text-stone-400 mt-0.5">
            Prikaži podmrežo v gredicah
          </p>
        </div>
        <Toggle
          on={showSubGrid}
          onClick={onToggleSubGrid}
          label="Podmreža v gredicah"
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-3 border-b border-stone-100">
        <div>
          <p className="text-[15px] text-stone-800">Sajenje ob slabih sosedih</p>
          <p className="text-xs text-stone-400 mt-0.5">
            Dovoli sajenje zraven slabih sosedov
          </p>
        </div>
        <Toggle
          on={allowBadNeighborDrop}
          onClick={onToggleAllowBadNeighborDrop}
          label="Sajenje ob slabih sosedih"
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-3 border-b border-stone-100">
        <div>
          <p className="text-[15px] text-stone-800">Sadi iz zaloge</p>
          <p className="text-xs text-stone-400 mt-0.5">
            Pri sajenju so na voljo samo rastline iz zaloge — vsaka posajena porabi eno.
            Izklopljeno: vse rastline iz kataloga.
          </p>
        </div>
        <Toggle
          on={plantFromInventory}
          onClick={onTogglePlantFromInventory}
          label="Sadi iz zaloge"
        />
      </div>
      {/* Navedba avtorjev za Twemoji ikone (licenca CC-BY 4.0) */}
      <p className="pt-4 text-[11px] text-stone-400">
        Ikone emojijev:{" "}
        <a
          href="https://github.com/jdecked/twemoji"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Twemoji
        </a>{" "}
        (CC-BY 4.0)
      </p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ pointerEvents: open ? "auto" : "none" }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* Ozadje */}
      <div
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute top-0 bottom-0 left-0 w-[85vw] max-w-xs bg-white shadow-xl flex flex-col"
        style={{ transform: "translateX(-100%)", touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* Glava: logo na glavnem nivoju, nazaj + naslov na podnivoju */}
        <div className="flex-shrink-0 flex items-center justify-between px-2 pt-3 pb-2 border-b border-stone-100 min-h-[56px]">
          {isSub ? (
            <button
              onClick={() => setLevel("main")}
              className="flex items-center gap-1 pl-1 pr-3 py-2 rounded-xl active:bg-stone-100"
              aria-label="Nazaj"
            >
              <ChevronLeft size={22} className="text-stone-500" />
              <span className="font-semibold text-stone-800 text-lg">
                {SUB_TITLES[subLevel]}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2">
              <span className="text-2xl">🌱</span>
              <span className="font-bold text-green-700 text-lg">Vrtnar</span>
              <span
                className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${
                  plan === "pro"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-stone-100 text-stone-500"
                }`}
              >
                {PLAN_LABEL[plan]}
              </span>
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Zapri meni"
            className="p-2 text-stone-400 hover:text-stone-600"
          >
            <X size={22} />
          </button>
        </div>

        {/* Nivoji drsijo levo/desno */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            style={{
              transform: isSub ? "translateX(-30%)" : "translateX(0)",
              opacity: isSub ? 0 : 1,
              transition: `${SLIDE}, opacity 0.2s`,
              pointerEvents: isSub ? "none" : "auto",
            }}
            aria-hidden={isSub}
          >
            {mainLevel}
          </div>
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain bg-white"
            style={{
              transform: isSub ? "translateX(0)" : "translateX(100%)",
              transition: SLIDE,
              pointerEvents: isSub ? "auto" : "none",
            }}
            aria-hidden={!isSub}
          >
            {subLevel === "gardens" ? gardensLevel : settingsLevel}
          </div>
        </div>

        {/* Odjava na dnu */}
        <div className="flex-shrink-0 border-t border-stone-100 px-2 py-2 pb-safe">
          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] text-stone-500 active:bg-stone-100"
          >
            <LogOut size={20} /> Odjava
          </button>
        </div>
      </div>
    </div>
  );
}
