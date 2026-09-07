import { useEffect, useState } from "react";
import { CheckSquare, ShoppingBag, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getClusterPrefix } from "../api/client";
import { getStorageChecklists, type Checklist } from "../api/checklist";
import type { StorageFilter } from "../pages/storageLibrary";

export function StorageChecklists({
  accessToken,
  filter,
  search
}: {
  accessToken: string | null;
  filter: StorageFilter;
  search: string;
}) {
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    void getStorageChecklists(accessToken).then(setChecklists).catch(() => setChecklists([]));
  }, [accessToken]);

  if (filter !== "all" && filter !== "checklists") return null;
  const query = search.trim().toLocaleLowerCase();
  const visible = query
    ? checklists.filter((cl) => cl.title.toLocaleLowerCase().includes(query))
    : checklists;
  if (visible.length === 0 && filter !== "checklists") return null;

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
                  {categoryLabel(checklist.category)} • {checklist.completedItems}/{checklist.totalItems} done
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
