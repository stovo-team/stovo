import { useEffect, useState } from "react";
import { CheckSquare, ShoppingBag, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getStorageChecklists, type Checklist } from "../api/checklist";
import type { StorageFilter } from "../pages/storageLibrary";

export function StorageChecklists({
  accessToken,
  filter,
  search,
  sourceChatId
}: {
  accessToken: string | null;
  filter: StorageFilter;
  search: string;
  sourceChatId?: string | null;
}) {
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    void getStorageChecklists(accessToken)
      .then((data) => setChecklists(Array.isArray(data) ? data : []))
      .catch(() => setChecklists([]));
  }, [accessToken, filter]);

  if (filter !== "all" && filter !== "checklists") return null;

  const rawQuery = search.trim().toLowerCase();
  const isExtensionOnly =
    rawQuery === ".checklist" ||
    rawQuery === "*.checklist" ||
    rawQuery === "checklist" ||
    rawQuery === "ext:checklist" ||
    rawQuery === "type:checklist";

  const strippedQuery = rawQuery.endsWith(".checklist")
    ? rawQuery.slice(0, -".checklist".length).replace(/^\*\.?/, "").trim()
    : rawQuery.startsWith("checklist:")
    ? rawQuery.slice("checklist:".length).trim()
    : rawQuery.startsWith("ext:checklist")
    ? rawQuery.slice("ext:checklist".length).trim()
    : rawQuery;

  const visible = checklists.filter((checklist) => {
    if (
      sourceChatId &&
      checklist.originChatId !== sourceChatId &&
      !checklist.linkedChatIds?.includes(sourceChatId)
    ) {
      return false;
    }
    if (!rawQuery) return true;
    if (isExtensionOnly) return true;
    const title = (checklist.title || "Untitled checklist").toLowerCase();
    const virtualFileName = `${title}.checklist`;
    const category = (checklist.category || "").toLowerCase();
    return (
      title.includes(rawQuery) ||
      (strippedQuery !== "" && title.includes(strippedQuery)) ||
      virtualFileName.includes(rawQuery) ||
      category.includes(rawQuery)
    );
  });

  if (visible.length === 0 && filter !== "checklists" && !isExtensionOnly) return null;

  const categoryIcon = (category: string) => {
    if (category === "groceries") return <ShoppingCart size={28} />;
    if (category === "errands") return <ShoppingBag size={28} />;
    return <CheckSquare size={28} />;
  };

  const categoryLabel = (category: string) => {
    if (category === "groceries") return "Groceries";
    if (category === "errands") return "Errands";
    return "Checklist";
  };

  return (
    <section className="storage-canvas-section" aria-label="Checklists">
      <div className="storage-files-heading">
        <h2>Checklists</h2>
      </div>
      {visible.length > 0 ? (
        <div className="storage-grid">
          {visible.map((checklist) => (
            <button
              type="button"
              className="storage-tile storage-canvas-tile"
              key={checklist.id}
              onClick={() =>
                navigate(`${getClusterPrefix()}/app/checklist/${encodeURIComponent(checklist.id)}`)
              }
            >
              <span className="storage-canvas-tile-icon">
                {categoryIcon(checklist.category)}
              </span>
              <span>
                <strong>{checklist.title}</strong>
                <small>
                  {categoryLabel(checklist.category)} • .checklist • {checklist.completedItems}/{checklist.totalItems} done
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state storage-empty-state">
          <CheckSquare size={30} />
          <strong>No checklists yet</strong>
        </div>
      )}
    </section>
  );
}
