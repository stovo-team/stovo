import { useEffect, useState } from "react";
import { Check, CheckSquare, ShoppingBag, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getChecklist, getStorageChecklists, type Checklist } from "../api/checklist";
import type { StorageFilter } from "../pages/storageLibrary";

function ChecklistTilePreview({ checklist }: { checklist: Checklist }) {
  const items = checklist.items || [];
  const total = checklist.totalItems || items.length;
  const completed = checklist.completedItems ?? items.filter((it) => it.completed).length;
  const progressPct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const previewItems = items.slice(0, 3);
  const remainingCount = total > previewItems.length ? total - previewItems.length : 0;

  const categoryIcon = (category: string) => {
    if (category === "groceries" || category === "grocery") return <ShoppingCart size={13} />;
    if (category === "errands" || category === "errand") return <ShoppingBag size={13} />;
    return <CheckSquare size={13} />;
  };

  const categoryLabel = (category: string) => {
    if (category === "groceries" || category === "grocery") return "Groceries";
    if (category === "errands" || category === "errand") return "Errands";
    return "Checklist";
  };

  return (
    <div className={`storage-tile-preview storage-checklist-preview category-${checklist.category || "general"}`}>
      <div className="checklist-preview-top">
        <span className="checklist-preview-badge">
          {categoryIcon(checklist.category)}
          <span>{categoryLabel(checklist.category)}</span>
        </span>
        {total > 0 && (
          <span className="checklist-preview-progress-text">
            {completed}/{total}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="checklist-preview-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="checklist-preview-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {previewItems.length > 0 ? (
        <div className="checklist-preview-content">
          <ul className="checklist-preview-items" role="list">
            {previewItems.map((item) => (
              <li
                key={item.id}
                className={`checklist-preview-item ${item.completed ? "is-completed" : ""}`}
              >
                <span className={`checklist-preview-check ${item.completed ? "is-checked" : ""}`} aria-hidden="true">
                  {item.completed ? <Check size={9} strokeWidth={3.5} /> : null}
                </span>
                <span className="checklist-preview-text">{item.text}</span>
              </li>
            ))}
          </ul>
          {remainingCount > 0 && (
            <span className="checklist-preview-more">+{remainingCount} more</span>
          )}
        </div>
      ) : (
        <div className="checklist-preview-empty">
          <span className="checklist-preview-empty-icon">{categoryIcon(checklist.category)}</span>
          <span className="checklist-preview-empty-label">No items yet</span>
        </div>
      )}
    </div>
  );
}

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
    let cancelled = false;
    void getStorageChecklists(accessToken)
      .then(async (data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setChecklists(list);

        // If any checklist has items missing but totalItems > 0, fetch full details
        const missingItems = list.filter((c) => c.totalItems > 0 && (!c.items || c.items.length === 0));
        if (missingItems.length > 0) {
          const detailed = await Promise.all(
            missingItems.map((c) => getChecklist(accessToken, c.id).catch(() => null))
          );
          if (!cancelled) {
            setChecklists((prev) =>
              prev.map((c) => {
                const found = detailed.find((d) => d && d.id === c.id);
                return found && found.items?.length ? { ...c, items: found.items } : c;
              })
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) setChecklists([]);
      });
    return () => {
      cancelled = true;
    };
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

  const categoryLabel = (category: string) => {
    if (category === "groceries" || category === "grocery") return "Groceries";
    if (category === "errands" || category === "errand") return "Errands";
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
              className="storage-tile storage-canvas-tile storage-checklist-tile"
              key={checklist.id}
              onClick={() =>
                navigate(`${getClusterPrefix()}/app/checklist/${encodeURIComponent(checklist.id)}`)
              }
            >
              <ChecklistTilePreview checklist={checklist} />
              <span className="storage-tile-info">
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
