import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, FileText, Folder, Forward, Image, LockKeyhole, Music2, Pencil, Plus, Settings2, Trash2, Upload, Users, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { User } from "../api/auth";
import { getChats, sendCollectionMessage, type Chat } from "../api/chats";
import { getMembers, getServerRoles, type ServerRole } from "../api/family";
import { downloadFileBlob, formatFileSize, uploadFile, type FamilyFile } from "../api/files";
import { addCollectionItem, createCollection, deleteCollection, deleteCollectionGrant, getCollectionGrants, getCollectionItems, getCollections, removeCollectionItem, saveCollectionGrant, updateCollection, type CollectionAccessLevel, type CollectionContentType, type CollectionGrant, type CollectionKind, type StorageCollection } from "../api/collections";
import { loadCachedStorageItemsFromLocalStorage, saveCachedStorageItems } from "../fileLibraryCache";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import { storageFileKind } from "../pages/storageLibrary";
import { peekCachedObjectUrl } from "../mediaBlobCache";
import { ForwardChatDialog } from "../features/chats/conversation/MessageDialogs";
import { BackButton } from "./BackButton";
import { PopupDialog } from "./ui/Popup";
import { PopupButton } from "./ui/PopupButton";
import { PopupField } from "./ui/PopupField";
import { PopupSelect } from "./ui/PopupSelect";
import { useStrings } from "../i18n/LanguageContext";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";
import { EntityAvatar } from "./EntityAvatar";
import { SymbolColorControls } from "./SymbolColorControls";
import { AVATAR_SYMBOL_COMPONENTS } from "./avatarSymbols";

const iconFor = (file: FamilyFile) => storageFileKind(file) === "audio" ? Music2 : storageFileKind(file) === "photos" || storageFileKind(file) === "videos" ? Image : FileText;
const extensionLabel = (file: FamilyFile) => {
  const extension = file.originalName.split(".").pop()?.toUpperCase() ?? "FILE";
  if (extension === "DOCX" || extension === "DOC") return "DOC";
  if (extension === "XLSX" || extension === "XLS") return "XLS";
  return extension.length <= 5 ? extension : "FILE";
};
const typeLabel = (item: StorageCollection, copy: ReturnType<typeof useStrings>["files"]["collections"]) => item.displayKind === "music-album" ? copy.musicAlbum : item.displayKind === "album" ? copy.photoAlbum : copy.fileFolder;
type CoverIconName = keyof typeof AVATAR_SYMBOL_COMPONENTS;
const coverIconOptions = Object.entries(AVATAR_SYMBOL_COMPONENTS).map(([value, Icon]) => ({ value: value as CoverIconName, Icon }));
const COVER_PREFERENCES_KEY = "stovo:storage-collection-covers";
function loadCoverPreferences(): Record<string, { icon: CoverIconName; color: string }> {
  try { return JSON.parse(window.localStorage.getItem(COVER_PREFERENCES_KEY) ?? "{}"); } catch { return {}; }
}
function saveCoverPreference(id: string, icon: CoverIconName, color: string) {
  try { window.localStorage.setItem(COVER_PREFERENCES_KEY, JSON.stringify({ ...loadCoverPreferences(), [id]: { icon, color } })); } catch { /* storage may be unavailable */ }
}
const contentTypeOptions: Exclude<CollectionContentType, "custom">[] = ["mixed", "media", "audio", "documents"];
const allowsContentType = (contentType: CollectionContentType, file: FamilyFile, customFileTypes = "") => {
  const fileKind = storageFileKind(file);
  if (contentType === "custom") return customFileTypes.split(",").some((pattern) => { const suffix = pattern.trim().toLowerCase().replace(/^\*\./, "."); return suffix.length > 1 && file.originalName.toLowerCase().endsWith(suffix); });
  return contentType === "mixed" || (contentType === "media" && (fileKind === "photos" || fileKind === "videos")) || (contentType === "audio" && fileKind === "audio") || (contentType === "documents" && fileKind === "documents");
};
export type StorageCollectionPickerRequest = {
  collectionId: string;
  collectionTitle: string;
  lockedFileIds: string[];
  allowedFileIds: string[];
  onConfirm: (ids: string[]) => Promise<void>;
};
function StorageMemberAvatar({ accessToken, member }: { accessToken: string; member: User }) {
  return <EntityAvatar accessToken={accessToken} className="storage-access-member-avatar" entityId={member.id} entityKind="person" file={member.profilePhoto} label={member.displayName} mode={member.avatarMode} symbolId={member.avatarSymbolId} colorId={member.avatarColorId} />;
}
function AccessPrincipalPicker({ accessToken, members, roles, value, onChange }: { accessToken: string; members: User[]; roles: ServerRole[]; value: string; onChange: (value: string) => void }) {
  const copy = useStrings().files.collections;
  const options = [
    ...members.map((member) => ({ value: `user:${member.id}`, label: member.displayName })),
    ...roles.map((role) => ({ value: `role:${role.id}`, label: `${copy.rolePrefix} ${role.name} (${copy.roleMembers(role.memberCount)})` })),
  ];
  return <div className="storage-access-principal-picker"><p>{copy.chooseAccess}</p><PopupSelect ariaLabel={copy.accessLevel} options={options} value={value} onChange={onChange} placeholder={copy.addPersonOrRole} emptyMessage={copy.addPersonOrRole} renderOption={(option: { value: string; label: string; disabled?: boolean }) => { const member = members.find((candidate) => option.value === `user:${candidate.id}`); return <span className="storage-access-option">{member && <StorageMemberAvatar accessToken={accessToken} member={member} />}<span>{option.label}</span></span>; }} /></div>;
}
function AllowedFileTypePicker({ value, customFileTypes, onChange }: { value: CollectionContentType; customFileTypes: string; onChange: (value: CollectionContentType, customFileTypes?: string) => void }) {
  const copy = useStrings().files.collections;
  const [customOpen, setCustomOpen] = useState(value === "custom"); const [customTypes, setCustomTypes] = useState(customFileTypes);
  useEffect(() => { setCustomOpen(value === "custom"); setCustomTypes(customFileTypes); }, [value, customFileTypes]);
  return <section className="storage-settings-section"><h3>{copy.allowedTypes}</h3><p>{copy.chooseTypesHelp}</p><div className="storage-content-type-options">{contentTypeOptions.map((type) => <button type="button" key={type} className={value === type ? "is-selected" : ""} onClick={() => onChange(type)}><strong>{copy.contentTypes[type].label}</strong><small>{copy.contentTypes[type].description}</small></button>)}<button type="button" className={value === "custom" || customOpen ? "is-selected" : ""} onClick={() => setCustomOpen(true)}><strong>{copy.custom}</strong><small>{copy.customPatternsHelp}</small></button></div>{customOpen && <div className="storage-custom-file-types"><PopupField label={copy.allowedPatterns} value={customTypes} placeholder={copy.patternPlaceholder} onChange={(event: ChangeEvent<HTMLInputElement>) => setCustomTypes(event.target.value)} /><p>{copy.commaPatterns} <code>{copy.patternExamples}</code>.</p><PopupButton variant="primary" disabled={!customTypes.trim()} onClick={() => onChange("custom", customTypes)}>{copy.applyCustomTypes}</PopupButton></div>}</section>;
}
function Cover({ collection, token, file }: { collection: StorageCollection; token: string; file: FamilyFile | null }) {
  const url = useFilePreviewUrl(token, file, Boolean(file));
  const preference = loadCoverPreferences()[collection.id];
  const Icon = preference ? coverIconOptions.find((option) => option.value === preference.icon)?.Icon ?? Folder : collection.displayKind === "music-album" ? Music2 : collection.displayKind === "album" ? Image : Folder;
  return <span className={`storage-collection-cover storage-collection-cover--${collection.displayKind}`} style={preference && !url ? { backgroundColor: preference.color } : undefined}>{url ? <img src={url} alt="" /> : <Icon size={25} />}</span>;
}
function matches(collection: StorageCollection, filter: string) {
  if (filter === "all" || filter === "favorites") return true;
  if (filter === "audio") return collection.contentType === "audio";
  if (filter === "documents") return collection.displayKind === "folder" || collection.contentType === "documents";
  return collection.contentType === "media";
}
function AddFromStorage({ files, token, onAdd, onClose }: { files: FamilyFile[]; token: string; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const copy = useStrings().files.collections;
  const [query, setQuery] = useState(""); const [picked, setPicked] = useState<string[]>([]);
  const visible = files.filter((file) => file.originalName.toLowerCase().includes(query.toLowerCase()));
  return <PopupDialog className="storage-file-picker-popover storage-page" ariaLabel={copy.selectFromStorage} onClose={onClose} size="xl"><header><div><h3>{copy.storage}</h3><p>{copy.selectFilesHelp}</p></div></header><PopupField label={copy.searchStorage} labelHidden autoFocus value={query} onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)} /><div className="storage-grid storage-picker-grid">{visible.map((file) => <StoragePickerTile key={file.id} token={token} file={file} active={picked.includes(file.id)} onClick={() => setPicked((all) => all.includes(file.id) ? all.filter((id) => id !== file.id) : [...all, file.id])} />)}</div><footer><PopupButton variant="secondary" onClick={onClose}>{copy.cancel}</PopupButton><PopupButton variant="primary" disabled={!picked.length} onClick={() => onAdd(picked)}>{copy.addFiles(picked.length)}</PopupButton></footer></PopupDialog>;
}
function StoragePickerTile({ file, token, active, onClick }: { file: FamilyFile; token: string; active: boolean; onClick: () => void }) { const preview = useFilePreviewUrl(token, file, storageFileKind(file) === "photos"); const Icon = iconFor(file); return <button type="button" className={`storage-tile ${storageFileKind(file)}${active ? " selected" : ""}`} data-file-type={extensionLabel(file)} onClick={onClick}>{preview ? <img src={preview} alt={file.originalName} /> : <div className="storage-file-type-icon"><Icon size={42} /><b>{extensionLabel(file)}</b></div>}<span><strong>{file.originalName}</strong><small>{formatFileSize(file.sizeBytes)}</small></span></button>; }
function CollectionFileCard({ file, token, editable, onRemove, onOpen }: { file: FamilyFile; token: string; editable: boolean; onRemove: () => void; onOpen: () => void }) {
  const copy = useStrings().files.collections;
  const preview = useFilePreviewUrl(token, file, storageFileKind(file) === "photos");
  const Icon = iconFor(file);
  return <article className={`storage-tile collection-file-tile ${storageFileKind(file)}`} data-file-type={extensionLabel(file)}><button type="button" className="collection-file-open" aria-label={file.originalName} onClick={onOpen} />{preview ? <img src={preview} alt={file.originalName} /> : <div className="storage-file-type-icon"><Icon size={42} /><b>{extensionLabel(file)}</b></div>}<span><strong>{file.originalName}</strong><small>{formatFileSize(file.sizeBytes)}</small></span>{editable && <button type="button" aria-label={copy.removeFile(file.originalName)} title={copy.removeFile(file.originalName)} onClick={onRemove}><X size={14} /></button>}</article>;
}

export function StorageCollections({ accessToken, files, filter, currentUserId, onFilesChanged, onSelectFromStorage, groupByChat = false, groupFallbackLabel, onPreviewFile }: { accessToken: string | null; files: FamilyFile[]; filter: string; currentUserId?: string; onFilesChanged?: () => void; onSelectFromStorage?: (request: StorageCollectionPickerRequest) => void; groupByChat?: boolean; groupFallbackLabel?: string; onPreviewFile?: (file: FamilyFile) => void }) {
  const copy = useStrings().files.collections;
  const avatarCopy = useStrings().avatarChoices;
  const navigate = useNavigate();
  const location = useLocation();
  const [collections, setCollections] = useState<StorageCollection[]>(() => currentUserId ? loadCachedStorageItemsFromLocalStorage<StorageCollection>(currentUserId, "collections") ?? [] : []); const [selected, setSelected] = useState<StorageCollection | null>(null); const [items, setItems] = useState<FamilyFile[]>([]); const [grants, setGrants] = useState<CollectionGrant[]>([]); const [members, setMembers] = useState<User[]>([]); const [roles, setRoles] = useState<ServerRole[]>([]); const [chats, setChats] = useState<Chat[]>([]); const [creating, setCreating] = useState(false); const [settings, setSettings] = useState(false); const [adding, setAdding] = useState(false); const [coverMenu, setCoverMenu] = useState(false); const [coverColor, setCoverColor] = useState<string>(DESIGN_COLOR_VALUES.avatarPalette.blue); const [coverIcon, setCoverIcon] = useState<CoverIconName>("folder"); const [renaming, setRenaming] = useState(false); const [forwarding, setForwarding] = useState<StorageCollection | null>(null); const [confirmingDelete, setConfirmingDelete] = useState(false); const [title, setTitle] = useState(""); const [kind, setKind] = useState<CollectionKind>("folder"); const [grantTarget, setGrantTarget] = useState(""); const [grantLevel, setGrantLevel] = useState<CollectionAccessLevel>("viewer"); const [forwardChatIds, setForwardChatIds] = useState<string[]>([]); const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null); const coverUploadRef = useRef<HTMLInputElement>(null); const requested = useMemo(() => new URLSearchParams(location.search).get("collection"), [location.search]); const opened = useRef(false);
  const load = async () => { if (accessToken) setCollections(await getCollections(accessToken)); };
  useEffect(() => { setCollections(currentUserId ? loadCachedStorageItemsFromLocalStorage<StorageCollection>(currentUserId, "collections") ?? [] : []); }, [currentUserId]);
  useEffect(() => { if (currentUserId) void saveCachedStorageItems(currentUserId, "collections", collections); }, [collections, currentUserId]);
  useEffect(() => { void load().catch(() => setError(copy.loadFailed)); }, [accessToken]);
  useEffect(() => { if (!accessToken) return; void Promise.all([getMembers(accessToken), getServerRoles(accessToken), getChats(accessToken)]).then(([m, r, c]) => { setMembers(m); setRoles(r); setChats(c); }); }, [accessToken]);
  const open = async (collection: StorageCollection) => { if (!accessToken) return; const preference = loadCoverPreferences()[collection.id]; setCoverIcon(preference?.icon ?? "folder"); setCoverColor(preference?.color ?? DESIGN_COLOR_VALUES.avatarPalette.blue); setSelected(collection); setSettings(false); const [nextItems, nextGrants] = await Promise.all([getCollectionItems(accessToken, collection.id), collection.accessLevel === "editor" ? getCollectionGrants(accessToken, collection.id) : Promise.resolve([])]); setItems(nextItems); setGrants(nextGrants); };
  useEffect(() => { opened.current = false; }, [requested]);
  useEffect(() => { const collection = requested ? collections.find((item) => item.id === requested) : null; if (collection && !opened.current) { opened.current = true; void open(collection); } }, [collections, requested]);
  const updateSelected = (next: StorageCollection) => { setSelected(next); setCollections((all) => all.map((item) => item.id === next.id ? next : item)); };
  const create = async () => { if (!accessToken || !title.trim()) return; const contentType: CollectionContentType = kind === "music-album" ? "audio" : kind === "album" ? "media" : "mixed"; try { const next = await createCollection(accessToken, { title: title.trim(), displayKind: kind, contentType }); saveCoverPreference(next.id, coverIcon, coverColor); setCollections((all) => [next, ...all]); setCreating(false); setTitle(""); await open(next); } catch { setError(copy.createFailed); } };
  const add = async (id: string, privateFile = false) => { if (!accessToken || !selected) return; const file = await addCollectionItem(accessToken, selected.id, id, privateFile); setItems((all) => [file, ...all.filter((item) => item.id !== file.id)]); setCollections((all) => all.map((item) => item.id === selected.id ? { ...item, itemCount: item.itemCount + (items.some((item) => item.id === file.id) ? 0 : 1) } : item)); };
  const addMany = async (ids: string[]) => { try { for (const id of ids) await add(id); setAdding(false); } catch { setError(copy.addSomeFailed); } };
  const requestStorageSelection = () => { if (!selected) return; onSelectFromStorage?.({ collectionId: selected.id, collectionTitle: selected.title, lockedFileIds: items.map((file) => file.id), allowedFileIds: files.filter((file) => allowsContentType(selected.contentType, file, selected.customFileTypes)).map((file) => file.id), onConfirm: addMany }); };
  const upload = async (event: ChangeEvent<HTMLInputElement>, asCover = false) => { if (!accessToken || !selected) return; const newFiles = Array.from(event.target.files ?? []); event.target.value = ""; try { for (const file of newFiles) { const next = await uploadFile(accessToken, file); await add(next.id, true); if (asCover && file.type.startsWith("image/")) updateSelected(await updateCollection(accessToken, selected.id, { coverFileId: next.id })); } onFilesChanged?.(); } catch { setError(copy.uploadFailed); } };
  const remove = async (id: string) => { if (!accessToken || !selected) return; await removeCollectionItem(accessToken, selected.id, id); setItems((all) => all.filter((file) => file.id !== id)); };
  const saveName = async () => { if (!accessToken || !selected || !title.trim()) return; updateSelected(await updateCollection(accessToken, selected.id, { title: title.trim() })); setTitle(""); };
  const saveCover = async (id: string) => { if (accessToken && selected) updateSelected(await updateCollection(accessToken, selected.id, { coverFileId: id || null })); };
  const saveContentType = async (contentType: CollectionContentType, customFileTypes = "") => { if (!accessToken || !selected || (selected.contentType === contentType && selected.customFileTypes === customFileTypes)) return; try { updateSelected(await updateCollection(accessToken, selected.id, { contentType, customFileTypes })); } catch { setError(copy.typesUpdateFailed); } };
  const saveGrant = async () => { if (!accessToken || !selected || !grantTarget) return; const [principalType, principalId] = grantTarget.split(":") as ["user" | "role", string]; const grant = await saveCollectionGrant(accessToken, selected.id, { principalType, principalId, accessLevel: grantLevel }); setGrants((all) => [...all.filter((item) => item.principalType !== principalType || item.principalId !== principalId), grant]); setGrantTarget(""); };
  const removeGrant = async (grant: CollectionGrant) => { if (!accessToken || !selected) return; await deleteCollectionGrant(accessToken, selected.id, grant); setGrants((all) => all.filter((item) => item.principalType !== grant.principalType || item.principalId !== grant.principalId)); };
  const forward = async () => { if (!accessToken || !forwarding || !forwardChatIds.length) return; const destinations = forwardChatIds; try { await Promise.all(destinations.map((chatId) => sendCollectionMessage(accessToken, chatId, forwarding.id))); setForwarding(null); setForwardChatIds([]); if (destinations.length === 1) navigate(`/app/chats/${destinations[0]}`); } catch { setError(copy.forwardFailed); } };
  const erase = async () => { if (!accessToken || !selected) return; await deleteCollection(accessToken, selected.id); setCollections((all) => all.filter((item) => item.id !== selected.id)); setSelected(null); };
  if (!accessToken) return null;
  const visible = collections.filter((item) => matches(item, filter)); const label = filter === "audio" ? copy.musicAlbums : filter === "documents" ? copy.folders : filter === "photos" || filter === "videos" ? copy.albums : copy.foldersAlbums; const available = files.filter((file) => !items.some((item) => item.id === file.id));
  const groupedCollections = groupByChat ? visible.reduce<Array<{ label: string; collections: StorageCollection[] }>>((groups, collection) => {
    const source = files.find((file) => file.id === collection.coverFileId);
    const label = source?.chatTitle || groupFallbackLabel || copy.folders;
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.collections.push(collection);
    else groups.push({ label, collections: [collection] });
    return groups;
  }, []) : [];
  const renderCollection = (collection: StorageCollection) => <article className="storage-collection-card" key={collection.id}><button className="storage-collection-open" onClick={() => void open(collection)}><Cover collection={collection} token={accessToken} file={files.find((file) => file.id === collection.coverFileId) ?? null} /><span><strong>{collection.title}</strong><small>{copy.items(collection.itemCount, typeLabel(collection, copy))}</small></span>{collection.accessLevel === "viewer" && <LockKeyhole size={15} />}</button><button className="storage-collection-forward" onClick={() => { setForwardChatIds([]); setForwarding(collection); }} title={copy.forwardToChats}><Forward size={20} /></button></article>;
  const current = selected as StorageCollection;
  const CustomCoverIcon = coverIconOptions.find((option) => option.value === coverIcon)?.Icon ?? Folder;
  if (Boolean(selected)) return <section className="storage-collection-full-page" aria-label={current.title}>
    <header className="storage-collection-full-header">
      <BackButton className="storage-collection-back" ariaLabel={copy.backStorage} title={copy.backStorage} onClick={() => setSelected(null)} />
      <div className="storage-collection-full-title">
        <div className="storage-cover-menu-wrap"><button type="button" className="storage-collection-cover-edit" title={copy.changeCover} onClick={() => setCoverMenu((value) => !value)}>{current.coverFileId ? <Cover collection={current} token={accessToken} file={files.find((file) => file.id === current.coverFileId) ?? null} /> : <span className="storage-collection-cover storage-custom-cover" style={{ backgroundColor: coverColor }}><CustomCoverIcon size={25} /></span>}<span className="storage-cover-edit-mark"><Pencil size={16} /></span></button>{coverMenu && <div className="storage-cover-menu"><SymbolColorControls symbols={coverIconOptions.map(({ value, Icon }) => ({ id: value, label: avatarCopy.symbolNames[value], icon: <Icon /> }))} symbol={coverIcon} onSymbolChange={(id) => { const icon = id as CoverIconName; setCoverIcon(icon); saveCoverPreference(current.id, icon, coverColor); }} colors={Object.entries(DESIGN_COLOR_VALUES.avatarPalette).map(([id, color]) => ({ id: color, label: avatarCopy.colorNames[id as keyof typeof avatarCopy.colorNames], value: color }))} color={coverColor} onColorChange={(color) => { setCoverColor(color); saveCoverPreference(current.id, coverIcon, color); }} /><button type="button" className="storage-cover-upload" onClick={() => coverUploadRef.current?.click()}>{copy.uploadCustomCover}</button></div>}</div>
        <div>{renaming ? <input aria-label={copy.folderName} autoFocus value={title || current.title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim()) void saveName(); setRenaming(false); }} /> : <div className="storage-collection-name"><strong>{current.title}</strong><button type="button" aria-label={copy.renameFolder} onClick={() => setRenaming(true)}><Pencil size={14} /></button></div>}<small>{copy.items(current.itemCount, typeLabel(current, copy))}</small></div>
      </div>
      <div className="storage-collection-full-actions">{current.accessLevel === "editor" && <><button type="button" className="storage-round-icon" title={copy.addFromStorage} onClick={requestStorageSelection}><Plus size={19} /></button><button type="button" className="storage-round-icon" title={copy.uploadFiles} onClick={() => uploadRef.current?.click()}><Upload size={18} /></button></>}<button type="button" className="storage-round-icon" title={copy.settings} onClick={() => setSettings((value) => !value)}><Settings2 size={18} /></button></div>
    </header>
    <input ref={uploadRef} className="visually-hidden" type="file" multiple onChange={(event) => void upload(event)} /><input ref={coverUploadRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => void upload(event, true)} />
    <div className="storage-collection-file-grid">{items.map((file) => <CollectionFileCard key={file.id} file={file} token={accessToken} editable={current.accessLevel === "editor"} onOpen={() => onPreviewFile?.(file)} onRemove={() => void remove(file.id)} />)}{!items.length && <p className="storage-collection-empty">{copy.noFiles}</p>}</div>
    {settings && (
      <PopupDialog
        className="storage-collection-dialog storage-collection-settings-dialog"
        ariaLabel={copy.settings}
        onClose={() => setSettings(false)}
        size="md"
      >
        <h2>{copy.settings}</h2>
        <section className="storage-settings-section">
          <h3><Users size={17} /> {copy.access}</h3>
          <p>{copy.peopleCanOpen}</p>
          <div className="storage-collection-sharing">
            {grants.map((grant) => (
              <div key={`${grant.principalType}:${grant.principalId}`}>
                <span>{grant.principalType === "user" ? members.find((member) => member.id === grant.principalId)?.displayName ?? copy.member : roles.find((role) => role.id === grant.principalId)?.name ?? copy.role} · {grant.accessLevel}</span>
                <button type="button" className="storage-round-icon" aria-label={copy.removeAccess} onClick={() => void removeGrant(grant)}><X size={16} /></button>
              </div>
            ))}
          </div>
          <AccessPrincipalPicker accessToken={accessToken} members={members} roles={roles} value={grantTarget} onChange={setGrantTarget} />
          <div className="storage-collection-grant">
            <select value={grantLevel} aria-label={copy.accessLevel} onChange={(event: ChangeEvent<HTMLSelectElement>) => setGrantLevel(event.target.value as CollectionAccessLevel)}>
              <option value="viewer">{copy.viewer}</option>
              <option value="editor">{copy.editor}</option>
            </select>
            <PopupButton variant="primary" disabled={!grantTarget} onClick={() => void saveGrant()}>{copy.addAccess}</PopupButton>
          </div>
        </section>
        <AllowedFileTypePicker value={current.contentType} customFileTypes={current.customFileTypes} onChange={(contentType, customFileTypes) => void saveContentType(contentType, customFileTypes)} />
        <PopupButton variant="danger" startIcon={<Trash2 size={16} />} onClick={() => setConfirmingDelete(true)}>{copy.delete}</PopupButton>
      </PopupDialog>
    )}
    {adding && <AddFromStorage token={accessToken} files={available.filter((file) => allowsContentType(current.contentType, file, current.customFileTypes))} onClose={() => setAdding(false)} onAdd={(ids) => void addMany(ids)} />}
    {confirmingDelete && (
      <PopupDialog
        className="storage-collection-dialog storage-confirm-dialog"
        ariaLabel={copy.deleteQuestion}
        onClose={() => setConfirmingDelete(false)}
        size="sm"
      >
        <h2>{copy.deleteQuestion}</h2>
        <p>{copy.deleteDescription}</p>
        <div>
          <PopupButton variant="secondary" onClick={() => setConfirmingDelete(false)}>{copy.cancel}</PopupButton>
          <PopupButton variant="danger" onClick={() => void erase()}>{copy.delete}</PopupButton>
        </div>
      </PopupDialog>
    )}
  </section>;
  return <section className="storage-collections"><div className="storage-collections-heading"><h2>{label}</h2><button className="storage-collection-new" onClick={() => setCreating(true)}><Plus size={16} /></button></div>{groupByChat ? <div className="storage-collection-groups">{groupedCollections.map((group) => <section className="storage-collection-group" data-chat-group={group.label} key={group.label}><h3 className="storage-group-heading">{group.label}</h3><div className="storage-collections-row">{group.collections.map(renderCollection)}</div></section>)}</div> : <div className="storage-collections-row">{visible.map(renderCollection)}</div>}
    {creating && (
      <PopupDialog
        className="storage-collection-dialog storage-collection-create"
        ariaLabel={copy.newFolder}
        onClose={() => setCreating(false)}
        size="sm"
      >
        <h2>{copy.newFolder}</h2>
        <PopupField label={copy.title} autoFocus value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} />
        <div className="storage-create-cover-picker"><span>{copy.cover}</span><div className="storage-create-cover-preview" style={{ backgroundColor: coverColor }}>{(() => { const Icon = coverIconOptions.find((option) => option.value === coverIcon)?.Icon ?? Folder; return <Icon size={25} />; })()}</div><SymbolColorControls symbols={coverIconOptions.map(({ value, Icon }) => ({ id: value, label: avatarCopy.symbolNames[value], icon: <Icon /> }))} symbol={coverIcon} onSymbolChange={(id) => setCoverIcon(id as CoverIconName)} colors={Object.entries(DESIGN_COLOR_VALUES.avatarPalette).map(([id, color]) => ({ id: color, label: avatarCopy.colorNames[id as keyof typeof avatarCopy.colorNames], value: color }))} color={coverColor} onColorChange={setCoverColor} /></div>
        <div className="storage-popup-select-field">
          <label id="storage-collection-kind-label">{copy.type}</label>
          <PopupSelect
            labelledBy="storage-collection-kind-label"
            value={kind}
            onChange={(value: string) => setKind(value as CollectionKind)}
            options={[{ value: "folder", label: copy.fileFolder }, { value: "album", label: copy.photoAlbum }, { value: "music-album", label: copy.musicAlbum }]}
          />
        </div>
        <div className="storage-collection-create-actions"><PopupButton variant="secondary" onClick={() => { setCreating(false); setTitle(""); }}>{copy.cancel}</PopupButton><PopupButton variant="primary" disabled={!title.trim()} onClick={() => void create()}>{copy.create}</PopupButton></div>
      </PopupDialog>
    )}
    {selected && (
      <PopupDialog
        className="storage-collection-dialog storage-collection-detail"
        ariaLabel={selected.title}
        onClose={() => setSelected(null)}
      >
        {!settings ? (
          <>
            <header className="storage-collection-inner-header">
              <Cover collection={selected} token={accessToken} file={files.find((file) => file.id === selected.coverFileId) ?? null} />
              <div><h2>{selected.title}</h2><p>{copy.items(selected.itemCount, typeLabel(selected, copy))}</p></div>
              <div className="storage-collection-header-actions">
                {selected.accessLevel === "editor" && (
                  <>
                    <button className="storage-round-icon" onClick={() => setAdding(true)}><Plus size={19} /></button>
                    <button className="storage-round-icon" onClick={() => uploadRef.current?.click()}><Upload size={18} /></button>
                  </>
                )}
                <button className="storage-round-icon" onClick={() => setSettings(true)}><Settings2 size={18} /></button>
              </div>
            </header>
            <input ref={uploadRef} className="visually-hidden" type="file" multiple onChange={(e) => void upload(e)} />
            <div className="storage-collection-file-grid">
              {items.map((file) => {
                const Icon = iconFor(file);
                return (
                  <article key={file.id}>
                    <span><Icon size={26} /></span>
                    <strong>{file.originalName}</strong>
                    <small>{formatFileSize(file.sizeBytes)}</small>
                    {selected.accessLevel === "editor" && <button onClick={() => void remove(file.id)}><X size={14} /></button>}
                  </article>
                );
              })}
              {!items.length && <p className="storage-collection-empty">{copy.noFiles}</p>}
            </div>
          </>
        ) : (
          <>
            <header className="storage-collection-settings-header">
              <button className="storage-round-icon" onClick={() => setSettings(false)}><ChevronLeft size={19} /></button>
              <div><h2>{copy.settings}</h2><p>{typeLabel(selected, copy)}</p></div>
            </header>
            <section className="storage-settings-section">
              <h3>{copy.name}</h3>
              <div className="storage-collection-controls">
                <input placeholder={selected.title} value={title} onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)} />
                <button className="storage-pill-button" disabled={!title.trim()} onClick={() => void saveName()}>{copy.save}</button>
              </div>
            </section>
            <section className="storage-settings-section">
              <h3>{copy.cover}</h3>
              <div className="storage-cover-controls">
                <Cover collection={selected} token={accessToken} file={files.find((file) => file.id === selected.coverFileId) ?? null} />
                <select value={selected.coverFileId ?? ""} onChange={(e: ChangeEvent<HTMLSelectElement>) => void saveCover(e.target.value)}>
                  <option value="">{copy.defaultIcon}</option>
                  {items.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}
                </select>
                <button className="storage-pill-button" onClick={() => coverUploadRef.current?.click()}>{copy.uploadCover}</button>
                <input ref={coverUploadRef} className="visually-hidden" type="file" accept="image/*" onChange={(e) => void upload(e, true)} />
              </div>
            </section>
            <section className="storage-settings-section">
              <h3><Users size={17} /> {copy.access}</h3>
              <p>{copy.peopleRoles}</p>
              <div className="storage-collection-sharing">
                {grants.map((grant) => (
                  <div key={`${grant.principalType}:${grant.principalId}`}>
                    <span>{grant.principalType === "user" ? members.find((m) => m.id === grant.principalId)?.displayName ?? copy.member : roles.find((r) => r.id === grant.principalId)?.name ?? copy.role} · {grant.accessLevel}</span>
                    <button className="storage-round-icon" onClick={() => void removeGrant(grant)}><X size={15} /></button>
                  </div>
                ))}
                <div className="storage-collection-grant">
                  <select value={grantTarget} onChange={(e: ChangeEvent<HTMLSelectElement>) => setGrantTarget(e.target.value)}>
                    <option value="">{copy.addPersonOrRole}</option>
                    {members.map((m) => <option key={m.id} value={`user:${m.id}`}>{m.displayName}</option>)}
                    {roles.map((r) => <option key={r.id} value={`role:${r.id}`}>{copy.rolePrefix} {r.name}</option>)}
                  </select>
                  <select value={grantLevel} onChange={(e: ChangeEvent<HTMLSelectElement>) => setGrantLevel(e.target.value as CollectionAccessLevel)}>
                    <option value="viewer">{copy.viewer}</option>
                    <option value="editor">{copy.editor}</option>
                  </select>
                  <button className="storage-pill-button" onClick={() => void saveGrant()}>{copy.addAccess}</button>
                </div>
              </div>
            </section>
            <section className="storage-settings-section">
              <h3>{copy.allowedTypes}</h3>
              <p>{selected.displayKind === "music-album" ? copy.musicFiles : selected.displayKind === "album" ? copy.photosVideos : copy.anyFileType}</p>
            </section>
            <section className="storage-settings-section">
              <h3>{copy.folderSize}</h3>
              <p>{copy.noFileLimit}</p>
            </section>
            <PopupButton variant="danger" startIcon={<Trash2 size={16} />} onClick={() => setConfirmingDelete(true)}>{copy.delete}</PopupButton>
          </>
        )}
      </PopupDialog>
    )}
    {adding && <AddFromStorage token={accessToken} files={available} onClose={() => setAdding(false)} onAdd={(ids) => void addMany(ids)} />}
    {forwarding && <ForwardChatDialog title={copy.forwardTitle(forwarding.title)} accessToken={accessToken} currentUserId={currentUserId} chats={chats} selectedChatIds={forwardChatIds} onToggle={(chatId) => setForwardChatIds((ids) => ids.includes(chatId) ? ids.filter((id) => id !== chatId) : [...ids, chatId])} onForward={() => void forward()} onClose={() => { setForwardChatIds([]); setForwarding(null); }} />}
    {confirmingDelete && (
      <PopupDialog
        className="storage-collection-dialog storage-confirm-dialog"
        ariaLabel={copy.deleteQuestion}
        onClose={() => setConfirmingDelete(false)}
        size="sm"
      >
        <h2>{copy.deleteQuestion}</h2>
        <p>{copy.deleteDescription}</p>
        <div>
          <PopupButton variant="secondary" onClick={() => setConfirmingDelete(false)}>{copy.cancel}</PopupButton>
          <PopupButton variant="danger" onClick={() => void erase()}>{copy.delete}</PopupButton>
        </div>
      </PopupDialog>
    )}
    {error && <p className="error-text storage-collection-error">{error}</p>}
  </section>;
}
